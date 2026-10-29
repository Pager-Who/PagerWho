ALTER TABLE "workflows"
ADD COLUMN "graph_metadata" JSONB;

ALTER TABLE "workflow_triggers"
ADD COLUMN "trigger_key" TEXT,
ADD COLUMN "entry_action_key" TEXT;

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (PARTITION BY "workflow_id" ORDER BY "created_at", "id") AS trigger_index
  FROM "workflow_triggers"
)
UPDATE "workflow_triggers" trigger
SET "trigger_key" = 'trigger_' || ranked.trigger_index::text
FROM ranked
WHERE ranked."id" = trigger."id";

UPDATE "workflow_triggers" trigger
SET "entry_action_key" = first_action."action_key"
FROM (
  SELECT DISTINCT ON ("workflow_id")
    "workflow_id",
    "action_key"
  FROM "workflow_actions"
  ORDER BY "workflow_id", "action_order"
) first_action
WHERE first_action."workflow_id" = trigger."workflow_id";

ALTER TABLE "workflow_triggers"
ALTER COLUMN "trigger_key" SET NOT NULL;

CREATE UNIQUE INDEX "workflow_triggers_workflow_id_trigger_key_key"
ON "workflow_triggers"("workflow_id", "trigger_key");

ALTER TABLE "workflow_runs"
ADD COLUMN "matched_trigger_id" UUID,
ADD COLUMN "entry_action_key" TEXT;

UPDATE "workflow_runs" run
SET
  "matched_trigger_id" = first_trigger."id",
  "entry_action_key" = COALESCE(first_trigger."entry_action_key", first_action."action_key")
FROM (
  SELECT DISTINCT ON ("workflow_id")
    "id",
    "workflow_id",
    "entry_action_key"
  FROM "workflow_triggers"
  ORDER BY "workflow_id", "created_at", "id"
) first_trigger
LEFT JOIN (
  SELECT DISTINCT ON ("workflow_id")
    "workflow_id",
    "action_key"
  FROM "workflow_actions"
  ORDER BY "workflow_id", "action_order"
) first_action ON first_action."workflow_id" = first_trigger."workflow_id"
WHERE first_trigger."workflow_id" = run."workflow_id";

DROP INDEX "workflow_runs_workflow_id_workflow_event_id_key";

CREATE UNIQUE INDEX "workflow_runs_workflow_id_workflow_event_id_matched_trigger_id_key"
ON "workflow_runs"("workflow_id", "workflow_event_id", "matched_trigger_id");

CREATE INDEX "workflow_runs_matched_trigger_id_idx"
ON "workflow_runs"("matched_trigger_id");

ALTER TABLE "workflow_runs"
ADD CONSTRAINT "workflow_runs_matched_trigger_id_fkey"
FOREIGN KEY ("matched_trigger_id") REFERENCES "workflow_triggers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
