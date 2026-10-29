import "dotenv/config";

import { WorkerObservabilityService } from "@im/backend-core";
import { prisma } from "@im/db";

import { workerLogger } from "./logger";
import { detectWorkerDatabaseCapabilities, type WorkerDatabaseCapabilities } from "./database-capabilities";
import { EscalationProcessor } from "./processors/escalation.processor";
import { NotificationRetryProcessor } from "./processors/notification-retry.processor";
import { RetentionProcessor } from "./processors/retention.processor";
import { WorkflowProcessor } from "./processors/workflow.processor";

const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const escalationProcessor = new EscalationProcessor();
const notificationRetryProcessor = new NotificationRetryProcessor();
const retentionProcessor = new RetentionProcessor();
const workflowProcessor = new WorkflowProcessor();
const workerObservabilityService = new WorkerObservabilityService(prisma);
let isTickRunning = false;
let databaseCapabilities: WorkerDatabaseCapabilities | null = null;

async function getDatabaseCapabilities() {
  if (databaseCapabilities) {
    return databaseCapabilities;
  }

  databaseCapabilities = await detectWorkerDatabaseCapabilities(prisma);
  workerLogger.info("Worker database capabilities detected", databaseCapabilities);
  if (!databaseCapabilities.escalation || !databaseCapabilities.workflow) {
    workerLogger.warn("Legacy workers disabled because their database tables are unavailable", {
      escalation_enabled: databaseCapabilities.escalation,
      workflow_enabled: databaseCapabilities.workflow,
    });
  }

  return databaseCapabilities;
}

async function tick() {
  if (isTickRunning) {
    workerLogger.warn("Previous worker tick is still running; skipping overlapping tick", {
      poll_interval_ms: pollIntervalMs,
    });
    return;
  }

  isTickRunning = true;

  try {
    const capabilities = await getDatabaseCapabilities();
    await Promise.all([
      capabilities.escalation
        ? runObservedProcessor("escalation", () => escalationProcessor.tick(), {
          batch_size: Number(process.env.WORKER_ESCALATION_BATCH_SIZE ?? 10),
          poll_interval_ms: pollIntervalMs,
        })
        : Promise.resolve(),
      runObservedProcessor("notification_retry", () => notificationRetryProcessor.tick(), {
        batch_size: Number(process.env.WORKER_NOTIFICATION_BATCH_SIZE ?? 25),
        lease_seconds: Number(process.env.WORKER_NOTIFICATION_LEASE_SECONDS ?? 120),
        poll_interval_ms: pollIntervalMs,
      }),
      capabilities.workflow
        ? runObservedProcessor("workflow", () => workflowProcessor.tick(), {
          event_batch_size: Number(process.env.WORKER_WORKFLOW_EVENT_BATCH_SIZE ?? 25),
          run_batch_size: Number(process.env.WORKER_WORKFLOW_RUN_BATCH_SIZE ?? 25),
          poll_interval_ms: pollIntervalMs,
        })
        : Promise.resolve(),
      capabilities.workflow
        ? runObservedProcessor("retention", () => retentionProcessor.tick(), {
          interval_ms: Number(process.env.WORKER_RETENTION_INTERVAL_MS ?? 60 * 60 * 1000),
          poll_interval_ms: pollIntervalMs,
        })
        : Promise.resolve(),
    ]);
  } finally {
    isTickRunning = false;
  }
}

async function runObservedProcessor(
  workerName: string,
  run: () => Promise<number>,
  metadata: Record<string, number>,
) {
  const runLog = await workerObservabilityService.startRun({
    workerName,
    metadata,
  });

  try {
    const processedCount = await run();
    await workerObservabilityService.completeRun(runLog.id, {
      processedCount,
      metadata,
    });
  } catch (error) {
    await workerObservabilityService.failRun(runLog.id, {
      error,
      metadata,
    });
    workerLogger.error("Worker processor tick failed", {
      error,
      worker_name: workerName,
    });
  }
}

setInterval(() => {
  tick().catch((error) => {
    workerLogger.error("Worker tick failed", { error });
  });
}, pollIntervalMs);

tick().catch((error) => {
  workerLogger.error("Initial worker tick failed", { error });
});

workerLogger.info("Worker polling started", {
  poll_interval_ms: pollIntervalMs,
});
