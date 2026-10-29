import { createLogger } from "@im/logger";
import { Prisma, PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const logger = createLogger({ service: "db-seed" });
const prisma = new PrismaClient();
const devWebhookSecret = "dev-webhook-secret";
const seedUserPassword = "Password123!";
const primarySlackWebhookUrl = "https://hooks.slack.com/services/T00000000/B00000000/PRIMARYPRIMARYPRIMARY";
const secondarySlackWebhookUrl = "https://hooks.slack.com/services/T00000000/B00000000/SECONDARYSECONDARYSECOND";
const teamSlackWebhookUrl = "https://hooks.slack.com/services/T00000000/B00000000/COREPLATFORMALERTS";
const primaryEmailWebhookUrl = "https://email-relay.example.com/pagerwho/primary";
const secondaryEmailWebhookUrl = "https://email-relay.example.com/pagerwho/secondary";
const primaryPhoneNumber = "+15550101001";
const secondaryPhoneNumber = "+15550101002";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  primaryUser: "11111111-1111-4111-8111-111111111111",
  secondaryUser: "22222222-2222-4222-8222-222222222222",
  team: "33333333-3333-4333-8333-333333333333",
  escalationPolicy: "44444444-4444-4444-8444-444444444444",
  escalationStepPrimary: "55555555-5555-4555-8555-555555555551",
  escalationStepSecondary: "55555555-5555-4555-8555-555555555552",
  escalationStepChannel: "55555555-5555-4555-8555-555555555553",
  service: "66666666-6666-4666-8666-666666666666",
  webhookEndpoint: "77777777-7777-4777-8777-777777777777",
  schedule: "88888888-8888-4888-8888-888888888888",
  primaryRotation: "99999999-9999-4999-8999-999999999991",
  secondaryRotation: "99999999-9999-4999-8999-999999999992",
  triggeredIncident: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  acknowledgedIncident: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  resolvedIncident: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  triggeredCreatedTimeline: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  triggeredNotificationTimeline: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  acknowledgedCreatedTimeline: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  acknowledgedTimeline: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
  resolvedCreatedTimeline: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
  resolvedTimeline: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6",
  triggeredSlackNotification: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  triggeredEmailNotification: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  acknowledgedSlackNotification: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  resolvedWebhookNotification: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4",
};

async function main() {
  const devWebhookSecretHash = await hashWebhookSecret(devWebhookSecret);
  const primaryUser = await prisma.user.upsert({
    where: { id: ids.primaryUser },
    update: {
      email: "testuser1@example.com",
      emailVerifiedAt: new Date(),
      name: "testuser1",
    },
    create: {
      id: ids.primaryUser,
      email: "testuser1@example.com",
      emailVerifiedAt: new Date(),
      name: "testuser1",
    },
  });

  const secondaryUser = await prisma.user.upsert({
    where: { id: ids.secondaryUser },
    update: {
      email: "testuser2@example.com",
      emailVerifiedAt: new Date(),
      name: "testuser2",
    },
    create: {
      id: ids.secondaryUser,
      email: "testuser2@example.com",
      emailVerifiedAt: new Date(),
      name: "testuser2",
    },
  });

  const seedPasswordHash = await hashPassword(seedUserPassword);
  await prisma.userPasswordCredential.upsert({
    where: {
      userId: primaryUser.id,
    },
    update: {
      passwordHash: seedPasswordHash,
    },
    create: {
      passwordHash: seedPasswordHash,
      userId: primaryUser.id,
    },
  });
  await prisma.userPasswordCredential.upsert({
    where: {
      userId: secondaryUser.id,
    },
    update: {
      passwordHash: seedPasswordHash,
    },
    create: {
      passwordHash: seedPasswordHash,
      userId: secondaryUser.id,
    },
  });

  await prisma.platformAdminRole.upsert({
    where: {
      userId_role: {
        role: "platform_admin",
        userId: primaryUser.id,
      },
    },
    update: {},
    create: {
      assignedByUserId: primaryUser.id,
      role: "platform_admin",
      userId: primaryUser.id,
    },
  });

  await seedNotificationRouting(primaryUser.id, {
    slackWebhookUrl: primarySlackWebhookUrl,
    emailWebhookUrl: primaryEmailWebhookUrl,
    phoneNumber: primaryPhoneNumber,
    smsDelaySeconds: 300,
    phoneDelaySeconds: 600,
  });

  await seedNotificationRouting(secondaryUser.id, {
    slackWebhookUrl: secondarySlackWebhookUrl,
    emailWebhookUrl: secondaryEmailWebhookUrl,
    phoneNumber: secondaryPhoneNumber,
    smsDelaySeconds: 300,
    phoneDelaySeconds: 600,
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: ids.workspace },
    update: {
      name: "Default Workspace",
      slug: "default-workspace",
      createdByUserId: primaryUser.id,
    },
    create: {
      id: ids.workspace,
      name: "Default Workspace",
      slug: "default-workspace",
      createdByUserId: primaryUser.id,
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: primaryUser.id,
      },
    },
    update: {
      role: "owner",
    },
    create: {
      workspaceId: workspace.id,
      userId: primaryUser.id,
      role: "owner",
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: secondaryUser.id,
      },
    },
    update: {
      role: "responder",
    },
    create: {
      workspaceId: workspace.id,
      userId: secondaryUser.id,
      role: "responder",
    },
  });

  await prisma.workspaceMemberRole.createMany({
    data: [
      {
        assignedByUserId: primaryUser.id,
        roleKey: "project_owner",
        workspaceId: workspace.id,
        userId: primaryUser.id,
      },
      {
        assignedByUserId: primaryUser.id,
        roleKey: "incident_responder",
        workspaceId: workspace.id,
        userId: secondaryUser.id,
      },
      {
        assignedByUserId: primaryUser.id,
        roleKey: "notification_recipient",
        workspaceId: workspace.id,
        userId: secondaryUser.id,
      },
    ],
    skipDuplicates: true,
  });

  const team = await prisma.team.upsert({
    where: { id: ids.team },
    update: {
      workspaceId: workspace.id,
      name: "Core Platform",
    },
    create: {
      id: ids.team,
      workspaceId: workspace.id,
      name: "Core Platform",
    },
  });

  await prisma.teamMember.upsert({
    where: {
      teamId_userId: {
        teamId: team.id,
        userId: primaryUser.id,
      },
    },
    update: {
      role: "primary",
    },
    create: {
      teamId: team.id,
      userId: primaryUser.id,
      role: "primary",
    },
  });

  await prisma.teamMember.upsert({
    where: {
      teamId_userId: {
        teamId: team.id,
        userId: secondaryUser.id,
      },
    },
    update: {
      role: "secondary",
    },
    create: {
      teamId: team.id,
      userId: secondaryUser.id,
      role: "secondary",
    },
  });

  const escalationPolicy = await prisma.escalationPolicy.upsert({
    where: { id: ids.escalationPolicy },
    update: {
      workspaceId: workspace.id,
      name: "Core Platform Default Escalation",
      repeatEnabled: true,
      repeatIntervalSeconds: 600,
      repeatLimit: 3,
    },
    create: {
      id: ids.escalationPolicy,
      workspaceId: workspace.id,
      name: "Core Platform Default Escalation",
      repeatEnabled: true,
      repeatIntervalSeconds: 600,
      repeatLimit: 3,
    },
  });

  await prisma.escalationPolicyStep.upsert({
    where: {
      policyId_stepOrder: {
        policyId: escalationPolicy.id,
        stepOrder: 1,
      },
    },
    update: {
      id: ids.escalationStepPrimary,
      delaySeconds: 0,
      targetType: "primary_on_call",
      targetId: ids.schedule,
    },
    create: {
      id: ids.escalationStepPrimary,
      policyId: escalationPolicy.id,
      stepOrder: 1,
      delaySeconds: 0,
      targetType: "primary_on_call",
      targetId: ids.schedule,
    },
  });

  await prisma.escalationPolicyStep.upsert({
    where: {
      policyId_stepOrder: {
        policyId: escalationPolicy.id,
        stepOrder: 2,
      },
    },
    update: {
      id: ids.escalationStepSecondary,
      delaySeconds: 300,
      targetType: "secondary_on_call",
      targetId: ids.schedule,
    },
    create: {
      id: ids.escalationStepSecondary,
      policyId: escalationPolicy.id,
      stepOrder: 2,
      delaySeconds: 300,
      targetType: "secondary_on_call",
      targetId: ids.schedule,
    },
  });

  await prisma.escalationPolicyStep.upsert({
    where: {
      policyId_stepOrder: {
        policyId: escalationPolicy.id,
        stepOrder: 3,
      },
    },
    update: {
      id: ids.escalationStepChannel,
      delaySeconds: 600,
      targetType: "team_channel",
      targetId: teamSlackWebhookUrl,
    },
    create: {
      id: ids.escalationStepChannel,
      policyId: escalationPolicy.id,
      stepOrder: 3,
      delaySeconds: 600,
      targetType: "team_channel",
      targetId: teamSlackWebhookUrl,
    },
  });

  const service = await prisma.service.upsert({
    where: { id: ids.service },
    update: {
      workspaceId: workspace.id,
      name: "Checkout API",
      description: "Demo service for incident management MVP",
      teamId: team.id,
      escalationPolicyId: escalationPolicy.id,
    },
    create: {
      id: ids.service,
      workspaceId: workspace.id,
      name: "Checkout API",
      description: "Demo service for incident management MVP",
      teamId: team.id,
      escalationPolicyId: escalationPolicy.id,
    },
  });

  await prisma.webhookEndpoint.upsert({
    where: { id: ids.webhookEndpoint },
    update: {
      name: "Service Webhook",
      serviceId: service.id,
      secretHash: devWebhookSecretHash,
      disabledAt: null,
    },
    create: {
      id: ids.webhookEndpoint,
      name: "Service Webhook",
      serviceId: service.id,
      secretHash: devWebhookSecretHash,
    },
  });

  const schedule = await prisma.onCallSchedule.upsert({
    where: { id: ids.schedule },
    update: {
      workspaceId: workspace.id,
      name: "Core Platform Weekly Rotation",
      teamId: null,
      serviceId: null,
      timezone: "Asia/Seoul",
    },
    create: {
      id: ids.schedule,
      workspaceId: workspace.id,
      name: "Core Platform Weekly Rotation",
      teamId: null,
      serviceId: null,
      timezone: "Asia/Seoul",
    },
  });

  const primaryRotation = await prisma.onCallRotation.upsert({
    where: { id: ids.primaryRotation },
    update: {
      scheduleId: schedule.id,
      layer: "primary",
      rotationType: "weekly",
      rotationInterval: 1,
      startsAt: new Date("2026-01-01T00:00:00.000+09:00"),
      timezone: "Asia/Seoul",
    },
    create: {
      id: ids.primaryRotation,
      scheduleId: schedule.id,
      layer: "primary",
      rotationType: "weekly",
      rotationInterval: 1,
      startsAt: new Date("2026-01-01T00:00:00.000+09:00"),
      timezone: "Asia/Seoul",
    },
  });

  const secondaryRotation = await prisma.onCallRotation.upsert({
    where: { id: ids.secondaryRotation },
    update: {
      scheduleId: schedule.id,
      layer: "secondary",
      rotationType: "weekly",
      rotationInterval: 1,
      startsAt: new Date("2026-01-01T00:00:00.000+09:00"),
      timezone: "Asia/Seoul",
    },
    create: {
      id: ids.secondaryRotation,
      scheduleId: schedule.id,
      layer: "secondary",
      rotationType: "weekly",
      rotationInterval: 1,
      startsAt: new Date("2026-01-01T00:00:00.000+09:00"),
      timezone: "Asia/Seoul",
    },
  });

  await prisma.onCallRotationParticipant.upsert({
    where: {
      rotationId_userId: {
        rotationId: primaryRotation.id,
        userId: primaryUser.id,
      },
    },
    update: {
      position: 0,
    },
    create: {
      rotationId: primaryRotation.id,
      userId: primaryUser.id,
      position: 0,
    },
  });

  await prisma.onCallRotationParticipant.upsert({
    where: {
      rotationId_userId: {
        rotationId: secondaryRotation.id,
        userId: secondaryUser.id,
      },
    },
    update: {
      position: 0,
    },
    create: {
      rotationId: secondaryRotation.id,
      userId: secondaryUser.id,
      position: 0,
    },
  });

  const now = new Date();
  const policySnapshot = {
    id: escalationPolicy.id,
    name: escalationPolicy.name,
    repeat_enabled: escalationPolicy.repeatEnabled,
    repeat_interval_seconds: escalationPolicy.repeatIntervalSeconds,
    repeat_limit: escalationPolicy.repeatLimit,
    steps: [
      {
        id: ids.escalationStepPrimary,
        step_order: 1,
        delay_seconds: 0,
        target_type: "primary_on_call",
        target_id: ids.schedule,
      },
      {
        id: ids.escalationStepSecondary,
        step_order: 2,
        delay_seconds: 300,
        target_type: "secondary_on_call",
        target_id: ids.schedule,
      },
      {
        id: ids.escalationStepChannel,
        step_order: 3,
        delay_seconds: 600,
        target_type: "team_channel",
        target_id: "core-platform-alerts",
      },
    ],
  };

  const triggeredIncident = await prisma.incident.upsert({
    where: { id: ids.triggeredIncident },
    update: {
      workspaceId: workspace.id,
      serviceId: service.id,
      title: "Checkout API latency spike",
      description: "p95 latency is above the critical threshold for checkout requests.",
      severity: "critical",
      priority: "P1",
      status: "triggered",
      source: "seed",
      fingerprint: "seed:checkout-api-latency-spike",
      dedupKey: "checkout-api-latency-spike",
      acknowledgedById: null,
      acknowledgedAt: null,
      resolvedById: null,
      resolvedAt: null,
    },
    create: {
      id: ids.triggeredIncident,
      workspaceId: workspace.id,
      serviceId: service.id,
      title: "Checkout API latency spike",
      description: "p95 latency is above the critical threshold for checkout requests.",
      severity: "critical",
      priority: "P1",
      status: "triggered",
      source: "seed",
      fingerprint: "seed:checkout-api-latency-spike",
      dedupKey: "checkout-api-latency-spike",
    },
  });

  const acknowledgedIncident = await prisma.incident.upsert({
    where: { id: ids.acknowledgedIncident },
    update: {
      workspaceId: workspace.id,
      serviceId: service.id,
      title: "Payment webhook delivery failures",
      description: "Payment provider callbacks are failing intermittently.",
      severity: "high",
      priority: "P2",
      status: "acknowledged",
      source: "seed",
      fingerprint: "seed:payment-webhook-delivery-failures",
      dedupKey: "payment-webhook-delivery-failures",
      acknowledgedById: primaryUser.id,
      acknowledgedAt: new Date(now.getTime() - 20 * 60 * 1000),
      resolvedById: null,
      resolvedAt: null,
    },
    create: {
      id: ids.acknowledgedIncident,
      workspaceId: workspace.id,
      serviceId: service.id,
      title: "Payment webhook delivery failures",
      description: "Payment provider callbacks are failing intermittently.",
      severity: "high",
      priority: "P2",
      status: "acknowledged",
      source: "seed",
      fingerprint: "seed:payment-webhook-delivery-failures",
      dedupKey: "payment-webhook-delivery-failures",
      acknowledgedById: primaryUser.id,
      acknowledgedAt: new Date(now.getTime() - 20 * 60 * 1000),
    },
  });

  const resolvedIncident = await prisma.incident.upsert({
    where: { id: ids.resolvedIncident },
    update: {
      workspaceId: workspace.id,
      serviceId: service.id,
      title: "Inventory sync delay",
      description: "Inventory replication lag briefly exceeded the warning threshold.",
      severity: "medium",
      priority: "P3",
      status: "resolved",
      source: "seed",
      fingerprint: "seed:inventory-sync-delay",
      dedupKey: "inventory-sync-delay",
      acknowledgedById: primaryUser.id,
      acknowledgedAt: new Date(now.getTime() - 80 * 60 * 1000),
      resolvedById: secondaryUser.id,
      resolvedAt: new Date(now.getTime() - 50 * 60 * 1000),
    },
    create: {
      id: ids.resolvedIncident,
      workspaceId: workspace.id,
      serviceId: service.id,
      title: "Inventory sync delay",
      description: "Inventory replication lag briefly exceeded the warning threshold.",
      severity: "medium",
      priority: "P3",
      status: "resolved",
      source: "seed",
      fingerprint: "seed:inventory-sync-delay",
      dedupKey: "inventory-sync-delay",
      acknowledgedById: primaryUser.id,
      acknowledgedAt: new Date(now.getTime() - 80 * 60 * 1000),
      resolvedById: secondaryUser.id,
      resolvedAt: new Date(now.getTime() - 50 * 60 * 1000),
    },
  });

  await prisma.incidentEscalationState.upsert({
    where: { incidentId: triggeredIncident.id },
    update: {
      policyId: escalationPolicy.id,
      policySnapshot,
      currentStep: 1,
      repeatIteration: 0,
      nextRunAt: new Date(now.getTime() + 5 * 60 * 1000),
      status: "active",
    },
    create: {
      incidentId: triggeredIncident.id,
      policyId: escalationPolicy.id,
      policySnapshot,
      currentStep: 1,
      repeatIteration: 0,
      nextRunAt: new Date(now.getTime() + 5 * 60 * 1000),
      status: "active",
    },
  });

  await prisma.incidentEscalationState.upsert({
    where: { incidentId: acknowledgedIncident.id },
    update: {
      policyId: escalationPolicy.id,
      policySnapshot,
      currentStep: 2,
      repeatIteration: 0,
      nextRunAt: null,
      status: "stopped",
    },
    create: {
      incidentId: acknowledgedIncident.id,
      policyId: escalationPolicy.id,
      policySnapshot,
      currentStep: 2,
      repeatIteration: 0,
      nextRunAt: null,
      status: "stopped",
    },
  });

  await prisma.incidentEscalationState.upsert({
    where: { incidentId: resolvedIncident.id },
    update: {
      policyId: escalationPolicy.id,
      policySnapshot,
      currentStep: 3,
      repeatIteration: 0,
      nextRunAt: null,
      status: "stopped",
    },
    create: {
      incidentId: resolvedIncident.id,
      policyId: escalationPolicy.id,
      policySnapshot,
      currentStep: 3,
      repeatIteration: 0,
      nextRunAt: null,
      status: "stopped",
    },
  });

  await prisma.incidentTimelineEntry.upsert({
    where: { id: ids.triggeredCreatedTimeline },
    update: {
      incidentId: triggeredIncident.id,
      type: "incident.created",
      message: "Incident created from seed data",
      metadata: { severity: "critical" },
      actorUserId: null,
    },
    create: {
      id: ids.triggeredCreatedTimeline,
      incidentId: triggeredIncident.id,
      type: "incident.created",
      message: "Incident created from seed data",
      metadata: { severity: "critical" },
    },
  });

  await prisma.incidentTimelineEntry.upsert({
    where: { id: ids.triggeredNotificationTimeline },
    update: {
      incidentId: triggeredIncident.id,
      type: "notification.sent",
      message: "Slack notification queued for primary on-call",
      metadata: { channel: "slack", target: "primary_on_call" },
      actorUserId: null,
    },
    create: {
      id: ids.triggeredNotificationTimeline,
      incidentId: triggeredIncident.id,
      type: "notification.sent",
      message: "Slack notification queued for primary on-call",
      metadata: { channel: "slack", target: "primary_on_call" },
    },
  });

  await prisma.incidentTimelineEntry.upsert({
    where: { id: ids.acknowledgedCreatedTimeline },
    update: {
      incidentId: acknowledgedIncident.id,
      type: "incident.created",
      message: "Incident created from seed data",
      metadata: { severity: "high" },
      actorUserId: null,
    },
    create: {
      id: ids.acknowledgedCreatedTimeline,
      incidentId: acknowledgedIncident.id,
      type: "incident.created",
      message: "Incident created from seed data",
      metadata: { severity: "high" },
    },
  });

  await prisma.incidentTimelineEntry.upsert({
    where: { id: ids.acknowledgedTimeline },
    update: {
      incidentId: acknowledgedIncident.id,
      type: "incident.acknowledged",
      message: `Incident acknowledged by ${primaryUser.name}`,
      metadata: Prisma.JsonNull,
      actorUserId: primaryUser.id,
    },
    create: {
      id: ids.acknowledgedTimeline,
      incidentId: acknowledgedIncident.id,
      type: "incident.acknowledged",
      message: `Incident acknowledged by ${primaryUser.name}`,
      actorUserId: primaryUser.id,
    },
  });

  await prisma.incidentTimelineEntry.upsert({
    where: { id: ids.resolvedCreatedTimeline },
    update: {
      incidentId: resolvedIncident.id,
      type: "incident.created",
      message: "Incident created from seed data",
      metadata: { severity: "medium" },
      actorUserId: null,
    },
    create: {
      id: ids.resolvedCreatedTimeline,
      incidentId: resolvedIncident.id,
      type: "incident.created",
      message: "Incident created from seed data",
      metadata: { severity: "medium" },
    },
  });

  await prisma.incidentTimelineEntry.upsert({
    where: { id: ids.resolvedTimeline },
    update: {
      incidentId: resolvedIncident.id,
      type: "incident.resolved",
      message: `Incident resolved by ${secondaryUser.name}`,
      metadata: Prisma.JsonNull,
      actorUserId: secondaryUser.id,
    },
    create: {
      id: ids.resolvedTimeline,
      incidentId: resolvedIncident.id,
      type: "incident.resolved",
      message: `Incident resolved by ${secondaryUser.name}`,
      actorUserId: secondaryUser.id,
    },
  });

  await prisma.notificationLog.upsert({
    where: { id: ids.triggeredSlackNotification },
    update: {
      incidentId: triggeredIncident.id,
      policyStepId: ids.escalationStepPrimary,
      repeatIteration: 0,
      channel: "slack",
      targetType: "primary_on_call",
      targetId: primaryUser.id,
      targetAddress: primarySlackWebhookUrl,
      status: "sent",
      attempt: 1,
      idempotencyKey: "seed:triggered:slack:primary",
      providerMessageId: "seed-slack-message-1",
      errorMessage: null,
      nextRetryAt: null,
      sentAt: new Date(now.getTime() - 55 * 60 * 1000),
    },
    create: {
      id: ids.triggeredSlackNotification,
      incidentId: triggeredIncident.id,
      policyStepId: ids.escalationStepPrimary,
      repeatIteration: 0,
      channel: "slack",
      targetType: "primary_on_call",
      targetId: primaryUser.id,
      targetAddress: primarySlackWebhookUrl,
      status: "sent",
      attempt: 1,
      idempotencyKey: "seed:triggered:slack:primary",
      providerMessageId: "seed-slack-message-1",
      sentAt: new Date(now.getTime() - 55 * 60 * 1000),
    },
  });

  await prisma.notificationLog.upsert({
    where: { id: ids.triggeredEmailNotification },
    update: {
      incidentId: triggeredIncident.id,
      policyStepId: ids.escalationStepSecondary,
      repeatIteration: 0,
      channel: "email",
      targetType: "secondary_on_call",
      targetId: secondaryUser.id,
      targetAddress: secondaryEmailWebhookUrl,
      status: "retrying",
      attempt: 2,
      idempotencyKey: "seed:triggered:email:secondary",
      providerMessageId: null,
      errorMessage: "Temporary SMTP error",
      nextRetryAt: new Date(now.getTime() + 10 * 60 * 1000),
      sentAt: null,
    },
    create: {
      id: ids.triggeredEmailNotification,
      incidentId: triggeredIncident.id,
      policyStepId: ids.escalationStepSecondary,
      repeatIteration: 0,
      channel: "email",
      targetType: "secondary_on_call",
      targetId: secondaryUser.id,
      targetAddress: secondaryEmailWebhookUrl,
      status: "retrying",
      attempt: 2,
      idempotencyKey: "seed:triggered:email:secondary",
      errorMessage: "Temporary SMTP error",
      nextRetryAt: new Date(now.getTime() + 10 * 60 * 1000),
    },
  });

  await prisma.notificationLog.upsert({
    where: { id: ids.acknowledgedSlackNotification },
    update: {
      incidentId: acknowledgedIncident.id,
      policyStepId: ids.escalationStepPrimary,
      repeatIteration: 0,
      channel: "slack",
      targetType: "primary_on_call",
      targetId: primaryUser.id,
      targetAddress: primarySlackWebhookUrl,
      status: "sent",
      attempt: 1,
      idempotencyKey: "seed:acknowledged:slack:primary",
      providerMessageId: "seed-slack-message-2",
      errorMessage: null,
      nextRetryAt: null,
      sentAt: new Date(now.getTime() - 25 * 60 * 1000),
    },
    create: {
      id: ids.acknowledgedSlackNotification,
      incidentId: acknowledgedIncident.id,
      policyStepId: ids.escalationStepPrimary,
      repeatIteration: 0,
      channel: "slack",
      targetType: "primary_on_call",
      targetId: primaryUser.id,
      targetAddress: primarySlackWebhookUrl,
      status: "sent",
      attempt: 1,
      idempotencyKey: "seed:acknowledged:slack:primary",
      providerMessageId: "seed-slack-message-2",
      sentAt: new Date(now.getTime() - 25 * 60 * 1000),
    },
  });

  await prisma.notificationLog.upsert({
    where: { id: ids.resolvedWebhookNotification },
    update: {
      incidentId: resolvedIncident.id,
      policyStepId: ids.escalationStepChannel,
      repeatIteration: 0,
      channel: "slack",
      targetType: "team_channel",
      targetId: teamSlackWebhookUrl,
      targetAddress: teamSlackWebhookUrl,
      status: "skipped",
      attempt: 0,
      idempotencyKey: "seed:resolved:slack:team-channel",
      providerMessageId: null,
      errorMessage: "Incident was already resolved",
      nextRetryAt: null,
      sentAt: null,
    },
    create: {
      id: ids.resolvedWebhookNotification,
      incidentId: resolvedIncident.id,
      policyStepId: ids.escalationStepChannel,
      repeatIteration: 0,
      channel: "slack",
      targetType: "team_channel",
      targetId: teamSlackWebhookUrl,
      targetAddress: teamSlackWebhookUrl,
      status: "skipped",
      attempt: 0,
      idempotencyKey: "seed:resolved:slack:team-channel",
      errorMessage: "Incident was already resolved",
    },
  });

  const counts = await Promise.all([
    prisma.workspace.count(),
    prisma.workspaceMember.count(),
    prisma.user.count(),
    prisma.team.count(),
    prisma.service.count(),
    prisma.webhookEndpoint.count(),
    prisma.escalationPolicy.count(),
    prisma.onCallSchedule.count(),
    prisma.incident.count(),
    prisma.incidentTimelineEntry.count(),
    prisma.notificationLog.count(),
  ]);

  const seedCounts = {
    workspaces: counts[0],
    workspaceMembers: counts[1],
    users: counts[2],
    teams: counts[3],
    services: counts[4],
    webhookEndpoints: counts[5],
    escalationPolicies: counts[6],
    onCallSchedules: counts[7],
    incidents: counts[8],
    timelineEntries: counts[9],
    notificationLogs: counts[10],
  };

  logger.info("Seed complete", {
    counts: seedCounts,
  });
  logger.info("Seed login accounts ready", {
    login_password: seedUserPassword,
    login_users: ["testuser1@example.com", "testuser2@example.com"],
  });
  logger.info("Development webhook endpoint seeded");
}

main()
  .catch((error) => {
    logger.error("Seed failed", { error });
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function seedNotificationRouting(
  userId: string,
  input: {
    slackWebhookUrl: string;
    emailWebhookUrl: string;
    phoneNumber: string;
    smsDelaySeconds: number;
    phoneDelaySeconds: number;
  },
) {
  await prisma.userNotificationContact.upsert({
    where: {
      userId_type: {
        userId,
        type: "slack_webhook",
      },
    },
    update: {
      address: input.slackWebhookUrl,
    },
    create: {
      userId,
      type: "slack_webhook",
      address: input.slackWebhookUrl,
    },
  });

  await prisma.userNotificationContact.upsert({
    where: {
      userId_type: {
        userId,
        type: "email_webhook",
      },
    },
    update: {
      address: input.emailWebhookUrl,
    },
    create: {
      userId,
      type: "email_webhook",
      address: input.emailWebhookUrl,
    },
  });

  await prisma.userNotificationContact.upsert({
    where: {
      userId_type: {
        userId,
        type: "phone_number",
      },
    },
    update: {
      address: input.phoneNumber,
      verifiedAt: new Date(),
      verificationProvider: "seed",
    },
    create: {
      userId,
      type: "phone_number",
      address: input.phoneNumber,
      verifiedAt: new Date(),
      verificationProvider: "seed",
    },
  });

  for (const type of ["phone_sms", "phone_voice"] as const) {
    await prisma.userNotificationContact.upsert({
      where: {
        userId_type: {
          userId,
          type,
        },
      },
      update: {
        address: input.phoneNumber,
        verifiedAt: new Date(),
        verificationProvider: "seed",
      },
      create: {
        userId,
        type,
        address: input.phoneNumber,
        verifiedAt: new Date(),
        verificationProvider: "seed",
      },
    });
  }

  const preferences = [
    { channel: "slack", enabled: true, delaySeconds: 0 },
    { channel: "email", enabled: true, delaySeconds: 0 },
    { channel: "sms", enabled: true, delaySeconds: input.smsDelaySeconds },
    { channel: "phone", enabled: true, delaySeconds: input.phoneDelaySeconds },
  ] as const;

  for (const preference of preferences) {
    await prisma.userNotificationPreference.upsert({
      where: {
        userId_channel: {
          userId,
          channel: preference.channel,
        },
      },
      update: {
        enabled: preference.enabled,
        delaySeconds: preference.delaySeconds,
      },
      create: {
        userId,
        channel: preference.channel,
        enabled: preference.enabled,
        delaySeconds: preference.delaySeconds,
      },
    });
  }
}

async function hashWebhookSecret(secret: string) {
  const pepper = process.env.WEBHOOK_SECRET_PEPPER ?? "dev-webhook-pepper";
  const input = `${pepper}:${secret}`;

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return `sha256:${bytesToHex(new Uint8Array(digest))}`;
  }

  return `fallback:${hashString(input)}`;
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derivedKey = await scryptAsync(password, salt, 64, {
    N: 16384,
    p: 1,
    r: 8,
  }) as Buffer;

  return ["scrypt", 16384, 8, 1, salt, derivedKey.toString("base64url")].join("$");
}

function scryptAsync(password: string, salt: string, keylen: number, options: crypto.ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }

  return Math.abs(hash).toString(16);
}
