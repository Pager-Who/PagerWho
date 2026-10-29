ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_team_id_fkey";

ALTER TABLE "services" ALTER COLUMN "team_id" DROP NOT NULL;

ALTER TABLE "services"
ADD CONSTRAINT "services_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "teams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "EscalationTargetType" ADD VALUE IF NOT EXISTS 'team';
