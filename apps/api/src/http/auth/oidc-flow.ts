import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";

import { prisma, Prisma, type TransactionClient } from "@im/db";
import type { Request, Response } from "express";

import {
  clearAuthSessionCookie,
  createAuthSession,
  setAuthSessionCookie,
} from "./auth-session";
import { recordActivityLog } from "@im/backend-core";
import {
  getOidcProviderConfig,
  type OidcProviderConfig,
} from "./oidc-config";
import {
  consumeOidcStateCookie,
  createCodeChallenge,
  createOidcStatePayload,
  setOidcStateCookie,
} from "./oidc-state";
import { HttpError } from "../errors/http-error";

type OidcDiscovery = {
  authorizationEndpoint: string;
  issuer: string;
  jwksUri: string;
  tokenEndpoint: string;
  userinfoEndpoint: string | null;
};

type OidcTokenResponse = {
  access_token?: string;
  id_token: string;
  token_type?: string;
};

type OidcProfile = {
  email: string;
  emailVerified: boolean;
  issuer: string;
  name: string;
  provider: string;
  rawProfile: Prisma.InputJsonObject;
  subject: string;
};

const discoveryCache = new Map<string, { expiresAt: number; value: OidcDiscovery }>();
const defaultNotificationChannels = ["email", "sms", "phone"] as const;

export function getActiveAuthProvider() {
  const config = getOidcProviderConfig();

  if (!config) {
    return null;
  }

  return {
    enabled: true,
    id: config.providerId,
    label: config.label,
    login_url: "/api/v1/auth/oidc/start",
  };
}

export async function createOidcAuthorizationRedirect(req: Request, res: Response) {
  const config = getRequiredOidcProviderConfig();
  const discovery = await getDiscovery(config);
  const returnTo = parseReturnTo(req.query.return_to);
  const statePayload = createOidcStatePayload(returnTo);
  const authorizationUrl = new URL(discovery.authorizationEndpoint);

  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("code_challenge", createCodeChallenge(statePayload.codeVerifier));
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("nonce", statePayload.nonce);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizationUrl.searchParams.set("state", statePayload.state);

  setOidcStateCookie(res, statePayload);

  return authorizationUrl.toString();
}

export async function completeOidcAuthorization(req: Request, res: Response) {
  const config = getRequiredOidcProviderConfig();
  const error = getSingleQueryValue(req.query.error);

  if (error) {
    throw new HttpError(400, "oidc_provider_error", "OIDC provider returned an error", {
      error,
      error_description: getSingleQueryValue(req.query.error_description),
    });
  }

  const code = getSingleQueryValue(req.query.code);
  const state = getSingleQueryValue(req.query.state);

  if (!code || !state) {
    throw new HttpError(400, "oidc_callback_invalid", "OIDC callback requires code and state");
  }

  const statePayload = consumeOidcStateCookie(req, res);

  if (state !== statePayload.state) {
    throw new HttpError(400, "oidc_state_mismatch", "OIDC state does not match");
  }

  const discovery = await getDiscovery(config);
  const tokenResponse = await exchangeAuthorizationCode(config, discovery, code, statePayload.codeVerifier);
  const profile = await resolveOidcProfile(config, discovery, tokenResponse, statePayload.nonce);
  const user = await connectOidcUser(profile);
  const session = await createAuthSession(user.id, req);

  clearAuthSessionCookie(res);
  setAuthSessionCookie(res, session.token, session.expiresAt);
  await recordActivityLog(prisma, {
    action: "auth.oidc_login_succeeded",
    actorUserId: user.id,
    message: "User logged in with OIDC",
    metadata: {
      provider: profile.provider,
    },
    resourceId: user.id,
    resourceType: "user",
    workspaceId: null,
  });

  return buildPostLoginRedirectUrl(config, statePayload.returnTo);
}

export function buildOidcErrorRedirectUrl(code: string) {
  const config = getOidcProviderConfig();

  if (!config) {
    return null;
  }

  const redirectUrl = new URL(buildPostLoginRedirectUrl(config, null));
  redirectUrl.searchParams.set("auth_error", code);

  return redirectUrl.toString();
}

function getRequiredOidcProviderConfig() {
  const config = getOidcProviderConfig();

  if (!config) {
    throw new HttpError(503, "oidc_not_configured", "OIDC provider is not configured");
  }

  return config;
}

async function getDiscovery(config: OidcProviderConfig): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(config.issuerUrl);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const response = await fetch(`${config.issuerUrl}/.well-known/openid-configuration`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new HttpError(502, "oidc_discovery_failed", "OIDC discovery request failed", {
      status: response.status,
    });
  }

  const payload = await response.json() as Record<string, unknown>;
  const discovery = parseDiscovery(config, payload);
  discoveryCache.set(config.issuerUrl, {
    expiresAt: Date.now() + 60 * 60 * 1000,
    value: discovery,
  });

  return discovery;
}

function parseDiscovery(config: OidcProviderConfig, payload: Record<string, unknown>): OidcDiscovery {
  const issuer = readString(payload, "issuer");
  const authorizationEndpoint = readString(payload, "authorization_endpoint");
  const tokenEndpoint = readString(payload, "token_endpoint");
  const jwksUri = readString(payload, "jwks_uri");

  if (!issuer || normalizeIssuerUrl(issuer) !== config.issuerUrl) {
    throw new HttpError(502, "oidc_discovery_invalid", "OIDC discovery issuer does not match configuration");
  }

  if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
    throw new HttpError(502, "oidc_discovery_invalid", "OIDC discovery document is missing required endpoints");
  }

  return {
    authorizationEndpoint,
    issuer,
    jwksUri,
    tokenEndpoint,
    userinfoEndpoint: readString(payload, "userinfo_endpoint") ?? null,
  };
}

async function exchangeAuthorizationCode(
  config: OidcProviderConfig,
  discovery: OidcDiscovery,
  code: string,
  codeVerifier: string,
): Promise<OidcTokenResponse> {
  const body = new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  });

  if (config.clientAuthMethod === "client_secret_basic") {
    headers.set("authorization", `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`);
  } else {
    body.set("client_id", config.clientId);
    body.set("client_secret", config.clientSecret);
  }

  const response = await fetch(discovery.tokenEndpoint, {
    body,
    headers,
    method: "POST",
  });
  const responseText = await response.text();
  const payload = parseJsonObject(responseText);

  if (!response.ok) {
    throw new HttpError(502, "oidc_token_exchange_failed", "OIDC token exchange failed", {
      provider_error: payload,
      status: response.status,
    });
  }

  const idToken = readString(payload, "id_token");

  if (!idToken) {
    throw new HttpError(502, "oidc_token_response_invalid", "OIDC token response is missing id_token");
  }

  const tokenResponse: OidcTokenResponse = {
    id_token: idToken,
  };
  const accessToken = readString(payload, "access_token");
  const tokenType = readString(payload, "token_type");

  if (accessToken) {
    tokenResponse.access_token = accessToken;
  }

  if (tokenType) {
    tokenResponse.token_type = tokenType;
  }

  return tokenResponse;
}

async function resolveOidcProfile(
  config: OidcProviderConfig,
  discovery: OidcDiscovery,
  tokenResponse: OidcTokenResponse,
  expectedNonce: string,
): Promise<OidcProfile> {
  const jwks = createRemoteJWKSet(new URL(discovery.jwksUri));
  const { payload } = await jwtVerify(tokenResponse.id_token, jwks, {
    audience: config.clientId,
    issuer: discovery.issuer,
  });

  if (payload.nonce !== expectedNonce) {
    throw new HttpError(400, "oidc_nonce_mismatch", "OIDC nonce does not match");
  }

  const userInfo = await fetchUserInfo(discovery, tokenResponse);
  const claims = {
    ...payload,
    ...(userInfo ?? {}),
  };
  const subject = readString(claims, "sub");
  const email = readString(claims, "email")?.toLowerCase();
  const emailVerified = readBoolean(claims, "email_verified") ?? false;

  if (!subject) {
    throw new HttpError(502, "oidc_profile_invalid", "OIDC profile is missing subject");
  }

  if (!email) {
    throw new HttpError(502, "oidc_profile_invalid", "OIDC profile is missing email");
  }

  if (config.requireVerifiedEmail && !emailVerified) {
    throw new HttpError(403, "oidc_email_not_verified", "OIDC email must be verified");
  }

  return {
    email,
    emailVerified,
    issuer: discovery.issuer,
    name: readString(claims, "name") ?? readString(claims, "preferred_username") ?? email.split("@").at(0) ?? email,
    provider: config.providerId,
    rawProfile: toJsonObject({
      id_token_claims: payload,
      userinfo_claims: userInfo,
    }),
    subject,
  };
}

async function fetchUserInfo(discovery: OidcDiscovery, tokenResponse: OidcTokenResponse) {
  if (!discovery.userinfoEndpoint || !tokenResponse.access_token) {
    return null;
  }

  const response = await fetch(discovery.userinfoEndpoint, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${tokenResponse.access_token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return await response.json() as JWTPayload;
}

async function connectOidcUser(profile: OidcProfile) {
  return prisma.$transaction(async (tx) => {
    const existingIdentity = await tx.userIdentity.findUnique({
      where: {
        provider_issuer_subject: {
          issuer: profile.issuer,
          provider: profile.provider,
          subject: profile.subject,
        },
      },
      include: {
        user: {
          select: {
            email: true,
            id: true,
            name: true,
          },
        },
      },
    });

    if (existingIdentity) {
      await tx.userIdentity.update({
        where: {
          id: existingIdentity.id,
        },
        data: toIdentityUpdate(profile),
      });
      await markUserEmailVerifiedFromOidc(tx, existingIdentity.user.id, profile);
      await ensureDefaultNotificationPreferences(tx, existingIdentity.user.id);

      return existingIdentity.user;
    }

    const existingUser = profile.emailVerified
      ? await tx.user.findUnique({
          where: {
            email: profile.email,
          },
          select: {
            email: true,
            id: true,
            name: true,
          },
        })
      : null;

    if (existingUser) {
      await tx.userIdentity.create({
        data: {
          userId: existingUser.id,
          ...toIdentityCreate(profile),
        },
      });
      await markUserEmailVerifiedFromOidc(tx, existingUser.id, profile);
      await ensureDefaultNotificationPreferences(tx, existingUser.id);

      return existingUser;
    }

    const user = await tx.user.create({
      data: {
        email: profile.email,
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        name: profile.name,
      },
      select: {
        email: true,
        id: true,
        name: true,
      },
    });
    await tx.userIdentity.create({
      data: {
        userId: user.id,
        ...toIdentityCreate(profile),
      },
    });
    await ensureDefaultNotificationPreferences(tx, user.id);

    return user;
  });
}

async function markUserEmailVerifiedFromOidc(tx: TransactionClient, userId: string, profile: OidcProfile) {
  if (!profile.emailVerified) {
    return;
  }

  await tx.user.updateMany({
    where: {
      emailVerifiedAt: null,
      id: userId,
    },
    data: {
      emailVerifiedAt: new Date(),
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

function toIdentityCreate(profile: OidcProfile) {
  return {
    email: profile.email,
    emailVerified: profile.emailVerified,
    issuer: profile.issuer,
    name: profile.name,
    provider: profile.provider,
    rawProfile: profile.rawProfile,
    subject: profile.subject,
  };
}

function toIdentityUpdate(profile: OidcProfile) {
  return {
    email: profile.email,
    emailVerified: profile.emailVerified,
    name: profile.name,
    rawProfile: profile.rawProfile,
  };
}

function buildPostLoginRedirectUrl(config: OidcProviderConfig, returnTo: string | null) {
  const baseUrl = new URL(config.postLoginRedirectUrl);

  if (!returnTo) {
    return baseUrl.toString();
  }

  return new URL(returnTo, baseUrl).toString();
}

function parseReturnTo(value: unknown) {
  const returnTo = getSingleQueryValue(value);

  if (!returnTo) {
    return null;
  }

  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    throw new HttpError(400, "invalid_return_to", "return_to must be a relative path");
  }

  return returnTo;
}

function getSingleQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return {};
  } catch {
    return {};
  }
}

function readString(value: Record<string, unknown> | JWTPayload, key: string) {
  const raw = value[key];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function readBoolean(value: Record<string, unknown> | JWTPayload, key: string) {
  const raw = value[key];
  return typeof raw === "boolean" ? raw : undefined;
}

function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function normalizeIssuerUrl(value: string) {
  return value.replace(/\/+$/, "");
}
