import { randomUUID } from "node:crypto";

import { prisma } from "@im/db";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";

import {
  assertIntegrationDatabaseReady,
  cleanupTestRecords,
  createTestIncidentFixture,
  describeIfDatabase,
} from "../test-utils/db-fixtures";
import { NotificationService } from "./notification.service";

describeIfDatabase("NotificationService claimDueNotifications", () => {
  const ids = {
    workspace: randomUUID(),
    team: randomUUID(),
    service: randomUUID(),
    incident: randomUUID(),
    notification: randomUUID(),
  };
  const notificationService = new NotificationService(prisma);

  beforeAll(async () => {
    await assertIntegrationDatabaseReady();
  });

  beforeEach(async () => {
    await cleanup();
    await createTestIncidentFixture({
      workspace: {
        id: ids.workspace,
        name: "Notification Claim Test Workspace",
        slug: `notification-claim-${ids.workspace}`,
      },
      team: {
        id: ids.team,
        name: "Notification Claim Test Team",
      },
      service: {
        id: ids.service,
        name: "Notification Claim Test Service",
      },
      incident: {
        id: ids.incident,
        title: "Notification claim test incident",
        severity: "critical",
        status: "triggered",
        source: "test",
        fingerprint: `notification-claim-test-${ids.incident}`,
      },
    });
    await prisma.notificationLog.create({
      data: {
        id: ids.notification,
        incidentId: ids.incident,
        repeatIteration: 0,
        channel: "email",
        targetType: "user",
        targetAddress: "claim-test@example.com",
        status: "pending",
        attempt: 0,
        idempotencyKey: `notification-claim-test-${ids.notification}`,
        createdAt: new Date("2000-01-01T00:00:00.000Z"),
      },
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("claims a due notification only once under parallel workers", async () => {
    const [firstClaim, secondClaim] = await Promise.all([
      notificationService.claimDueNotifications(1, 120),
      notificationService.claimDueNotifications(1, 120),
    ]);
    const claimed = [...firstClaim, ...secondClaim];
    const testNotificationClaims = claimed.filter((notification) => notification.id === ids.notification);

    expect(testNotificationClaims).toHaveLength(1);

    const row = await prisma.notificationLog.findUniqueOrThrow({
      where: {
        id: ids.notification,
      },
      select: {
        status: true,
        nextRetryAt: true,
      },
    });

    expect(row.status).toBe("sending");
    expect(row.nextRetryAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it("reclaims expired sending notifications", async () => {
    await prisma.notificationLog.update({
      where: {
        id: ids.notification,
      },
      data: {
        status: "sending",
        nextRetryAt: new Date(Date.now() - 1_000),
      },
    });

    const claimed = await notificationService.claimDueNotifications(1, 120);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe(ids.notification);
  });

  it("marks stale sending attempts as timed out when reclaiming an expired notification", async () => {
    await prisma.notificationLog.update({
      where: {
        id: ids.notification,
      },
      data: {
        status: "sending",
        nextRetryAt: new Date(Date.now() - 1_000),
      },
    });
    await prisma.notificationDeliveryAttempt.create({
      data: {
        notificationLogId: ids.notification,
        attempt: 1,
        status: "sending",
        provider: "test",
        startedAt: new Date(Date.now() - 10 * 60_000),
      },
    });

    const claimed = await notificationService.claimDueNotifications(1, 120);

    expect(claimed).toHaveLength(1);

    const staleAttempt = await prisma.notificationDeliveryAttempt.findFirstOrThrow({
      where: {
        notificationLogId: ids.notification,
        attempt: 1,
      },
    });

    expect(staleAttempt.status).toBe("timed_out");
    expect(staleAttempt.completedAt).not.toBeNull();
    expect(staleAttempt.errorMessage).toBe("Delivery attempt timed out after notification lease expired");
  });

  it("does not let a late worker mark a timed out attempt as sent", async () => {
    await prisma.notificationLog.update({
      where: {
        id: ids.notification,
      },
      data: {
        status: "sending",
        nextRetryAt: new Date(Date.now() - 1_000),
      },
    });
    const staleAttempt = await prisma.notificationDeliveryAttempt.create({
      data: {
        notificationLogId: ids.notification,
        attempt: 1,
        status: "sending",
        provider: "test",
        startedAt: new Date(Date.now() - 10 * 60_000),
      },
    });

    await notificationService.claimDueNotifications(1, 120);
    await notificationService.markSent(ids.notification, "late-provider-message-id", {
      deliveryAttemptId: staleAttempt.id,
    });

    const [notification, attempt] = await Promise.all([
      prisma.notificationLog.findUniqueOrThrow({
        where: {
          id: ids.notification,
        },
      }),
      prisma.notificationDeliveryAttempt.findUniqueOrThrow({
        where: {
          id: staleAttempt.id,
        },
      }),
    ]);

    expect(notification.status).toBe("sending");
    expect(notification.providerMessageId).toBeNull();
    expect(notification.sentAt).toBeNull();
    expect(attempt.status).toBe("timed_out");
    expect(attempt.providerMessageId).toBeNull();
  });

  it("records provider success after incident acknowledgement as sent_after_ack", async () => {
    await prisma.notificationLog.update({
      where: {
        id: ids.notification,
      },
      data: {
        status: "sending",
        nextRetryAt: new Date(Date.now() + 120_000),
      },
    });
    const deliveryAttempt = await prisma.notificationDeliveryAttempt.create({
      data: {
        notificationLogId: ids.notification,
        attempt: 1,
        status: "sending",
        provider: "test",
      },
    });
    await prisma.incident.update({
      where: {
        id: ids.incident,
      },
      data: {
        status: "acknowledged",
      },
    });

    const updated = await notificationService.markSent(ids.notification, "provider-after-ack", {
      deliveryAttemptId: deliveryAttempt.id,
    });
    const attempt = await prisma.notificationDeliveryAttempt.findUniqueOrThrow({
      where: {
        id: deliveryAttempt.id,
      },
    });

    expect(updated.status).toBe("sent_after_ack");
    expect(updated.provider_message_id).toBe("provider-after-ack");
    expect(updated.error_message).toBe("Incident is acknowledged");
    expect(updated.sent_at).not.toBeNull();
    expect(attempt.status).toBe("sent");
    expect(attempt.providerMessageId).toBe("provider-after-ack");
  });

  it("does not claim pending notifications before their first due time", async () => {
    await prisma.notificationLog.update({
      where: {
        id: ids.notification,
      },
      data: {
        status: "pending",
        nextRetryAt: new Date(Date.now() + 60_000),
      },
    });

    const claimed = await notificationService.claimDueNotifications(1, 120);
    const testNotificationClaims = claimed.filter((notification) => notification.id === ids.notification);

    expect(testNotificationClaims).toHaveLength(0);

    const row = await prisma.notificationLog.findUniqueOrThrow({
      where: {
        id: ids.notification,
      },
      select: {
        status: true,
      },
    });

    expect(row.status).toBe("pending");
  });

  it("uses provider retry-after when marking a notification failed", async () => {
    const startedAt = Date.now();
    const updated = await notificationService.markFailed(ids.notification, "Slack rate limited", {
      retryAfterSeconds: 7,
    });
    const retryAt = updated.next_retry_at ? Date.parse(updated.next_retry_at) : null;

    expect(updated.status).toBe("retrying");
    expect(updated.attempt).toBe(1);
    expect(retryAt).not.toBeNull();
    expect(retryAt).toBeGreaterThanOrEqual(startedAt + 7_000);
    expect(retryAt).toBeLessThanOrEqual(Date.now() + 8_000);
  });

  async function cleanup() {
    await cleanupTestRecords({
      incidentIds: [ids.incident],
      resourceIds: [ids.notification],
      serviceIds: [ids.service],
      teamIds: [ids.team],
      workspaceIds: [ids.workspace],
    });
  }
});
