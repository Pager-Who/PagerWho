CREATE TABLE "workspace_webhook_integrations" (
    "workspace_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_webhook_integrations_pkey" PRIMARY KEY ("workspace_id", "type")
);

CREATE INDEX "workspace_webhook_integrations_type_enabled_idx"
ON "workspace_webhook_integrations"("type", "enabled");

ALTER TABLE "workspace_webhook_integrations"
ADD CONSTRAINT "workspace_webhook_integrations_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
