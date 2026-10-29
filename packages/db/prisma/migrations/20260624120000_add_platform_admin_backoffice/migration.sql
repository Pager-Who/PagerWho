CREATE TYPE "PlatformRole" AS ENUM ('platform_admin');

ALTER TABLE "users"
  ADD COLUMN "suspended_by_user_id" UUID,
  ADD COLUMN "suspended_at" TIMESTAMP(3),
  ADD COLUMN "suspension_reason" TEXT;

ALTER TABLE "workspaces"
  ADD COLUMN "suspended_by_user_id" UUID,
  ADD COLUMN "suspended_at" TIMESTAMP(3),
  ADD COLUMN "suspension_reason" TEXT;

CREATE TABLE "platform_admin_roles" (
  "user_id" UUID NOT NULL,
  "role" "PlatformRole" NOT NULL,
  "assigned_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_admin_roles_pkey" PRIMARY KEY ("user_id", "role")
);

ALTER TABLE "users"
  ADD CONSTRAINT "users_suspended_by_user_id_fkey"
  FOREIGN KEY ("suspended_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_suspended_by_user_id_fkey"
  FOREIGN KEY ("suspended_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_admin_roles"
  ADD CONSTRAINT "platform_admin_roles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_admin_roles"
  ADD CONSTRAINT "platform_admin_roles_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_suspended_at_idx" ON "users"("suspended_at");
CREATE INDEX "workspaces_suspended_at_idx" ON "workspaces"("suspended_at");
CREATE INDEX "platform_admin_roles_role_idx" ON "platform_admin_roles"("role");
CREATE INDEX "platform_admin_roles_assigned_by_user_id_idx" ON "platform_admin_roles"("assigned_by_user_id");
