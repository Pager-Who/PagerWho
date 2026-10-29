CREATE TABLE "workspace_member_roles" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_key" TEXT NOT NULL,
    "assigned_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_member_roles_pkey" PRIMARY KEY ("workspace_id", "user_id", "role_key")
);

CREATE TABLE "workspace_invite_roles" (
    "invite_id" UUID NOT NULL,
    "role_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invite_roles_pkey" PRIMARY KEY ("invite_id", "role_key")
);

INSERT INTO "workspace_member_roles" ("workspace_id", "user_id", "role_key", "created_at")
SELECT "workspace_id", "user_id", "role_key", "created_at"
FROM (
    SELECT "workspace_id", "user_id", "created_at", 'project_owner' AS "role_key"
    FROM "workspace_members"
    WHERE "role" = 'owner'
    UNION ALL
    SELECT "workspace_id", "user_id", "created_at", 'project_admin' AS "role_key"
    FROM "workspace_members"
    WHERE "role" = 'admin'
    UNION ALL
    SELECT "workspace_id", "user_id", "created_at", 'incident_responder' AS "role_key"
    FROM "workspace_members"
    WHERE "role" = 'responder'
    UNION ALL
    SELECT "workspace_id", "user_id", "created_at", 'notification_recipient' AS "role_key"
    FROM "workspace_members"
    WHERE "role" = 'responder'
    UNION ALL
    SELECT "workspace_id", "user_id", "created_at", 'project_viewer' AS "role_key"
    FROM "workspace_members"
    WHERE "role" = 'viewer'
) AS mapped_roles
ON CONFLICT DO NOTHING;

INSERT INTO "workspace_invite_roles" ("invite_id", "role_key", "created_at")
SELECT "invite_id", "role_key", "created_at"
FROM (
    SELECT "id" AS "invite_id", "created_at", 'project_owner' AS "role_key"
    FROM "workspace_invites"
    WHERE "role" = 'owner'
    UNION ALL
    SELECT "id" AS "invite_id", "created_at", 'project_admin' AS "role_key"
    FROM "workspace_invites"
    WHERE "role" = 'admin'
    UNION ALL
    SELECT "id" AS "invite_id", "created_at", 'incident_responder' AS "role_key"
    FROM "workspace_invites"
    WHERE "role" = 'responder'
    UNION ALL
    SELECT "id" AS "invite_id", "created_at", 'notification_recipient' AS "role_key"
    FROM "workspace_invites"
    WHERE "role" = 'responder'
    UNION ALL
    SELECT "id" AS "invite_id", "created_at", 'project_viewer' AS "role_key"
    FROM "workspace_invites"
    WHERE "role" = 'viewer'
) AS mapped_roles
ON CONFLICT DO NOTHING;

CREATE INDEX "workspace_member_roles_workspace_id_role_key_idx" ON "workspace_member_roles"("workspace_id", "role_key");
CREATE INDEX "workspace_member_roles_user_id_role_key_idx" ON "workspace_member_roles"("user_id", "role_key");
CREATE INDEX "workspace_invite_roles_role_key_idx" ON "workspace_invite_roles"("role_key");

ALTER TABLE "workspace_member_roles"
ADD CONSTRAINT "workspace_member_roles_workspace_id_user_id_fkey"
FOREIGN KEY ("workspace_id", "user_id") REFERENCES "workspace_members"("workspace_id", "user_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_member_roles"
ADD CONSTRAINT "workspace_member_roles_assigned_by_user_id_fkey"
FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspace_invite_roles"
ADD CONSTRAINT "workspace_invite_roles_invite_id_fkey"
FOREIGN KEY ("invite_id") REFERENCES "workspace_invites"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
