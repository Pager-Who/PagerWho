CREATE TABLE "workspace_notification_provider_settings" (
  "workspace_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_notification_provider_settings_pkey" PRIMARY KEY ("workspace_id", "provider")
);

CREATE INDEX "workspace_notification_provider_settings_provider_enabled_idx"
  ON "workspace_notification_provider_settings"("provider", "enabled");

ALTER TABLE "workspace_notification_provider_settings"
  ADD CONSTRAINT "workspace_notification_provider_settings_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
