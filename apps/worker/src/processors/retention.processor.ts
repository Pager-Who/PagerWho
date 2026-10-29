import { QuotaService } from "@im/backend-core";
import { prisma } from "@im/db";

export class RetentionProcessor {
  private readonly quotaService = new QuotaService(prisma);
  private lastRunAt = 0;

  async tick(): Promise<number> {
    const intervalMs = Number(process.env.WORKER_RETENTION_INTERVAL_MS ?? 60 * 60 * 1000);
    const now = Date.now();

    if (now - this.lastRunAt < intervalMs) {
      return 0;
    }

    this.lastRunAt = now;
    const summary = await this.quotaService.runRetention(new Date(now));

    return summary.activity_logs
      + summary.incidents
      + summary.notification_logs
      + summary.workflow_events
      + summary.workflow_runs;
  }
}
