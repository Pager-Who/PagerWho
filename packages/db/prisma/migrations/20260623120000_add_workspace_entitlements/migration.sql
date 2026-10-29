CREATE TABLE "workspace_entitlements" (
  "workspace_id" UUID NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspace_entitlements_pkey" PRIMARY KEY ("workspace_id")
);

INSERT INTO "workspace_entitlements" ("workspace_id", "plan", "source", "updated_by_user_id", "created_at", "updated_at")
SELECT "id", 'free', 'manual', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "workspaces"
ON CONFLICT ("workspace_id") DO NOTHING;

CREATE INDEX "workspace_entitlements_plan_idx" ON "workspace_entitlements"("plan");

ALTER TABLE "workspace_entitlements"
  ADD CONSTRAINT "workspace_entitlements_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_entitlements"
  ADD CONSTRAINT "workspace_entitlements_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
