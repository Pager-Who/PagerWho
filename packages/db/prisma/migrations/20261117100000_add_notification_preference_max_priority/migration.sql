-- Per-channel priority threshold: null keeps the existing "every priority" behaviour.
ALTER TABLE "user_notification_preferences" ADD COLUMN "max_priority" "IncidentPriority";
