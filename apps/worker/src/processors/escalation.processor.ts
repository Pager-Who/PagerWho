import { EscalationService } from "@im/backend-core";
import { prisma } from "@im/db";

export class EscalationProcessor {
  private readonly escalationService = new EscalationService(prisma);

  async tick(): Promise<number> {
    const maxStatesPerTick = Number(process.env.WORKER_ESCALATION_BATCH_SIZE ?? 10);
    let processedCount = 0;

    for (let index = 0; index < maxStatesPerTick; index += 1) {
      const state = await this.escalationService.executeNextDueState();

      if (!state) {
        return processedCount;
      }

      processedCount += 1;
    }

    return processedCount;
  }
}
