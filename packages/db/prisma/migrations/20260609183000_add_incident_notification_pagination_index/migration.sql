CREATE INDEX IF NOT EXISTS "notification_logs_incident_id_created_at_id_idx"
ON "notification_logs"("incident_id", "created_at", "id");
