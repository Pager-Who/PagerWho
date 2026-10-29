CREATE TYPE "IncidentPriority" AS ENUM ('P1', 'P2', 'P3', 'P4', 'P5');

ALTER TABLE "incidents"
ADD COLUMN "priority" "IncidentPriority" NOT NULL DEFAULT 'P3';

UPDATE "incidents"
SET "priority" = CASE "severity"::text
  WHEN 'critical' THEN 'P1'::"IncidentPriority"
  WHEN 'high' THEN 'P2'::"IncidentPriority"
  WHEN 'medium' THEN 'P3'::"IncidentPriority"
  WHEN 'low' THEN 'P4'::"IncidentPriority"
  ELSE 'P3'::"IncidentPriority"
END;

CREATE INDEX IF NOT EXISTS "incidents_workspace_id_priority_created_at_id_idx"
ON "incidents"("workspace_id", "priority", "created_at", "id");

CREATE INDEX IF NOT EXISTS "incidents_service_id_priority_created_at_id_idx"
ON "incidents"("service_id", "priority", "created_at", "id");
