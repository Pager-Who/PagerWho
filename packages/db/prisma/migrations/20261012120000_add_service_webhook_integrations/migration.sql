ALTER TABLE "services"
ADD COLUMN "webhook_integration_config" JSONB NOT NULL DEFAULT '{}';
