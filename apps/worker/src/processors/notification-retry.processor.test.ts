import type { NotificationDeliveryAttempt, NotificationLog } from "@im/contracts";
import type { PrismaClient } from "@im/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationProviderError, type NotificationProvider } from "../providers/notification-provider";
import { NotificationRetryProcessor } from "./notification-retry.processor";

describe("NotificationRetryProcessor", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("claims due notifications and marks provider success as sent", async () => {
    process.env.WORKER_NOTIFICATION_BATCH_SIZE = "2";
    process.env.WORKER_NOTIFICATION_LEASE_SECONDS = "90";
    const notification = createNotification();
    const notificationService = createNotificationService([notification]);
    const provider: NotificationProvider = {
      send: vi.fn().mockResolvedValue({ providerMessageId: "provider-message-1" }),
    };
    const db = createDb({
      settings: [
        {
          provider: "slack",
          config: {
            webhook_url: "https://hooks.slack.com/services/workspace",
          },
        },
      ],
    });

    const processedCount = await new NotificationRetryProcessor({
      db,
      notificationService,
      providers: {
        slack: provider,
      },
    }).tick();

    expect(processedCount).toBe(1);
    expect(notificationService.claimDueNotifications).toHaveBeenCalledWith(2, 90);
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({
      providerSettings: {
        slack: {
          webhookUrl: "https://hooks.slack.com/services/workspace",
        },
      },
      targetAddress: "https://hooks.slack.com/services/user",
    }));
    expect(notificationService.markSent).toHaveBeenCalledWith(notification.id, "provider-message-1", {
      deliveryAttemptId: "attempt-1",
    });
    expect(notificationService.markFailed).not.toHaveBeenCalled();
  });

  it("records retry metadata when a provider asks for retry-after", async () => {
    const notification = createNotification();
    const notificationService = createNotificationService([notification]);
    const provider: NotificationProvider = {
      send: vi.fn().mockRejectedValue(new NotificationProviderError("Slack rate limited", 7)),
    };

    await new NotificationRetryProcessor({
      db: createDb(),
      notificationService,
      providers: {
        slack: provider,
      },
    }).tick();

    expect(notificationService.markFailed).toHaveBeenCalledWith(notification.id, "Slack rate limited", {
      deliveryAttemptId: "attempt-1",
      retryAfterSeconds: 7,
    });
    expect(notificationService.markSent).not.toHaveBeenCalled();
  });

  it("does not call providers when the claimed notification should be skipped", async () => {
    const notification = createNotification();
    const notificationService = createNotificationService([notification], {
      shouldSkip: true,
    });
    const provider: NotificationProvider = {
      send: vi.fn(),
    };
    const db = createDb();

    const processedCount = await new NotificationRetryProcessor({
      db,
      notificationService,
      providers: {
        slack: provider,
      },
    }).tick();

    expect(processedCount).toBe(1);
    expect(provider.send).not.toHaveBeenCalled();
    expect(db.incident.findUnique).not.toHaveBeenCalled();
    expect(notificationService.markSent).not.toHaveBeenCalled();
    expect(notificationService.markFailed).not.toHaveBeenCalled();
  });

  it("delivers a resolved lifecycle notification after the incident is resolved", async () => {
    const notification = createNotification({ channel: "email", event_action: "incident.resolved" });
    const notificationService = createNotificationService([notification]);
    const provider: NotificationProvider = {
      send: vi.fn().mockResolvedValue({ providerMessageId: "resolved-message" }),
    };

    await new NotificationRetryProcessor({
      db: createDb({ incidentStatus: "resolved" }),
      notificationService,
      providers: { email: provider },
    }).tick();

    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining("[RESOLVED]"),
    }));
    expect(notificationService.markSent).toHaveBeenCalledWith(notification.id, "resolved-message", {
      deliveryAttemptId: "attempt-1",
    });
  });
});

function createNotification(overrides: Partial<NotificationLog> = {}): NotificationLog {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    incident_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    policy_step_id: null,
    repeat_iteration: 0,
    channel: "slack",
    target_type: "primary_on_call",
    target_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    target_address: "https://hooks.slack.com/services/user",
    status: "sending",
    attempt: 1,
    idempotency_key: "notification-retry-test",
    event_action: "incident.created",
    provider_message_id: null,
    error_message: null,
    next_retry_at: null,
    sent_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createNotificationService(
  notifications: NotificationLog[],
  options: {
    shouldSkip?: boolean;
  } = {},
) {
  return {
    claimDueNotifications: vi.fn().mockResolvedValue(notifications),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markSent: vi.fn().mockResolvedValue(undefined),
    markSkipped: vi.fn().mockResolvedValue(undefined),
    shouldSkipNotification: vi.fn().mockResolvedValue(options.shouldSkip ?? false),
    startDeliveryAttempt: vi.fn().mockResolvedValue(createDeliveryAttempt()),
  };
}

function createDeliveryAttempt(): NotificationDeliveryAttempt {
  return {
    id: "attempt-1",
    notification_log_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    attempt: 1,
    status: "sending",
    provider: "slack",
    provider_message_id: null,
    error_message: null,
    retry_after_seconds: null,
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
    metadata: null,
  };
}

function createDb(input: {
  incidentStatus?: "triggered" | "acknowledged" | "resolved";
  settings?: Array<{
    config: unknown;
    provider: string;
  }>;
} = {}): PrismaClient {
  return {
    incident: {
      findUnique: vi.fn().mockResolvedValue({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        workspaceId: "99999999-9999-4999-8999-999999999999",
        title: "Checkout API latency spike",
        description: null,
        severity: "critical",
        priority: "P1",
        status: input.incidentStatus ?? "triggered",
        source: "webhook",
        fingerprint: "checkout-api-latency",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        service: {
          id: "66666666-6666-4666-8666-666666666666",
          name: "Checkout API",
        },
      }),
    },
    workspaceNotificationProviderSetting: {
      findMany: vi.fn().mockResolvedValue(input.settings ?? []),
    },
  } as unknown as PrismaClient;
}
