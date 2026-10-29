ALTER TABLE "workflow_actions"
ADD COLUMN "action_key" TEXT;

UPDATE "workflow_actions"
SET "action_key" = 'action_' || "action_order"::text
WHERE "action_key" IS NULL;

ALTER TABLE "workflow_actions"
ALTER COLUMN "action_key" SET NOT NULL;

ALTER TABLE "workflow_actions"
ADD COLUMN "next_action_key" TEXT,
ADD COLUMN "failure_action_key" TEXT;

UPDATE "workflow_actions" current_action
SET "next_action_key" = next_action."action_key"
FROM "workflow_actions" next_action
WHERE next_action."workflow_id" = current_action."workflow_id"
  AND next_action."action_order" = current_action."action_order" + 1;

CREATE UNIQUE INDEX "workflow_actions_workflow_id_action_key_key" ON "workflow_actions"("workflow_id", "action_key");
