-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('triggered', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "EscalationStateStatus" AS ENUM ('active', 'paused', 'stopped', 'completed');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'retrying', 'skipped');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('slack', 'email', 'webhook');

-- CreateEnum
CREATE TYPE "EscalationTargetType" AS ENUM ('primary_on_call', 'secondary_on_call', 'user', 'team_channel', 'webhook');

-- CreateEnum
CREATE TYPE "OnCallRotationType" AS ENUM ('daily', 'weekly', 'custom');

-- CreateEnum
CREATE TYPE "OnCallLayer" AS ENUM ('primary', 'secondary');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "team_id" UUID NOT NULL,
    "escalation_policy_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'triggered',
    "source" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "dedup_key" TEXT,
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "incident_id" UUID,
    "webhook_endpoint_id" UUID,
    "event_key" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "normalized_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_timeline_entries" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "on_call_schedules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "team_id" UUID,
    "service_id" UUID,
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "on_call_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "on_call_rotations" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "layer" "OnCallLayer" NOT NULL,
    "rotation_type" "OnCallRotationType" NOT NULL,
    "rotation_interval" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "on_call_rotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "on_call_rotation_participants" (
    "rotation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "on_call_rotation_participants_pkey" PRIMARY KEY ("rotation_id","user_id")
);

-- CreateTable
CREATE TABLE "on_call_overrides" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "layer" "OnCallLayer" NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "on_call_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_policies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "repeat_enabled" BOOLEAN NOT NULL DEFAULT false,
    "repeat_interval_seconds" INTEGER,
    "repeat_limit" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escalation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_policy_steps" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "delay_seconds" INTEGER NOT NULL,
    "target_type" "EscalationTargetType" NOT NULL,
    "target_id" TEXT,

    CONSTRAINT "escalation_policy_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_escalation_states" (
    "incident_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "policy_snapshot" JSONB NOT NULL,
    "current_step" INTEGER NOT NULL,
    "repeat_iteration" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMP(3),
    "status" "EscalationStateStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_escalation_states_pkey" PRIMARY KEY ("incident_id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "policy_step_id" UUID,
    "repeat_iteration" INTEGER,
    "channel" "NotificationChannel" NOT NULL,
    "target_type" "EscalationTargetType" NOT NULL,
    "target_id" TEXT,
    "target_address" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "next_retry_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "incidents_service_id_status_fingerprint_idx" ON "incidents"("service_id", "status", "fingerprint");

-- CreateIndex
CREATE INDEX "incident_events_incident_id_idx" ON "incident_events"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_events_service_id_event_key_key" ON "incident_events"("service_id", "event_key");

-- CreateIndex
CREATE INDEX "incident_timeline_entries_incident_id_created_at_idx" ON "incident_timeline_entries"("incident_id", "created_at");

-- CreateIndex
CREATE INDEX "on_call_schedules_team_id_idx" ON "on_call_schedules"("team_id");

-- CreateIndex
CREATE INDEX "on_call_schedules_service_id_idx" ON "on_call_schedules"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "on_call_rotation_participants_rotation_id_position_key" ON "on_call_rotation_participants"("rotation_id", "position");

-- CreateIndex
CREATE INDEX "on_call_overrides_schedule_id_starts_at_ends_at_idx" ON "on_call_overrides"("schedule_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "escalation_policy_steps_policy_id_step_order_key" ON "escalation_policy_steps"("policy_id", "step_order");

-- CreateIndex
CREATE INDEX "incident_escalation_states_status_next_run_at_idx" ON "incident_escalation_states"("status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_idempotency_key_key" ON "notification_logs"("idempotency_key");

-- CreateIndex
CREATE INDEX "notification_logs_status_next_retry_at_idx" ON "notification_logs"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "notification_logs_incident_id_idx" ON "notification_logs"("incident_id");

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_escalation_policy_id_fkey" FOREIGN KEY ("escalation_policy_id") REFERENCES "escalation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline_entries" ADD CONSTRAINT "incident_timeline_entries_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline_entries" ADD CONSTRAINT "incident_timeline_entries_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_schedules" ADD CONSTRAINT "on_call_schedules_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_schedules" ADD CONSTRAINT "on_call_schedules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_rotations" ADD CONSTRAINT "on_call_rotations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "on_call_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_rotation_participants" ADD CONSTRAINT "on_call_rotation_participants_rotation_id_fkey" FOREIGN KEY ("rotation_id") REFERENCES "on_call_rotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_rotation_participants" ADD CONSTRAINT "on_call_rotation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_overrides" ADD CONSTRAINT "on_call_overrides_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "on_call_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_overrides" ADD CONSTRAINT "on_call_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_policy_steps" ADD CONSTRAINT "escalation_policy_steps_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "escalation_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_escalation_states" ADD CONSTRAINT "incident_escalation_states_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_escalation_states" ADD CONSTRAINT "incident_escalation_states_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "escalation_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_policy_step_id_fkey" FOREIGN KEY ("policy_step_id") REFERENCES "escalation_policy_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
