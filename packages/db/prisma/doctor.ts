import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prisma } from "../src/client";

const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

const requiredTables = [
  "users",
  "platform_admin_roles",
  "user_password_credentials",
  "email_verification_tokens",
  "password_reset_tokens",
  "user_identities",
  "auth_sessions",
  "workspaces",
  "workspace_entitlements",
  "workspace_notification_provider_settings",
  "workspace_webhook_integrations",
  "workspace_members",
  "workspace_member_roles",
  "workspace_invites",
  "workspace_invite_roles",
  "user_notification_contacts",
  "user_notification_preferences",
  "teams",
  "team_members",
  "services",
  "webhook_endpoints",
  "incidents",
  "incident_events",
  "incident_timeline_entries",
  "on_call_schedules",
  "on_call_rotations",
  "on_call_rotation_participants",
  "on_call_overrides",
  "escalation_policies",
  "escalation_policy_steps",
  "incident_escalation_states",
  "notification_logs",
  "notification_delivery_attempts",
  "activity_logs",
  "workflows",
  "workflow_triggers",
  "workflow_actions",
  "workflow_events",
  "workflow_runs",
  "workflow_action_runs",
  "worker_run_logs",
] as const;

const legacyTables = [
  "incident_escalation_states",
  "escalation_policies",
  "escalation_policy_steps",
  "on_call_schedules",
  "workflow_events",
  "workflow_runs",
] as const;

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

async function main() {
  const localMigrations = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const migrationRows = await prisma.$queryRaw<MigrationRow[]>`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at ASC
  `;
  const appliedMigrations = migrationRows
    .filter((migration) => migration.finished_at && !migration.rolled_back_at)
    .map((migration) => migration.migration_name);
  const migrationFailures = migrationRows
    .filter((migration) => !migration.finished_at || migration.rolled_back_at)
    .map((migration) => migration.migration_name);
  const missingMigrations = localMigrations.filter((migration) => !appliedMigrations.includes(migration));
  const unknownMigrations = appliedMigrations.filter((migration) => !localMigrations.includes(migration));
  const requiredTableRows = await prisma.$queryRaw<Array<{ table_name: string; exists: boolean }>>`
    SELECT table_name, to_regclass('public.' || table_name) IS NOT NULL AS exists
    FROM unnest(${requiredTables}::text[]) AS table_name
  `;
  const legacyTableRows = await prisma.$queryRaw<Array<{ table_name: string; exists: boolean }>>`
    SELECT table_name, to_regclass('public.' || table_name) IS NOT NULL AS exists
    FROM unnest(${legacyTables}::text[]) AS table_name
  `;
  const missingRequiredTables = requiredTableRows.filter((table) => !table.exists).map((table) => table.table_name);
  const missingLegacyTables = legacyTableRows.filter((table) => !table.exists).map((table) => table.table_name);
  const legacyWorkersAvailable = !missingLegacyTables.includes("incident_escalation_states")
    && !missingLegacyTables.includes("workflow_events")
    && !missingLegacyTables.includes("workflow_runs");

  const report = {
    status: missingRequiredTables.length || migrationFailures.length || missingMigrations.length || unknownMigrations.length
      ? "error"
      : "ok",
    migrations: {
      local: localMigrations.length,
      applied: appliedMigrations.length,
      failed_or_rolled_back: migrationFailures,
      missing_from_database: missingMigrations,
      unknown_to_workspace: unknownMigrations,
    },
    schema: {
      missing_required_tables: missingRequiredTables,
      missing_legacy_tables: missingLegacyTables,
      legacy_workers_available: legacyWorkersAvailable,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.status === "error") {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Database doctor failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
