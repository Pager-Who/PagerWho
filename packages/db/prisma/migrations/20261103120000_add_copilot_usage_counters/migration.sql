CREATE TABLE "copilot_usage_counters" (
    "bucket" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_usage_counters_pkey" PRIMARY KEY ("bucket")
);

CREATE INDEX "copilot_usage_counters_expires_at_idx"
ON "copilot_usage_counters"("expires_at");
