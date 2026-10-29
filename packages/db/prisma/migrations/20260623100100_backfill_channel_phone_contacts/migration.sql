INSERT INTO "user_notification_contacts" (
  "id",
  "user_id",
  "type",
  "address",
  "verified_at",
  "verification_provider",
  "verification_external_id",
  "verification_sent_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  "user_id",
  'phone_sms'::"NotificationContactType",
  "address",
  "verified_at",
  "verification_provider",
  "verification_external_id",
  "verification_sent_at",
  "created_at",
  "updated_at"
FROM "user_notification_contacts"
WHERE "type" = 'phone_number'
ON CONFLICT ("user_id", "type") DO NOTHING;

INSERT INTO "user_notification_contacts" (
  "id",
  "user_id",
  "type",
  "address",
  "verified_at",
  "verification_provider",
  "verification_external_id",
  "verification_sent_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  "user_id",
  'phone_voice'::"NotificationContactType",
  "address",
  "verified_at",
  "verification_provider",
  "verification_external_id",
  "verification_sent_at",
  "created_at",
  "updated_at"
FROM "user_notification_contacts"
WHERE "type" = 'phone_number'
ON CONFLICT ("user_id", "type") DO NOTHING;
