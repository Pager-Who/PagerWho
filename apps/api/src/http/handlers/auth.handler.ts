import {
  CompletePasswordResetRequestSchema,
  ConfirmEmailVerificationRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResendEmailVerificationRequestSchema,
  StartPasswordResetRequestSchema,
  type AuthenticatedUser,
} from "@im/contracts";
import { Prisma, prisma, type TransactionClient } from "@im/db";
import { recordActivityLog } from "@im/backend-core";
import type { RequestHandler } from "express";

import {
  clearAuthSessionCookie,
  createAuthSession,
  revokeAuthSession,
  setAuthSessionCookie,
} from "../auth/auth-session";
import { sendAuthEmail } from "../auth/auth-email";
import {
  createAuthToken,
  hashAuthToken,
  hashPassword,
  verifyPassword,
} from "../auth/password-credentials";
import {
  buildOidcErrorRedirectUrl,
  completeOidcAuthorization,
  createOidcAuthorizationRedirect,
  getActiveAuthProvider,
} from "../auth/oidc-flow";
import { getActorAuthSource, getRequiredActorUserId } from "../auth/user-context";
import { HttpError } from "../errors/http-error";

const emailVerificationTtlMs = 1000 * 60 * 60 * 24;
const passwordResetTtlMs = 1000 * 60 * 30;
const passwordResetCooldownMs = 1000 * 60 * 3;
const defaultNotificationChannels = ["email", "sms", "phone"] as const;

export const listAuthProvidersHandler: RequestHandler = async (_req, res, next) => {
  try {
    res.json({
      data: {
        active_provider: getActiveAuthProvider(),
        email_password_enabled: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAuthMeHandler: RequestHandler = async (req, res, next) => {
  try {
    const userId = getRequiredActorUserId(req);
    const user = await findAuthenticatedUserById(userId);
    const platformRoles = await listPlatformRoles(userId);

    res.json({
      data: {
        user,
        auth_source: getActorAuthSource(req),
        is_platform_admin: platformRoles.includes("platform_admin"),
        platform_roles: platformRoles,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const registerHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = RegisterRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_register_request", "Invalid register request", parsedBody.error.flatten());
    }

    const input = parsedBody.data;
    const passwordHash = await hashPassword(input.password);
    const verificationToken = createAuthToken();
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: {
          email: input.email,
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        throw new HttpError(409, "email_already_registered", "Email is already registered");
      }

      const created = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordCredential: {
            create: {
              passwordHash,
            },
          },
        },
        select: authenticatedUserSelect,
      });

      await ensureDefaultNotificationPreferences(tx, created.id);
      await createEmailVerificationToken(tx, created.id, created.email, verificationToken);
      await recordAuthActivity(tx, {
        action: "auth.registered",
        message: "User registered",
        resourceId: created.id,
      });

      return created;
    });

    await sendAuthEmail({
      email: user.email,
      kind: "email_verification",
      name: user.name,
      token: verificationToken,
    });

    res.status(201).json({
      data: {
        email_verification_required: false,
        user: mapAuthenticatedUser(user),
      },
    });
  } catch (error) {
    next(mapAuthError(error));
  }
};

export const loginHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = LoginRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_login_request", "Invalid login request", parsedBody.error.flatten());
    }

    const user = await prisma.user.findUnique({
      where: {
        email: parsedBody.data.email,
      },
      select: {
        ...authenticatedUserSelect,
        passwordCredential: {
          select: {
            passwordHash: true,
          },
        },
      },
    });

    if (!user?.passwordCredential || !(await verifyPassword(parsedBody.data.password, user.passwordCredential.passwordHash))) {
      await recordAuthActivity(prisma, {
        action: "auth.login_failed",
        message: "User login failed",
        metadata: {
          email: parsedBody.data.email,
          reason: "invalid_credentials",
        },
        resourceId: user?.id ?? null,
      });
      throw new HttpError(401, "invalid_credentials", "Invalid email or password");
    }

    if (user.suspendedAt) {
      await recordAuthActivity(prisma, {
        action: "auth.login_failed",
        message: "User login failed",
        metadata: {
          email: parsedBody.data.email,
          reason: "user_suspended",
        },
        resourceId: user.id,
      });
      throw new HttpError(403, "user_suspended", "User account is suspended");
    }

    const session = await createAuthSession(user.id, req);
    setAuthSessionCookie(res, session.token, session.expiresAt);
    await recordAuthActivity(prisma, {
      action: "auth.login_succeeded",
      actorUserId: user.id,
      message: "User logged in",
      metadata: {
        email_verified: Boolean(user.emailVerifiedAt),
      },
      resourceId: user.id,
    });

    res.json({
      data: {
        session: {
          expires_at: session.expiresAt.toISOString(),
          id: session.id,
        },
        user: mapAuthenticatedUser(user),
      },
    });
  } catch (error) {
    next(mapAuthError(error));
  }
};

export const resendEmailVerificationHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = ResendEmailVerificationRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_email_verification_request", "Invalid email verification request", parsedBody.error.flatten());
    }

    const token = createAuthToken();
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: {
          email: parsedBody.data.email,
        },
        select: authenticatedUserSelect,
      });

      if (!existing || existing.emailVerifiedAt) {
        return null;
      }

      await createEmailVerificationToken(tx, existing.id, existing.email, token);

      return existing;
    });

    if (user) {
      await sendAuthEmail({
        email: user.email,
        kind: "email_verification",
        name: user.name,
        token,
      });
    }

    res.json({
      data: {
        accepted: true,
      },
    });
  } catch (error) {
    next(mapAuthError(error));
  }
};

export const confirmEmailVerificationHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = ConfirmEmailVerificationRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_email_verification_request", "Invalid email verification request", parsedBody.error.flatten());
    }

    const user = await prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({
        where: {
          tokenHash: hashAuthToken(parsedBody.data.token),
        },
        include: {
          user: {
            select: authenticatedUserSelect,
          },
        },
      });

      if (!token || token.usedAt || token.expiresAt <= new Date()) {
        throw new HttpError(400, "email_verification_token_invalid", "Email verification token is invalid or expired");
      }

      const verified = await tx.user.update({
        where: {
          id: token.userId,
        },
        data: {
          emailVerifiedAt: new Date(),
        },
        select: authenticatedUserSelect,
      });
      await tx.emailVerificationToken.update({
        where: {
          id: token.id,
        },
        data: {
          usedAt: new Date(),
        },
      });
      await recordAuthActivity(tx, {
        action: "auth.email_verified",
        actorUserId: verified.id,
        message: "User email verified",
        resourceId: verified.id,
      });

      return verified;
    });

    res.json({
      data: {
        user: mapAuthenticatedUser(user),
      },
    });
  } catch (error) {
    next(mapAuthError(error));
  }
};

export const startPasswordResetHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = StartPasswordResetRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_password_reset_request", "Invalid password reset request", parsedBody.error.flatten());
    }

    const token = createAuthToken();
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: {
          email: parsedBody.data.email,
        },
        select: {
          ...authenticatedUserSelect,
          passwordCredential: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!existing?.passwordCredential) {
        return null;
      }

      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('password-reset'), hashtext(${existing.id}))
      `;

      const recentToken = await tx.passwordResetToken.findFirst({
        where: {
          userId: existing.id,
          createdAt: {
            gte: new Date(Date.now() - passwordResetCooldownMs),
          },
        },
        select: {
          id: true,
        },
      });

      if (recentToken) {
        return null;
      }

      await tx.passwordResetToken.deleteMany({
        where: {
          userId: existing.id,
          usedAt: null,
        },
      });
      await tx.passwordResetToken.create({
        data: {
          expiresAt: new Date(Date.now() + passwordResetTtlMs),
          tokenHash: hashAuthToken(token),
          userId: existing.id,
        },
      });

      return existing;
    });

    if (user) {
      await sendAuthEmail({
        email: user.email,
        kind: "password_reset",
        name: user.name,
        token,
      });
    }

    res.json({
      data: {
        accepted: true,
      },
    });
  } catch (error) {
    next(mapAuthError(error));
  }
};

export const completePasswordResetHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedBody = CompletePasswordResetRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_password_reset_request", "Invalid password reset request", parsedBody.error.flatten());
    }

    const passwordHash = await hashPassword(parsedBody.data.password);
    await prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: {
          tokenHash: hashAuthToken(parsedBody.data.token),
        },
      });

      if (!token || token.usedAt || token.expiresAt <= new Date()) {
        throw new HttpError(400, "password_reset_token_invalid", "Password reset token is invalid or expired");
      }

      await tx.userPasswordCredential.update({
        where: {
          userId: token.userId,
        },
        data: {
          passwordHash,
        },
      });
      await tx.user.update({
        where: {
          id: token.userId,
        },
        data: {
          emailVerifiedAt: new Date(),
        },
      });
      await tx.passwordResetToken.update({
        where: {
          id: token.id,
        },
        data: {
          usedAt: new Date(),
        },
      });
      await recordAuthActivity(tx, {
        action: "auth.password_reset_completed",
        actorUserId: token.userId,
        message: "User password reset completed",
        resourceId: token.userId,
      });
    });

    res.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    next(mapAuthError(error));
  }
};

export const startOidcLoginHandler: RequestHandler = async (req, res, next) => {
  try {
    res.redirect(await createOidcAuthorizationRedirect(req, res));
  } catch (error) {
    next(error);
  }
};

export const completeOidcLoginHandler: RequestHandler = async (req, res, next) => {
  try {
    res.redirect(await completeOidcAuthorization(req, res));
  } catch (error) {
    const redirectUrl = error instanceof HttpError ? buildOidcErrorRedirectUrl(error.code) : null;

    if (redirectUrl) {
      res.redirect(redirectUrl);
      return;
    }

    next(error);
  }
};

export const logoutHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getOptionalActorUserId(req);
    const revoked = await revokeAuthSession(req);
    clearAuthSessionCookie(res);

    if (actorUserId) {
      await recordAuthActivity(prisma, {
        action: "auth.logout",
        actorUserId,
        message: "User logged out",
        resourceId: actorUserId,
      });
    }

    res.json({
      data: {
        revoked,
      },
    });
  } catch (error) {
    next(error);
  }
};

const authenticatedUserSelect = {
  email: true,
  emailVerifiedAt: true,
  id: true,
  name: true,
  suspendedAt: true,
} as const;

async function findAuthenticatedUserById(userId: string): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: authenticatedUserSelect,
  });

  if (!user) {
    throw new HttpError(401, "authentication_required", "Authenticated user was not found");
  }

  if (user.suspendedAt) {
    throw new HttpError(403, "user_suspended", "User account is suspended");
  }

  return mapAuthenticatedUser(user);
}

function mapAuthenticatedUser(user: { email: string; emailVerifiedAt: Date | null; id: string; name: string }): AuthenticatedUser {
  return {
    email: user.email,
    email_verified: Boolean(user.emailVerifiedAt),
    id: user.id,
    name: user.name,
  };
}

async function listPlatformRoles(userId: string): Promise<Array<"platform_admin">> {
  const roles = await prisma.platformAdminRole.findMany({
    where: {
      userId,
    },
    orderBy: {
      role: "asc",
    },
  });

  return roles.map((role) => role.role as "platform_admin");
}

async function createEmailVerificationToken(
  tx: TransactionClient,
  userId: string,
  email: string,
  token: string,
) {
  await tx.emailVerificationToken.create({
    data: {
      expiresAt: new Date(Date.now() + emailVerificationTtlMs),
      sentToEmail: email,
      tokenHash: hashAuthToken(token),
      userId,
    },
  });
}

async function ensureDefaultNotificationPreferences(tx: TransactionClient, userId: string) {
  await tx.userNotificationPreference.createMany({
    data: defaultNotificationChannels.map((channel) => ({
      channel,
      delaySeconds: 0,
      enabled: false,
      userId,
    })),
    skipDuplicates: true,
  });
}

async function recordAuthActivity(
  tx: typeof prisma | TransactionClient,
  input: {
    action: string;
    actorUserId?: string | null;
    message: string;
    metadata?: unknown;
    resourceId?: string | null;
  },
) {
  await recordActivityLog(tx, {
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    message: input.message,
    metadata: input.metadata,
    resourceId: input.resourceId ?? null,
    resourceType: "user",
    workspaceId: null,
  });
}

function getOptionalActorUserId(req: Parameters<RequestHandler>[0]) {
  try {
    return getRequiredActorUserId(req);
  } catch {
    return null;
  }
}

function mapAuthError(error: unknown) {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new HttpError(409, "email_already_registered", "Email is already registered");
  }

  return error;
}
