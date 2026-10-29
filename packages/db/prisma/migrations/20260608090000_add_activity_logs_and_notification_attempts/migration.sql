CREATE TYPE "NotificationDeliveryAttemptStatus" AS ENUM ('sending', 'sent', 'failed', 'skipped');

CREATE TABLE "activity_logs" (
  "id" UUID NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" UUID,
  "action" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "actor_user_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_delivery_attempts" (
  "id" UUID NOT NULL,
  "notification_log_id" UUID NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" "NotificationDeliveryAttemptStatus" NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "error_message" TEXT,
  "retry_after_seconds" INTEGER,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "metadata" JSONB,

  CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_logs_resource_type_resource_id_created_at_idx"
  ON "activity_logs"("resource_type", "resource_id", "created_at");

CREATE INDEX "activity_logs_action_created_at_idx"
  ON "activity_logs"("action", "created_at");

CREATE UNIQUE INDEX "notification_delivery_attempts_notification_log_id_attempt_key"
  ON "notification_delivery_attempts"("notification_log_id", "attempt");

CREATE INDEX "notification_delivery_attempts_notification_log_id_started_at_idx"
  ON "notification_delivery_attempts"("notification_log_id", "started_at");

CREATE INDEX "notification_delivery_attempts_status_started_at_idx"
  ON "notification_delivery_attempts"("status", "started_at");

ALTER TABLE "activity_logs"
  ADD CONSTRAINT "activity_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_delivery_attempts"
  ADD CONSTRAINT "notification_delivery_attempts_notification_log_id_fkey"
  FOREIGN KEY ("notification_log_id") REFERENCES "notification_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
