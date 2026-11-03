CREATE TABLE "copilot_proposals" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "proposal" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "copilot_proposals_actor_user_id_expires_at_idx"
ON "copilot_proposals"("actor_user_id", "expires_at");

CREATE INDEX "copilot_proposals_expires_at_idx"
ON "copilot_proposals"("expires_at");
