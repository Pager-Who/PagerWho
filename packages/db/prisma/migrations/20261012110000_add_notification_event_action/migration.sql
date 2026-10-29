ALTER TABLE "notification_logs"
ADD COLUMN "event_action" TEXT NOT NULL DEFAULT 'incident.created';
