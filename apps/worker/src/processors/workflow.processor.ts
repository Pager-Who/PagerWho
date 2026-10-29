import { WorkflowService } from "@im/backend-core";
import { prisma } from "@im/db";

export class WorkflowProcessor {
  private readonly workflowService = new WorkflowService(prisma);
  private readonly workerId = `workflow-${process.pid}`;

  async tick(): Promise<number> {
    const maxEventsPerTick = Number(process.env.WORKER_WORKFLOW_EVENT_BATCH_SIZE ?? 25);
    const maxRunsPerTick = Number(process.env.WORKER_WORKFLOW_RUN_BATCH_SIZE ?? 25);
    let processedCount = 0;

    for (let index = 0; index < maxEventsPerTick; index += 1) {
      const result = await this.workflowService.processNextEvent(this.workerId);

      if (result.processed === 0) {
        break;
      }

      processedCount += result.processed;
    }

    for (let index = 0; index < maxRunsPerTick; index += 1) {
      const result = await this.workflowService.executeNextDueRun();

      if (result.processed === 0) {
        break;
      }

      processedCount += result.processed;
    }

    return processedCount;
  }
}
