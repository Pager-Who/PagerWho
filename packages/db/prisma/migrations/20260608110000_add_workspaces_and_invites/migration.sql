-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'responder', 'viewer');

-- CreateEnum
CREATE TYPE "WorkspaceInviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'revoked', 'expired');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "workspace_invites" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "invited_user_id" UUID NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "status" "WorkspaceInviteStatus" NOT NULL DEFAULT 'pending',
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

-- Seed a default workspace for existing development data.
INSERT INTO "workspaces" ("id", "name", "slug", "created_by_user_id", "created_at", "updated_at")
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'Default Workspace',
    'default',
    (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "workspace_members" ("workspace_id", "user_id", "role", "created_at", "updated_at")
SELECT
    '00000000-0000-4000-8000-000000000001',
    "id",
    'owner'::"WorkspaceRole",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("workspace_id", "user_id") DO NOTHING;

-- Add workspace scope to tenant-owned resources.
ALTER TABLE "teams" ADD COLUMN "workspace_id" UUID;
ALTER TABLE "services" ADD COLUMN "workspace_id" UUID;
ALTER TABLE "escalation_policies" ADD COLUMN "workspace_id" UUID;
ALTER TABLE "on_call_schedules" ADD COLUMN "workspace_id" UUID;
ALTER TABLE "incidents" ADD COLUMN "workspace_id" UUID;
ALTER TABLE "activity_logs" ADD COLUMN "workspace_id" UUID;

UPDATE "teams"
SET "workspace_id" = '00000000-0000-4000-8000-000000000001'
WHERE "workspace_id" IS NULL;

UPDATE "escalation_policies"
SET "workspace_id" = '00000000-0000-4000-8000-000000000001'
WHERE "workspace_id" IS NULL;

UPDATE "services"
SET "workspace_id" = COALESCE(
    (
        SELECT "teams"."workspace_id"
        FROM "teams"
        WHERE "teams"."id" = "services"."team_id"
    ),
    '00000000-0000-4000-8000-000000000001'
)
WHERE "workspace_id" IS NULL;

UPDATE "on_call_schedules"
SET "workspace_id" = COALESCE(
    (
        SELECT "services"."workspace_id"
        FROM "services"
        WHERE "services"."id" = "on_call_schedules"."service_id"
    ),
    (
        SELECT "teams"."workspace_id"
        FROM "teams"
        WHERE "teams"."id" = "on_call_schedules"."team_id"
    ),
    '00000000-0000-4000-8000-000000000001'
)
WHERE "workspace_id" IS NULL;

UPDATE "incidents"
SET "workspace_id" = COALESCE(
    (
        SELECT "services"."workspace_id"
        FROM "services"
        WHERE "services"."id" = "incidents"."service_id"
    ),
    '00000000-0000-4000-8000-000000000001'
)
WHERE "workspace_id" IS NULL;

UPDATE "activity_logs"
SET "workspace_id" = '00000000-0000-4000-8000-000000000001'
WHERE "workspace_id" IS NULL;

ALTER TABLE "teams" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "services" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "escalation_policies" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "on_call_schedules" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "incidents" ALTER COLUMN "workspace_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");
CREATE INDEX "workspace_members_user_id_role_idx" ON "workspace_members"("user_id", "role");
CREATE INDEX "workspace_invites_workspace_id_status_created_at_idx" ON "workspace_invites"("workspace_id", "status", "created_at");
CREATE INDEX "workspace_invites_invited_user_id_status_created_at_idx" ON "workspace_invites"("invited_user_id", "status", "created_at");
CREATE UNIQUE INDEX "teams_workspace_id_name_key" ON "teams"("workspace_id", "name");
CREATE INDEX "teams_workspace_id_idx" ON "teams"("workspace_id");
CREATE INDEX "services_workspace_id_idx" ON "services"("workspace_id");
CREATE INDEX "incidents_workspace_id_status_created_at_idx" ON "incidents"("workspace_id", "status", "created_at");
CREATE INDEX "on_call_schedules_workspace_id_idx" ON "on_call_schedules"("workspace_id");
CREATE INDEX "escalation_policies_workspace_id_idx" ON "escalation_policies"("workspace_id");
CREATE INDEX "activity_logs_workspace_id_created_at_idx" ON "activity_logs"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escalation_policies" ADD CONSTRAINT "escalation_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "on_call_schedules" ADD CONSTRAINT "on_call_schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
