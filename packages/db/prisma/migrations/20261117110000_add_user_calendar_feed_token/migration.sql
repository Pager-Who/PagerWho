-- On-call ICS subscription secret (sha256 hash only); null keeps the feed disabled.
ALTER TABLE "users" ADD COLUMN "calendar_feed_token_hash" TEXT;

CREATE UNIQUE INDEX "users_calendar_feed_token_hash_key" ON "users"("calendar_feed_token_hash");
