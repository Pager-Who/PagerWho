CREATE TYPE "NotificationContactType" AS ENUM ('slack_webhook', 'email_webhook', 'phone_number');

CREATE TABLE "user_notification_contacts" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "NotificationContactType" NOT NULL,
  "address" TEXT NOT NULL,
  "verified_at" TIMESTAMP(3),
  "verification_provider" TEXT,
  "verification_external_id" TEXT,
  "verification_sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_notification_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_notification_preferences" (
  "user_id" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "delay_seconds" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id", "channel")
);

CREATE UNIQUE INDEX "user_notification_contacts_user_id_type_key"
  ON "user_notification_contacts"("user_id", "type");

ALTER TABLE "user_notification_contacts"
  ADD CONSTRAINT "user_notification_contacts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_notification_preferences"
  ADD CONSTRAINT "user_notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "user_notification_contacts" ("id", "user_id", "type", "address", "created_at", "updated_at")
SELECT md5("id"::TEXT || ':slack_webhook')::UUID, "id", 'slack_webhook'::"NotificationContactType", "slack_webhook_url", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
WHERE "slack_webhook_url" IS NOT NULL;

INSERT INTO "user_notification_contacts" ("id", "user_id", "type", "address", "created_at", "updated_at")
SELECT md5("id"::TEXT || ':email_webhook')::UUID, "id", 'email_webhook'::"NotificationContactType", "email_delivery_webhook_url", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
WHERE "email_delivery_webhook_url" IS NOT NULL;

INSERT INTO "user_notification_preferences" ("user_id", "channel", "enabled", "delay_seconds", "created_at", "updated_at")
SELECT "id", 'slack'::"NotificationChannel", true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

INSERT INTO "user_notification_preferences" ("user_id", "channel", "enabled", "delay_seconds", "created_at", "updated_at")
SELECT "id", 'email'::"NotificationChannel", true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

INSERT INTO "user_notification_preferences" ("user_id", "channel", "enabled", "delay_seconds", "created_at", "updated_at")
SELECT "id", 'sms'::"NotificationChannel", false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

INSERT INTO "user_notification_preferences" ("user_id", "channel", "enabled", "delay_seconds", "created_at", "updated_at")
SELECT "id", 'phone'::"NotificationChannel", false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

ALTER TABLE "users"
  DROP COLUMN "slack_webhook_url",
  DROP COLUMN "email_delivery_webhook_url";
