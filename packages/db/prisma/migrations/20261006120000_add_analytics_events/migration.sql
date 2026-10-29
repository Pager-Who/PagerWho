CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "session_id" TEXT NOT NULL,
    "anonymous_id" TEXT,
    "route_name" TEXT NOT NULL,
    "locale" TEXT,
    "device_class" TEXT,
    "campaign_source" TEXT,
    "campaign_medium" TEXT,
    "campaign_name" TEXT,
    "campaign_content" TEXT,
    "duration_ms" INTEGER,
    "status" TEXT,
    "properties" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_events_event_id_key" ON "analytics_events"("event_id");
CREATE INDEX "analytics_events_event_name_occurred_at_idx" ON "analytics_events"("event_name", "occurred_at");
CREATE INDEX "analytics_events_route_name_occurred_at_idx" ON "analytics_events"("route_name", "occurred_at");
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events"("created_at");
