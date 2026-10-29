CREATE INDEX "services_workspace_id_name_id_idx" ON "services"("workspace_id", "name", "id");
CREATE INDEX "services_name_id_idx" ON "services"("name", "id");

CREATE INDEX "incidents_created_at_id_idx" ON "incidents"("created_at", "id");
CREATE INDEX "incidents_workspace_id_created_at_id_idx" ON "incidents"("workspace_id", "created_at", "id");
CREATE INDEX "incidents_workspace_id_status_created_at_id_idx" ON "incidents"("workspace_id", "status", "created_at", "id");
CREATE INDEX "incidents_service_id_created_at_id_idx" ON "incidents"("service_id", "created_at", "id");
CREATE INDEX "incidents_service_id_status_created_at_id_idx" ON "incidents"("service_id", "status", "created_at", "id");

CREATE INDEX "incident_timeline_entries_incident_id_created_at_id_idx" ON "incident_timeline_entries"("incident_id", "created_at", "id");
