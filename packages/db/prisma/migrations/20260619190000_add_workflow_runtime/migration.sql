CREATE TABLE "workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "run_as_user_id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_triggers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" UUID NOT NULL,
    "event_action" TEXT NOT NULL,
    "resource_type" TEXT,
    "filters" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_triggers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" UUID NOT NULL,
    "action_order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_log_id" UUID,
    "workspace_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "actor_user_id" UUID,
    "metadata" JSONB,
    "origin" TEXT NOT NULL DEFAULT 'activity',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" UUID NOT NULL,
    "workflow_event_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_action_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_run_id" UUID NOT NULL,
    "workflow_action_id" UUID NOT NULL,
    "action_order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "output" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_action_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflows_workspace_id_enabled_idx" ON "workflows"("workspace_id", "enabled");
CREATE INDEX "workflows_run_as_user_id_idx" ON "workflows"("run_as_user_id");
CREATE INDEX "workflow_triggers_event_action_idx" ON "workflow_triggers"("event_action");
CREATE INDEX "workflow_triggers_workflow_id_idx" ON "workflow_triggers"("workflow_id");
CREATE UNIQUE INDEX "workflow_actions_workflow_id_action_order_key" ON "workflow_actions"("workflow_id", "action_order");
CREATE INDEX "workflow_actions_workflow_id_idx" ON "workflow_actions"("workflow_id");
CREATE UNIQUE INDEX "workflow_events_activity_log_id_key" ON "workflow_events"("activity_log_id");
CREATE INDEX "workflow_events_workspace_id_processed_at_occurred_at_id_idx" ON "workflow_events"("workspace_id", "processed_at", "occurred_at", "id");
CREATE INDEX "workflow_events_action_occurred_at_idx" ON "workflow_events"("action", "occurred_at");
CREATE INDEX "workflow_events_origin_processed_at_idx" ON "workflow_events"("origin", "processed_at");
CREATE UNIQUE INDEX "workflow_runs_workflow_id_workflow_event_id_key" ON "workflow_runs"("workflow_id", "workflow_event_id");
CREATE INDEX "workflow_runs_status_next_retry_at_created_at_idx" ON "workflow_runs"("status", "next_retry_at", "created_at");
CREATE INDEX "workflow_runs_workspace_id_created_at_idx" ON "workflow_runs"("workspace_id", "created_at");
CREATE INDEX "workflow_action_runs_workflow_run_id_action_order_idx" ON "workflow_action_runs"("workflow_run_id", "action_order");
CREATE INDEX "workflow_action_runs_status_next_retry_at_idx" ON "workflow_action_runs"("status", "next_retry_at");

ALTER TABLE "workflows"
ADD CONSTRAINT "workflows_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflows"
ADD CONSTRAINT "workflows_run_as_user_id_fkey"
FOREIGN KEY ("run_as_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflows"
ADD CONSTRAINT "workflows_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_triggers"
ADD CONSTRAINT "workflow_triggers_workflow_id_fkey"
FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_actions"
ADD CONSTRAINT "workflow_actions_workflow_id_fkey"
FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_events"
ADD CONSTRAINT "workflow_events_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_events"
ADD CONSTRAINT "workflow_events_activity_log_id_fkey"
FOREIGN KEY ("activity_log_id") REFERENCES "activity_logs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_events"
ADD CONSTRAINT "workflow_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_runs"
ADD CONSTRAINT "workflow_runs_workflow_id_fkey"
FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs"
ADD CONSTRAINT "workflow_runs_workflow_event_id_fkey"
FOREIGN KEY ("workflow_event_id") REFERENCES "workflow_events"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs"
ADD CONSTRAINT "workflow_runs_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_action_runs"
ADD CONSTRAINT "workflow_action_runs_workflow_run_id_fkey"
FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_action_runs"
ADD CONSTRAINT "workflow_action_runs_workflow_action_id_fkey"
FOREIGN KEY ("workflow_action_id") REFERENCES "workflow_actions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
