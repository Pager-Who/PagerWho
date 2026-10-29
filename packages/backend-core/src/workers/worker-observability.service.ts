import type {
  PaginatedResponse,
  StuckEscalation,
  StuckEscalationQuery,
  WorkerHealth,
  WorkerReadiness,
  WorkerRunLog,
  WorkerRunLogQuery,
} from "@im/contracts";
import type { Prisma, PrismaClient } from "@im/db";

const DEFAULT_REQUIRED_WORKERS = ["escalation", "notification_retry", "retention"];
const DEFAULT_MAX_RUN_AGE_SECONDS = 120;

type WorkerRunLogRecord = {
  id: string;
  workerName: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  processedCount: number;
  errorMessage: string | null;
  metadata: unknown;
};

type StuckEscalationRecord = {
  incidentId: string;
  policyId: string;
  currentStep: number;
  repeatIteration: number;
  nextRunAt: Date | null;
  status: string;
  updatedAt: Date;
  incident: {
    workspaceId: string;
    serviceId: string;
    status: string;
  };
};

export class WorkerObservabilityService {
  constructor(private readonly db: PrismaClient) {}

  async startRun(input: {
    workerName: string;
    metadata?: Prisma.InputJsonObject;
  }): Promise<WorkerRunLog> {
    const run = await this.db.workerRunLog.create({
      data: {
        workerName: input.workerName,
        metadata: input.metadata ?? {},
      },
    });

    return this.mapWorkerRunLog(run);
  }

  async completeRun(
    runId: string,
    input: {
      processedCount: number;
      metadata?: Prisma.InputJsonObject;
    },
  ): Promise<WorkerRunLog> {
    const completedAt = new Date();
    const existing = await this.db.workerRunLog.findUniqueOrThrow({
      where: {
        id: runId,
      },
      select: {
        startedAt: true,
      },
    });

    const run = await this.db.workerRunLog.update({
      where: {
        id: runId,
      },
      data: {
        status: "succeeded",
        completedAt,
        durationMs: completedAt.getTime() - existing.startedAt.getTime(),
        processedCount: Math.max(0, input.processedCount),
        errorMessage: null,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });

    return this.mapWorkerRunLog(run);
  }

  async failRun(
    runId: string,
    input: {
      error: unknown;
      processedCount?: number;
      metadata?: Prisma.InputJsonObject;
    },
  ): Promise<WorkerRunLog> {
    const completedAt = new Date();
    const existing = await this.db.workerRunLog.findUniqueOrThrow({
      where: {
        id: runId,
      },
      select: {
        startedAt: true,
      },
    });

    const run = await this.db.workerRunLog.update({
      where: {
        id: runId,
      },
      data: {
        status: "failed",
        completedAt,
        durationMs: completedAt.getTime() - existing.startedAt.getTime(),
        processedCount: Math.max(0, input.processedCount ?? 0),
        errorMessage: errorMessage(input.error),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });

    return this.mapWorkerRunLog(run);
  }

  async listRunLogs(query: WorkerRunLogQuery): Promise<PaginatedResponse<WorkerRunLog>> {
    const rows = await this.db.workerRunLog.findMany({
      where: {
        ...(query.worker_name ? { workerName: query.worker_name } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      ...(query.cursor
        ? {
            cursor: {
              id: query.cursor,
            },
            skip: 1,
          }
        : {}),
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map((run) => this.mapWorkerRunLog(run));

    return {
      items,
      next_cursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async getHealth(requiredWorkers = DEFAULT_REQUIRED_WORKERS): Promise<WorkerHealth> {
    const checkedAt = new Date();
    const latestRuns = await this.listLatestRuns(requiredWorkers);
    const latestByName = new Map(latestRuns.map((run) => [run.worker_name, run]));
    const missingWorkers = requiredWorkers.filter((workerName) => !latestByName.has(workerName));
    const hasFailedWorker = latestRuns.some((run) => run.status === "failed");
    const status = latestRuns.length === 0
      ? "unhealthy"
      : missingWorkers.length > 0 || hasFailedWorker
        ? "degraded"
        : "ok";

    return {
      status,
      checked_at: checkedAt.toISOString(),
      latest_runs: latestRuns,
    };
  }

  async getReadiness(input: {
    requiredWorkers?: string[];
    maxRunAgeSeconds?: number;
  } = {}): Promise<WorkerReadiness> {
    const checkedAt = new Date();
    const requiredWorkers = input.requiredWorkers ?? DEFAULT_REQUIRED_WORKERS;
    const maxRunAgeSeconds = input.maxRunAgeSeconds ?? DEFAULT_MAX_RUN_AGE_SECONDS;
    const cutoffMs = checkedAt.getTime() - maxRunAgeSeconds * 1000;
    const latestRuns = await this.listLatestRuns(requiredWorkers);
    const latestByName = new Map(latestRuns.map((run) => [run.worker_name, run]));
    const staleWorkers = requiredWorkers.filter((workerName) => {
      const run = latestByName.get(workerName);

      if (!run || run.status !== "succeeded") {
        return true;
      }

      const finishedAt = run.completed_at ?? run.started_at;
      return new Date(finishedAt).getTime() < cutoffMs;
    });

    return {
      ready: staleWorkers.length === 0,
      checked_at: checkedAt.toISOString(),
      max_run_age_seconds: maxRunAgeSeconds,
      stale_workers: staleWorkers,
      latest_runs: latestRuns,
    };
  }

  async listStuckEscalations(
    query: StuckEscalationQuery,
    options: { workspaceIds?: string[] } = {},
  ): Promise<PaginatedResponse<StuckEscalation>> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - query.older_than_seconds * 1000);
    const rows = await this.db.incidentEscalationState.findMany({
      where: {
        status: "active",
        nextRunAt: {
          lte: cutoff,
        },
        incident: {
          status: "triggered",
          ...(query.workspace_id
            ? { workspaceId: query.workspace_id }
            : options.workspaceIds
              ? { workspaceId: { in: options.workspaceIds } }
              : {}),
        },
      },
      include: {
        incident: {
          select: {
            workspaceId: true,
            serviceId: true,
            status: true,
          },
        },
      },
      orderBy: [{ nextRunAt: "asc" }, { incidentId: "asc" }],
      ...(query.cursor
        ? {
            cursor: {
              incidentId: query.cursor,
            },
            skip: 1,
          }
        : {}),
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map((row) => this.mapStuckEscalation(row, now));

    return {
      items,
      next_cursor: rows.length > query.limit ? (items.at(-1)?.incident_id ?? null) : null,
    };
  }

  private async listLatestRuns(workerNames: string[]): Promise<WorkerRunLog[]> {
    const rows = await this.db.workerRunLog.findMany({
      where: {
        workerName: {
          in: workerNames,
        },
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: Math.max(workerNames.length * 10, 10),
    });
    const latestRuns: WorkerRunLog[] = [];
    const seenWorkerNames = new Set<string>();

    for (const row of rows) {
      if (seenWorkerNames.has(row.workerName)) {
        continue;
      }

      seenWorkerNames.add(row.workerName);
      latestRuns.push(this.mapWorkerRunLog(row));
    }

    return latestRuns;
  }

  private mapWorkerRunLog(run: WorkerRunLogRecord): WorkerRunLog {
    return {
      id: run.id,
      worker_name: run.workerName,
      status: run.status as WorkerRunLog["status"],
      started_at: run.startedAt.toISOString(),
      completed_at: run.completedAt?.toISOString() ?? null,
      duration_ms: run.durationMs,
      processed_count: run.processedCount,
      error_message: run.errorMessage,
      metadata: run.metadata,
    };
  }

  private mapStuckEscalation(row: StuckEscalationRecord, now: Date): StuckEscalation {
    const overdueSeconds = row.nextRunAt
      ? Math.max(0, Math.floor((now.getTime() - row.nextRunAt.getTime()) / 1000))
      : 0;

    return {
      incident_id: row.incidentId,
      workspace_id: row.incident.workspaceId,
      service_id: row.incident.serviceId,
      policy_id: row.policyId,
      current_step: row.currentStep,
      repeat_iteration: row.repeatIteration,
      next_run_at: row.nextRunAt?.toISOString() ?? null,
      status: row.status as StuckEscalation["status"],
      incident_status: row.incident.status as StuckEscalation["incident_status"],
      overdue_seconds: overdueSeconds,
      updated_at: row.updatedAt.toISOString(),
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown worker error";
}
