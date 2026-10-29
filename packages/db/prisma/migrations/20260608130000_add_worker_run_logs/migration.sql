CREATE TYPE "WorkerRunStatus" AS ENUM ('running', 'succeeded', 'failed');

CREATE TABLE "worker_run_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "worker_name" TEXT NOT NULL,
  "status" "WorkerRunStatus" NOT NULL DEFAULT 'running',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "processed_count" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "metadata" JSONB,

  CONSTRAINT "worker_run_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "worker_run_logs_worker_name_started_at_idx" ON "worker_run_logs"("worker_name", "started_at");
CREATE INDEX "worker_run_logs_status_started_at_idx" ON "worker_run_logs"("status", "started_at");

CREATE INDEX "incident_escalation_states_status_next_run_at_incident_id_idx" ON "incident_escalation_states"("status", "next_run_at", "incident_id");
CREATE INDEX "notification_logs_status_created_at_id_idx" ON "notification_logs"("status", "created_at", "id");
