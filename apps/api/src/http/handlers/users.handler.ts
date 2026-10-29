import {
  CheckUserPhoneVerificationRequestSchema,
  StartUserPhoneVerificationRequestSchema,
  UpdateUserNotificationPreferencesRequestSchema,
  UserListQuerySchema,
  UuidSchema,
  type CheckUserPhoneVerificationRequest,
  type StartUserPhoneVerificationRequest,
  type UpdateUserNotificationPreferencesRequest,
  type User,
  type UserNotificationChannelPreference,
  type UserNotificationPreferences,
  type UserPhoneVerificationStatus,
} from "@im/contracts";
import { prisma, type TransactionClient } from "@im/db";
import crypto from "node:crypto";
import type { RequestHandler } from "express";
import twilio from "twilio";

import { getRequiredActorUserId } from "../auth/user-context";
import { assertActorWorkspaceMember } from "../auth/workspace-access";
import { requireAuthSecret } from "../auth/auth-secret";
import { HttpError } from "../errors/http-error";

type PhoneVerificationContactType = "phone_sms" | "phone_voice";
type ContactType = "email_webhook" | "phone_number" | PhoneVerificationContactType;
type UserNotificationChannel = "email" | "sms" | "phone";

type ContactRecord = {
  type: string;
  address: string;
  verifiedAt: Date | null;
  verificationSentAt: Date | null;
};

type PreferenceRecord = {
  channel: string;
  enabled: boolean;
  delaySeconds: number;
};

type TwilioPhoneVerificationClient = {
  messages: {
    create(input: { to: string; from: string; body: string }): Promise<{ sid?: string | null }>;
  };
  calls: {
    create(input: { to: string; from: string; twiml: string }): Promise<{ sid?: string | null }>;
  };
};

type UserRecord = {
  emailVerifiedAt: Date | null;
  id: string;
  email: string;
  name: string;
  notificationContacts: ContactRecord[];
  notificationPreferences: PreferenceRecord[];
  createdAt: Date;
  updatedAt: Date;
};

const configurableChannels = ["email", "sms", "phone"] as const satisfies readonly UserNotificationChannel[];
const phoneVerificationContactTypes = ["phone_sms", "phone_voice"] as const satisfies readonly PhoneVerificationContactType[];
const phoneVerificationProvider = "twilio_delivery";
const phoneVerificationTtlSeconds = 10 * 60;
const twilioPhoneVerificationConfigMessage = "Twilio is not configured or the saved Twilio credentials/phone number are invalid";

export const listUsersHandler: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getRequiredActorUserId(req);
    const parsedQuery = UserListQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      throw new HttpError(400, "invalid_user_filter", "Invalid user filter", parsedQuery.error.flatten());
    }

    if (parsedQuery.data.workspace_id) {
      await assertActorWorkspaceMember(req, parsedQuery.data.workspace_id);
    }

    const users = await prisma.user.findMany({
      where: parsedQuery.data.workspace_id
        ? {
            workspaceMemberships: {
              some: {
                workspaceId: parsedQuery.data.workspace_id,
              },
            },
          }
        : {
            id: actorUserId,
          },
      include: notificationSettingsInclude(),
      orderBy: {
        name: "asc",
      },
    });

    res.json({
      data: users.map((user) => mapUser(user, {
        includeRawPhoneNumbers: user.id === actorUserId,
      })),
    });
  } catch (error) {
    next(mapUserError(error));
  }
};

export const updateUserNotificationPreferencesHandler: RequestHandler = async (req, res, next) => {
  try {
    assertSelfRequest(req);
    const userId = parseUserId(req.params.userId);
    const parsedBody = UpdateUserNotificationPreferencesRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_notification_preferences", "Invalid notification preferences", parsedBody.error.flatten());
    }

    const user = await prisma.$transaction(async (tx) => {
      await assertUserExists(tx, userId);
      await ensureDefaultPreferences(tx, userId);
      await updateContacts(tx, userId, parsedBody.data);
      await updatePreferences(tx, userId, parsedBody.data.preferences ?? []);

      return findUserWithNotificationSettings(tx, userId);
    });

    res.json({ data: mapUserNotificationPreferences(user) });
  } catch (error) {
    next(mapUserError(error));
  }
};

export const startUserPhoneVerificationHandler: RequestHandler = async (req, res, next) => {
  try {
    assertSelfRequest(req);
    const userId = parseUserId(req.params.userId);
    const parsedBody = StartUserPhoneVerificationRequestSchema.safeParse(req.body ?? {});

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_phone_verification_request", "Invalid phone verification request", parsedBody.error.flatten());
    }

    const verificationContactType = verificationContactTypeForChannel(parsedBody.data.channel);
    const contact = await getPhoneContact(userId, verificationContactType);

    if (!contact) {
      throw new HttpError(400, "phone_number_not_configured", "Register a phone number before starting verification");
    }

    const verification = await startPhoneVerificationDelivery(contact.address, parsedBody.data);
    const user = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        notificationContacts: {
          upsert: {
            where: {
              userId_type: {
                userId,
                type: verificationContactType,
              },
            },
            create: {
              type: verificationContactType,
              address: contact.address,
              verifiedAt: null,
              verificationProvider: phoneVerificationProvider,
              verificationExternalId: verification.externalId,
              verificationSentAt: new Date(),
            },
            update: {
              address: contact.address,
              verifiedAt: null,
              verificationProvider: phoneVerificationProvider,
              verificationExternalId: verification.externalId,
              verificationSentAt: new Date(),
            },
          },
        },
      },
      include: notificationSettingsInclude(),
    });

    res.json({ data: mapPhoneVerificationStatus(user) });
  } catch (error) {
    next(mapUserError(error));
  }
};

export const checkUserPhoneVerificationHandler: RequestHandler = async (req, res, next) => {
  try {
    assertSelfRequest(req);
    const userId = parseUserId(req.params.userId);
    const parsedBody = CheckUserPhoneVerificationRequestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new HttpError(400, "invalid_phone_verification_check", "Invalid phone verification check", parsedBody.error.flatten());
    }

    const verificationContactType = verificationContactTypeForChannel(parsedBody.data.channel);
    const contact = await getPhoneContact(userId, verificationContactType);

    if (!contact) {
      throw new HttpError(400, "phone_number_not_configured", "Register a phone number before checking verification");
    }

    const verification = checkPhoneVerificationCode(contact, parsedBody.data);

    const user = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        notificationContacts: {
          upsert: {
            where: {
              userId_type: {
                userId,
                type: verificationContactType,
              },
            },
            create: {
              type: verificationContactType,
              address: contact.address,
              verifiedAt: new Date(),
              verificationProvider: phoneVerificationProvider,
              verificationExternalId: verification.sid,
            },
            update: {
              address: contact.address,
              verifiedAt: new Date(),
              verificationProvider: phoneVerificationProvider,
              verificationExternalId: verification.sid,
            },
          },
        },
      },
      include: notificationSettingsInclude(),
    });

    res.json({ data: mapPhoneVerificationStatus(user) });
  } catch (error) {
    next(mapUserError(error));
  }
};

function parseUserId(value: string | undefined) {
  const parsedUserId = UuidSchema.safeParse(value);

  if (!parsedUserId.success) {
    throw new HttpError(400, "invalid_user_id", "Invalid user id", parsedUserId.error.flatten());
  }

  return parsedUserId.data;
}

async function assertUserExists(tx: TransactionClient, userId: string) {
  const user = await tx.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    throw new HttpError(404, "user_not_found", "User not found");
  }
}

async function ensureDefaultPreferences(tx: TransactionClient, userId: string) {
  await tx.userNotificationPreference.createMany({
    data: configurableChannels.map((channel) => ({
      userId,
      channel,
      enabled: false,
      delaySeconds: 0,
    })),
    skipDuplicates: true,
  });
}

async function updateContacts(
  tx: TransactionClient,
  userId: string,
  input: UpdateUserNotificationPreferencesRequest,
) {
  await upsertContact(tx, userId, "email_webhook", input.email_delivery_webhook_url);

  if (input.phone_number !== undefined) {
    await updatePhoneNumberContacts(tx, userId, input.phone_number);
  }

  if (input.sms_phone_number !== undefined) {
    await updatePhoneChannelContact(tx, userId, "phone_sms", input.sms_phone_number);
  }

  if (input.sms_verified === false) {
    await clearPhoneChannelVerification(tx, userId, "phone_sms");
  }

  if (input.voice_phone_number !== undefined) {
    await updatePhoneChannelContact(tx, userId, "phone_voice", input.voice_phone_number);
  }

  if (input.voice_verified === false) {
    await clearPhoneChannelVerification(tx, userId, "phone_voice");
  }
}

async function updatePhoneNumberContacts(
  tx: TransactionClient,
  userId: string,
  value: string | null,
) {
  if (value === null) {
    await tx.userNotificationContact.deleteMany({
      where: {
        type: {
          in: ["phone_number", ...phoneVerificationContactTypes],
        },
        userId,
      },
    });
    return;
  }

  await upsertContact(tx, userId, "phone_number", value);
  for (const type of phoneVerificationContactTypes) {
    await upsertContact(tx, userId, type, value, {
      clearVerification: true,
    });
  }
}

async function updatePhoneChannelContact(
  tx: TransactionClient,
  userId: string,
  type: PhoneVerificationContactType,
  value: string | null,
) {
  if (value === null) {
    await upsertContact(tx, userId, type, value);
    return;
  }

  const existing = await tx.userNotificationContact.findUnique({
    where: {
      userId_type: {
        userId,
        type,
      },
    },
    select: {
      address: true,
    },
  });

  if (existing?.address === value) {
    return;
  }

  await upsertContact(tx, userId, type, value, {
    clearVerification: true,
  });
}

async function clearPhoneChannelVerification(
  tx: TransactionClient,
  userId: string,
  type: PhoneVerificationContactType,
) {
  await tx.userNotificationContact.updateMany({
    where: {
      userId,
      type,
    },
    data: {
      verifiedAt: null,
      verificationProvider: null,
      verificationExternalId: null,
      verificationSentAt: null,
    },
  });
}

async function upsertContact(
  tx: TransactionClient,
  userId: string,
  type: ContactType,
  value: string | null | undefined,
  options: { clearVerification?: boolean } = {},
) {
  if (value === undefined) {
    return;
  }

  if (value === null) {
    await tx.userNotificationContact.deleteMany({
      where: {
        userId,
        type,
      },
    });
    return;
  }

  await tx.userNotificationContact.upsert({
    where: {
      userId_type: {
        userId,
        type,
      },
    },
    create: {
      userId,
      type,
      address: value,
      ...(options.clearVerification
        ? {
            verifiedAt: null,
            verificationProvider: null,
            verificationExternalId: null,
            verificationSentAt: null,
          }
        : {}),
    },
    update: {
      address: value,
      ...(options.clearVerification
        ? {
            verifiedAt: null,
            verificationProvider: null,
            verificationExternalId: null,
            verificationSentAt: null,
          }
        : {}),
    },
  });
}

async function updatePreferences(
  tx: TransactionClient,
  userId: string,
  preferences: UserNotificationChannelPreference[],
) {
  for (const preference of preferences) {
    await tx.userNotificationPreference.upsert({
      where: {
        userId_channel: {
          userId,
          channel: preference.channel,
        },
      },
      create: {
        userId,
        channel: preference.channel,
        enabled: preference.enabled,
        delaySeconds: preference.delay_seconds,
      },
      update: {
        enabled: preference.enabled,
        delaySeconds: preference.delay_seconds,
      },
    });
  }
}

async function findUserWithNotificationSettings(tx: TransactionClient, userId: string): Promise<UserRecord> {
  return tx.user.findUniqueOrThrow({
    where: {
      id: userId,
    },
    include: notificationSettingsInclude(),
  });
}

function assertSelfRequest(req: Parameters<RequestHandler>[0]) {
  const actorUserId = getRequiredActorUserId(req);
  const userId = parseUserId(req.params.userId);

  if (actorUserId !== userId) {
    throw new HttpError(403, "user_access_denied", "You can only update your own user settings");
  }
}

async function getPhoneContact(userId: string, type: PhoneVerificationContactType) {
  await prisma.user.findUniqueOrThrow({
    where: {
      id: userId,
    },
    select: {
      id: true,
    },
  });

  return prisma.userNotificationContact.findUnique({
    where: {
      userId_type: {
        userId,
        type,
      },
    },
  });
}

async function startPhoneVerificationDelivery(
  phoneNumber: string,
  input: StartUserPhoneVerificationRequest,
): Promise<{ externalId: string }> {
  const code = createPhoneVerificationCode();
  const { client, fromPhoneNumber } = await resolveTwilioPhoneVerificationClient(input.workspace_id);
  const response = await sendWithTwilioPhoneVerificationError(() => {
    if (input.channel === "sms") {
      return client.messages.create({
        to: phoneNumber,
        from: fromPhoneNumber,
        body: buildPhoneVerificationSmsBody(code),
      });
    }

    return client.calls.create({
      to: phoneNumber,
      from: fromPhoneNumber,
      twiml: buildPhoneVerificationVoiceTwiml(code),
    });
  });
  const sid = typeof response.sid === "string" ? response.sid : null;

  return {
    externalId: createPhoneVerificationExternalId({
      channel: input.channel,
      code,
      phoneNumber,
      sid,
    }),
  };
}

function checkPhoneVerificationCode(
  contact: NonNullable<Awaited<ReturnType<typeof getPhoneContact>>>,
  input: CheckUserPhoneVerificationRequest,
): { sid: string | null } {
  if (!contact.verificationSentAt || contact.verificationProvider !== phoneVerificationProvider) {
    throw new HttpError(400, "phone_verification_not_started", "Start phone verification before checking a code");
  }

  if (Date.now() - contact.verificationSentAt.getTime() > phoneVerificationTtlSeconds * 1000) {
    throw new HttpError(400, "phone_verification_expired", "Phone verification code expired");
  }

  const payload = readPhoneVerificationExternalId(contact.verificationExternalId);

  if (!payload || payload.channel !== input.channel || !isPhoneVerificationCodeMatch({
    channel: input.channel,
    code: input.code,
    hash: payload.hash,
    phoneNumber: contact.address,
    salt: payload.salt,
  })) {
    throw new HttpError(400, "phone_verification_failed", "Phone verification code was not approved");
  }

  return {
    sid: payload.sid,
  };
}

async function resolveTwilioPhoneVerificationClient(
  workspaceId?: string,
): Promise<{ client: TwilioPhoneVerificationClient; fromPhoneNumber: string }> {
  const workspaceConfig = workspaceId ? await getWorkspaceTwilioConfig(workspaceId) : {};
  const accountSid = workspaceConfig.account_sid;
  const authToken = workspaceConfig.auth_token;
  const fromPhoneNumber = workspaceConfig.from_phone_number;
  const timeoutMs = Number(process.env.NOTIFICATION_HTTP_TIMEOUT_MS ?? 10_000);

  if (!accountSid || !authToken || !fromPhoneNumber) {
    throw new HttpError(503, "twilio_phone_verification_not_configured", twilioPhoneVerificationConfigMessage, {
      required: ["account_sid", "auth_token", "from_phone_number"],
    });
  }

  try {
    return {
      client: twilio(accountSid, authToken, {
        timeout: timeoutMs,
      }),
      fromPhoneNumber,
    };
  } catch (error) {
    throw toTwilioPhoneVerificationError(error);
  }
}

async function getWorkspaceTwilioConfig(workspaceId: string): Promise<Record<string, string>> {
  const setting = await prisma.workspaceNotificationProviderSetting.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: "twilio",
      },
    },
  });

  if (!setting?.enabled) {
    return {};
  }

  const config = readProviderConfig(setting.config);

  return {
    ...(typeof config.account_sid === "string" ? { account_sid: config.account_sid } : {}),
    ...(typeof config.auth_token === "string" ? { auth_token: config.auth_token } : {}),
    ...(typeof config.from_phone_number === "string" ? { from_phone_number: config.from_phone_number } : {}),
  };
}

function readProviderConfig(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

async function sendWithTwilioPhoneVerificationError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toTwilioPhoneVerificationError(error);
  }
}

function toTwilioPhoneVerificationError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof Error) {
    const twilioError = error as Error & { code?: number; moreInfo?: string; status?: number };
    const statusCode = twilioError.status && twilioError.status >= 400 && twilioError.status < 500 ? 400 : 502;

    return new HttpError(statusCode, "twilio_phone_verification_failed", twilioPhoneVerificationConfigMessage, {
      code: twilioError.code,
      message: twilioError.message,
      more_info: twilioError.moreInfo,
      status: twilioError.status,
    });
  }

  return new HttpError(502, "twilio_phone_verification_failed", twilioPhoneVerificationConfigMessage);
}

function createPhoneVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function buildPhoneVerificationSmsBody(code: string): string {
  return `Your Pager Who verification code is ${code}. It expires in ${Math.round(phoneVerificationTtlSeconds / 60)} minutes.`;
}

function buildPhoneVerificationVoiceTwiml(code: string): string {
  const spokenCode = code.split("").join(" ");

  return [
    "<Response>",
    `<Say>Your Pager Who verification code is ${spokenCode}.</Say>`,
    "<Pause length=\"1\"/>",
    `<Say>Again, your verification code is ${spokenCode}.</Say>`,
    "</Response>",
  ].join("");
}

function createPhoneVerificationExternalId(input: {
  channel: StartUserPhoneVerificationRequest["channel"];
  code: string;
  phoneNumber: string;
  sid: string | null;
}): string {
  const salt = crypto.randomBytes(16).toString("base64url");

  return JSON.stringify({
    channel: input.channel,
    hash: hashPhoneVerificationCode({
      channel: input.channel,
      code: input.code,
      phoneNumber: input.phoneNumber,
      salt,
    }),
    salt,
    sid: input.sid,
    v: 1,
  });
}

function readPhoneVerificationExternalId(value: string | null): {
  channel: StartUserPhoneVerificationRequest["channel"];
  hash: string;
  salt: string;
  sid: string | null;
} | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<{
      channel: StartUserPhoneVerificationRequest["channel"];
      hash: string;
      salt: string;
      sid: string | null;
      v: number;
    }>;

    if (
      parsed.v !== 1
      || (parsed.channel !== "sms" && parsed.channel !== "call")
      || typeof parsed.hash !== "string"
      || typeof parsed.salt !== "string"
      || (parsed.sid !== null && typeof parsed.sid !== "string")
    ) {
      return null;
    }

    return {
      channel: parsed.channel,
      hash: parsed.hash,
      salt: parsed.salt,
      sid: parsed.sid ?? null,
    };
  } catch {
    return null;
  }
}

function isPhoneVerificationCodeMatch(input: {
  channel: StartUserPhoneVerificationRequest["channel"];
  code: string;
  hash: string;
  phoneNumber: string;
  salt: string;
}): boolean {
  const expected = hashPhoneVerificationCode(input);
  const actualBuffer = Buffer.from(input.hash);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function hashPhoneVerificationCode(input: {
  channel: StartUserPhoneVerificationRequest["channel"];
  code: string;
  phoneNumber: string;
  salt: string;
}): string {
  return crypto.createHmac("sha256", phoneVerificationSecret())
    .update(input.salt)
    .update(":")
    .update(input.phoneNumber)
    .update(":")
    .update(input.channel)
    .update(":")
    .update(input.code.trim())
    .digest("base64url");
}

function phoneVerificationSecret(): string {
  return requireAuthSecret(
    "PHONE_VERIFICATION_SECRET",
    "phone_verification_secret_not_configured",
    "Phone verification secret is not configured",
  );
}

function notificationSettingsInclude() {
  return {
    notificationContacts: true,
    notificationPreferences: {
      orderBy: {
        channel: "asc" as const,
      },
    },
  };
}

type NotificationSettingsMapOptions = {
  includeRawPhoneNumbers?: boolean;
};

function mapUser(user: UserRecord, options: NotificationSettingsMapOptions = {}): User {
  return {
    id: user.id,
    email: user.email,
    email_verified: Boolean(user.emailVerifiedAt),
    name: user.name,
    notification_settings: mapNotificationSettings(user, options),
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

function mapUserNotificationPreferences(user: UserRecord): UserNotificationPreferences {
  return {
    user_id: user.id,
    ...mapNotificationSettings(user, { includeRawPhoneNumbers: true }),
    updated_at: user.updatedAt.toISOString(),
  };
}

function mapPhoneVerificationStatus(user: UserRecord): UserPhoneVerificationStatus {
  const contacts = buildContactMap(user.notificationContacts);
  const phoneContact = contacts.get("phone_number");
  const smsContact = contacts.get("phone_sms");
  const voiceContact = contacts.get("phone_voice");
  const smsVerified = Boolean(smsContact?.verifiedAt);
  const voiceVerified = Boolean(voiceContact?.verifiedAt);

  return {
    user_id: user.id,
    has_phone_number: Boolean(phoneContact ?? smsContact ?? voiceContact),
    phone_number_masked: phoneContact ? maskPhoneNumber(phoneContact.address) : maskFirstPhoneNumber(smsContact, voiceContact),
    phone_number_verified: smsVerified && voiceVerified,
    has_sms_phone_number: Boolean(smsContact),
    sms_phone_number: smsContact?.address ?? null,
    sms_phone_number_masked: smsContact ? maskPhoneNumber(smsContact.address) : null,
    sms_verified: smsVerified,
    has_voice_phone_number: Boolean(voiceContact),
    voice_phone_number: voiceContact?.address ?? null,
    voice_phone_number_masked: voiceContact ? maskPhoneNumber(voiceContact.address) : null,
    voice_verified: voiceVerified,
    verification_sent_at: phoneContact?.verificationSentAt?.toISOString() ?? null,
    sms_verification_sent_at: smsContact?.verificationSentAt?.toISOString() ?? null,
    voice_verification_sent_at: voiceContact?.verificationSentAt?.toISOString() ?? null,
    updated_at: user.updatedAt.toISOString(),
  };
}

function mapNotificationSettings(user: UserRecord, options: NotificationSettingsMapOptions = {}) {
  const contacts = buildContactMap(user.notificationContacts);
  const phoneContact = contacts.get("phone_number");
  const smsContact = contacts.get("phone_sms");
  const voiceContact = contacts.get("phone_voice");
  const smsVerified = Boolean(smsContact?.verifiedAt);
  const voiceVerified = Boolean(voiceContact?.verifiedAt);
  const includeRawPhoneNumbers = options.includeRawPhoneNumbers === true;

  return {
    contacts: {
      has_email_delivery_webhook_url: contacts.has("email_webhook"),
      has_phone_number: Boolean(phoneContact ?? smsContact ?? voiceContact),
      phone_number_verified: smsVerified && voiceVerified,
      phone_number_masked: phoneContact ? maskPhoneNumber(phoneContact.address) : maskFirstPhoneNumber(smsContact, voiceContact),
      has_sms_phone_number: Boolean(smsContact),
      sms_phone_number: includeRawPhoneNumbers ? smsContact?.address ?? null : null,
      sms_phone_number_masked: smsContact ? maskPhoneNumber(smsContact.address) : null,
      sms_verified: smsVerified,
      has_voice_phone_number: Boolean(voiceContact),
      voice_phone_number: includeRawPhoneNumbers ? voiceContact?.address ?? null : null,
      voice_phone_number_masked: voiceContact ? maskPhoneNumber(voiceContact.address) : null,
      voice_verified: voiceVerified,
    },
    preferences: mapPreferences(user.notificationPreferences),
  };
}

function mapPreferences(preferences: PreferenceRecord[]): UserNotificationChannelPreference[] {
  const byChannel = new Map(preferences.map((preference) => [preference.channel, preference]));

  return configurableChannels.map((channel) => {
    const preference = byChannel.get(channel);

    return {
      channel,
      enabled: preference?.enabled ?? false,
      delay_seconds: preference?.delaySeconds ?? 0,
    };
  });
}

function buildContactMap(contacts: ContactRecord[]) {
  return new Map(contacts.map((contact) => [contact.type, contact]));
}

function maskPhoneNumber(value: string): string {
  return value.replace(/^(\+\d{1,3})\d+(\d{4})$/, "$1***$2");
}

function maskFirstPhoneNumber(...contacts: Array<ContactRecord | undefined>): string | null {
  const contact = contacts.find(Boolean);

  return contact ? maskPhoneNumber(contact.address) : null;
}

function verificationContactTypeForChannel(channel: StartUserPhoneVerificationRequest["channel"]): PhoneVerificationContactType {
  return channel === "sms" ? "phone_sms" : "phone_voice";
}

function mapUserError(error: unknown) {
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return new HttpError(409, "user_email_exists", "User email already exists");
  }

  if (typeof error === "object" && error && "code" in error && error.code === "P2025") {
    return new HttpError(404, "user_not_found", "User not found");
  }

  return error;
}
