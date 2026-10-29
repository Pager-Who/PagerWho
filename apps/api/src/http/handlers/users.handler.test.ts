import type { RequestHandler } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkUserPhoneVerificationHandler,
  listUsersHandler,
  startUserPhoneVerificationHandler,
  updateUserNotificationPreferencesHandler,
} from "./users.handler";
import { errorMiddleware } from "../middleware/error.middleware";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    platformAdminRole: {
      findFirst: vi.fn(),
    },
    userNotificationContact: {
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    userNotificationPreference: {
      createMany: vi.fn(),
    },
    workspaceNotificationProviderSetting: {
      findUnique: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
    },
  },
  twilio: vi.fn(),
  twilioClient: {
    calls: {
      create: vi.fn(),
    },
    messages: {
      create: vi.fn(),
    },
  },
}));

type TestContact = {
  address: string;
  type: "phone_sms" | "phone_voice";
  verificationExternalId: string | null;
  verificationProvider: string | null;
  verificationSentAt: Date | null;
  verifiedAt: Date | null;
};

vi.mock("@im/db", () => ({
  prisma: mocks.prisma,
}));

vi.mock("twilio", () => ({
  default: mocks.twilio,
}));

describe("users phone verification handlers", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const otherUserId = "33333333-3333-4333-8333-333333333333";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  const phoneNumber = "+15551230000";
  const originalTwilioEnv = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_PHONE_NUMBER: process.env.TWILIO_FROM_PHONE_NUMBER,
  };
  const originalPhoneVerificationSecret = process.env.PHONE_VERIFICATION_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_ACCOUNT_SID = "";
    process.env.TWILIO_AUTH_TOKEN = "";
    process.env.TWILIO_FROM_PHONE_NUMBER = "";
    process.env.PHONE_VERIFICATION_SECRET = "test-phone-verification-secret";
    mocks.twilio.mockReturnValue(mocks.twilioClient);
    mocks.twilioClient.messages.create.mockResolvedValue({ sid: "SM123" });
    mocks.twilioClient.calls.create.mockResolvedValue({ sid: "CA123" });
    mocks.prisma.$transaction.mockImplementation((callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
    mocks.prisma.user.findMany.mockResolvedValue([]);
    mocks.prisma.user.findUnique.mockResolvedValue({ id: userId });
    mocks.prisma.user.findUniqueOrThrow.mockResolvedValue({ id: userId });
    mocks.prisma.platformAdminRole.findFirst.mockResolvedValue(null);
    mocks.prisma.userNotificationContact.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.userNotificationContact.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.userNotificationPreference.createMany.mockResolvedValue({ count: 3 });
    mocks.prisma.workspaceNotificationProviderSetting.findUnique.mockResolvedValue({
      enabled: true,
      config: {
        account_sid: "AC123",
        auth_token: "twilio-token",
        from_phone_number: "+15550000000",
      },
    });
    mocks.prisma.workspaceMember.findUnique.mockResolvedValue({
      role: "responder",
      workspace: {
        suspendedAt: null,
      },
    });
  });

  afterEach(() => {
    restoreEnv("TWILIO_ACCOUNT_SID", originalTwilioEnv.TWILIO_ACCOUNT_SID);
    restoreEnv("TWILIO_AUTH_TOKEN", originalTwilioEnv.TWILIO_AUTH_TOKEN);
    restoreEnv("TWILIO_FROM_PHONE_NUMBER", originalTwilioEnv.TWILIO_FROM_PHONE_NUMBER);
    restoreEnv("PHONE_VERIFICATION_SECRET", originalPhoneVerificationSecret);
  });

  it("returns only the signed-in user when no workspace filter is provided", async () => {
    mocks.prisma.user.findMany.mockResolvedValueOnce([
      createUserRecord({
        contacts: [createContact({ address: phoneNumber, type: "phone_sms" })],
        userId,
      }),
    ]);

    const response = await invokeHandler(listUsersHandler, {
      actorUserId: userId,
    });

    expect(response.status).toBe(200);
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: userId,
      },
    }));
    expect(response.body).toMatchObject({
      data: [
        {
          id: userId,
          notification_settings: {
            contacts: {
              has_sms_phone_number: true,
              sms_phone_number: phoneNumber,
              sms_phone_number_masked: expect.any(String),
            },
          },
        },
      ],
    });
  });

  it("lists workspace users only after checking the actor workspace membership", async () => {
    const otherPhoneNumber = "+15559870000";
    mocks.prisma.user.findMany.mockResolvedValueOnce([
      createUserRecord({
        contacts: [createContact({ address: phoneNumber, type: "phone_sms" })],
        userId,
      }),
      createUserRecord({
        contacts: [createContact({ address: otherPhoneNumber, type: "phone_sms" })],
        userId: otherUserId,
      }),
    ]);

    const response = await invokeHandler(listUsersHandler, {
      actorUserId: userId,
      query: {
        workspace_id: workspaceId,
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.prisma.platformAdminRole.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        role: "platform_admin",
        userId,
      }),
    }));
    expect(mocks.prisma.workspaceMember.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        workspaceId_userId: {
          userId,
          workspaceId,
        },
      },
    }));
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        workspaceMemberships: {
          some: {
            workspaceId,
          },
        },
      },
    }));
    expect(response.body).toMatchObject({
      data: [
        {
          id: userId,
          notification_settings: {
            contacts: {
              has_sms_phone_number: true,
              sms_phone_number: phoneNumber,
              sms_phone_number_masked: expect.any(String),
            },
          },
        },
        {
          id: otherUserId,
          notification_settings: {
            contacts: {
              has_sms_phone_number: true,
              sms_phone_number: null,
              sms_phone_number_masked: expect.any(String),
            },
          },
        },
      ],
    });
  });

  it("sends an SMS verification code with the workspace Twilio sender and confirms it locally", async () => {
    const unverifiedContact = createContact({ address: phoneNumber, type: "phone_sms" });
    mocks.prisma.userNotificationContact.findUnique.mockResolvedValueOnce(unverifiedContact);
    mocks.prisma.user.update.mockResolvedValueOnce(createUserRecord({
      contacts: [unverifiedContact],
      userId,
    }));

    const startResponse = await invokeHandler(startUserPhoneVerificationHandler, {
      actorUserId: userId,
      body: {
        channel: "sms",
        workspace_id: workspaceId,
      },
      params: {
        userId,
      },
    });

    expect(startResponse.status).toBe(200);
    expect(mocks.twilio).toHaveBeenCalledWith("AC123", "twilio-token", { timeout: 10_000 });
    expect(mocks.twilioClient.messages.create).toHaveBeenCalledWith({
      to: phoneNumber,
      from: "+15550000000",
      body: expect.stringMatching(/^Your Pager Who verification code is \d{6}\. It expires in 10 minutes\.$/),
    });

    const sentBody = mocks.twilioClient.messages.create.mock.calls[0]?.[0]?.body as string;
    const code = sentBody.match(/\d{6}/)?.[0];
    expect(code).toBeTruthy();

    const startUpdateInput = mocks.prisma.user.update.mock.calls[0]?.[0];
    const verificationExternalId = startUpdateInput.data.notificationContacts.upsert.update.verificationExternalId as string;
    expect(verificationExternalId).not.toContain(code);

    mocks.prisma.userNotificationContact.findUnique.mockResolvedValueOnce({
      ...unverifiedContact,
      verificationExternalId,
      verificationProvider: "twilio_delivery",
      verificationSentAt: new Date(),
    });
    mocks.prisma.user.update.mockResolvedValueOnce(createUserRecord({
      contacts: [{
        ...unverifiedContact,
        verifiedAt: new Date(),
        verificationExternalId: "SM123",
        verificationProvider: "twilio_delivery",
      }],
      userId,
    }));

    const checkResponse = await invokeHandler(checkUserPhoneVerificationHandler, {
      actorUserId: userId,
      body: {
        channel: "sms",
        code,
        workspace_id: workspaceId,
      },
      params: {
        userId,
      },
    });

    expect(checkResponse.status).toBe(200);
    expect(checkResponse.body).toMatchObject({
      data: {
        sms_verified: true,
      },
    });
    expect(mocks.prisma.user.update.mock.calls[1]?.[0].data.notificationContacts.upsert.update).toMatchObject({
      verificationProvider: "twilio_delivery",
      verificationExternalId: "SM123",
    });
  });

  it("returns a Twilio configuration error when verification delivery is not configured", async () => {
    const unverifiedContact = createContact({ address: phoneNumber, type: "phone_sms" });
    process.env.TWILIO_ACCOUNT_SID = "AC-server-fallback";
    process.env.TWILIO_AUTH_TOKEN = "server-fallback-token";
    process.env.TWILIO_FROM_PHONE_NUMBER = "+15550000000";
    mocks.prisma.userNotificationContact.findUnique.mockResolvedValueOnce(unverifiedContact);
    mocks.prisma.workspaceNotificationProviderSetting.findUnique.mockResolvedValueOnce({
      enabled: true,
      config: {},
    });

    const response = await invokeHandler(startUserPhoneVerificationHandler, {
      actorUserId: userId,
      body: {
        channel: "sms",
        workspace_id: workspaceId,
      },
      params: {
        userId,
      },
    });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: {
        code: "twilio_phone_verification_not_configured",
        message: "Twilio is not configured or the saved Twilio credentials/phone number are invalid",
      },
    });
    expect(mocks.twilioClient.messages.create).not.toHaveBeenCalled();
  });

  it("clears SMS verification without deleting the saved phone number", async () => {
    const verifiedContact = {
      ...createContact({ address: phoneNumber, type: "phone_sms" }),
      verificationExternalId: "SM123",
      verificationProvider: "twilio_delivery",
      verificationSentAt: new Date("2026-01-01T00:00:00.000Z"),
      verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    mocks.prisma.user.findUniqueOrThrow.mockResolvedValueOnce(createUserRecord({
      contacts: [{
        ...verifiedContact,
        verifiedAt: null,
        verificationExternalId: null,
        verificationProvider: null,
        verificationSentAt: null,
      }],
      userId,
    }));

    const response = await invokeHandler(updateUserNotificationPreferencesHandler, {
      actorUserId: userId,
      body: {
        sms_verified: false,
      },
      params: {
        userId,
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.prisma.userNotificationContact.updateMany).toHaveBeenCalledWith({
      where: {
        userId,
        type: "phone_sms",
      },
      data: {
        verifiedAt: null,
        verificationProvider: null,
        verificationExternalId: null,
        verificationSentAt: null,
      },
    });
    expect(mocks.prisma.userNotificationContact.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        address: expect.anything(),
      }),
    }));
    expect(response.body).toMatchObject({
      data: {
        contacts: {
          has_sms_phone_number: true,
          sms_phone_number: phoneNumber,
          sms_verified: false,
        },
      },
    });
  });

  it("deletes the saved SMS phone number", async () => {
    mocks.prisma.user.findUniqueOrThrow.mockResolvedValueOnce(createUserRecord({
      contacts: [],
      userId,
    }));

    const response = await invokeHandler(updateUserNotificationPreferencesHandler, {
      actorUserId: userId,
      body: {
        sms_phone_number: null,
      },
      params: {
        userId,
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.prisma.userNotificationContact.deleteMany).toHaveBeenCalledWith({
      where: {
        userId,
        type: "phone_sms",
      },
    });
    expect(mocks.prisma.userNotificationContact.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: "phone_sms",
      }),
    }));
    expect(response.body).toMatchObject({
      data: {
        contacts: {
          has_sms_phone_number: false,
          sms_phone_number: null,
          sms_verified: false,
        },
      },
    });
  });
});

async function invokeHandler(
  handler: RequestHandler,
  input: {
    actorUserId?: string;
    body?: unknown;
    params?: Record<string, string>;
    query?: Record<string, unknown>;
  } = {},
): Promise<{
  body: unknown;
  status: number;
}> {
  const req = {
    actorUserId: input.actorUserId,
    authSource: input.actorUserId ? "session" : undefined,
    body: input.body ?? {},
    header() {
      return undefined;
    },
    params: input.params ?? {},
    query: input.query ?? {},
  };
  const res = createResponse();
  const next = vi.fn((error?: unknown) => {
    if (error) {
      errorMiddleware(error, req as never, res as never, vi.fn());
    }
  });

  await handler(req as never, res as never, next);

  return {
    body: res.body,
    status: res.statusCode,
  };
}

function createResponse() {
  return {
    body: null as unknown,
    locals: {
      requestId: "test-request-id",
    },
    statusCode: 200,
    json(body: unknown) {
      this.body = body;
      return this;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

function createContact(input: {
  address: string;
  type: "phone_sms" | "phone_voice";
}): TestContact {
  return {
    address: input.address,
    type: input.type,
    verificationExternalId: null,
    verificationProvider: null,
    verificationSentAt: null,
    verifiedAt: null,
  };
}

function createUserRecord(input: {
  contacts: TestContact[];
  userId: string;
}) {
  return {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    email: "responder@example.com",
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    id: input.userId,
    name: "Responder",
    notificationContacts: input.contacts,
    notificationPreferences: [],
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
