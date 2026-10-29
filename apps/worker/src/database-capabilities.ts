import type { PrismaClient } from "@im/db";

export type WorkerDatabaseCapabilities = {
  escalation: boolean;
  workflow: boolean;
};

export async function detectWorkerDatabaseCapabilities(
  db: PrismaClient,
): Promise<WorkerDatabaseCapabilities> {
  const rows = await db.$queryRaw<Array<{
    escalation_table: string | null;
    workflow_events_table: string | null;
    workflow_runs_table: string | null;
  }>>`
    SELECT
      to_regclass('public.incident_escalation_states')::text AS escalation_table,
      to_regclass('public.workflow_events')::text AS workflow_events_table,
      to_regclass('public.workflow_runs')::text AS workflow_runs_table
  `;
  const row = rows[0];

  return {
    escalation: Boolean(row?.escalation_table),
    workflow: Boolean(row?.workflow_events_table && row.workflow_runs_table),
  };
}
