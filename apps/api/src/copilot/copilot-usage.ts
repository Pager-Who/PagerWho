import { prisma } from "@im/db";

import { HttpError } from "../http/errors/http-error";

// Counters live in PostgreSQL so every API replica enforces the same limits.
function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function utcDay(now: Date) {
  const day = now.toISOString().slice(0, 10);
  return { day, expiresAt: new Date(Date.parse(`${day}T00:00:00.000Z`) + 2 * 86_400_000) };
}

async function bump(bucket: string, expiresAt: Date, requests: number, tokens: number) {
  const rows = await prisma.$queryRaw<Array<{ request_count: number; token_count: number }>>`
    INSERT INTO "copilot_usage_counters" ("bucket", "request_count", "token_count", "expires_at")
    VALUES (${bucket}, ${requests}, ${tokens}, ${expiresAt})
    ON CONFLICT ("bucket") DO UPDATE SET
      "request_count" = "copilot_usage_counters"."request_count" + EXCLUDED."request_count",
      "token_count" = "copilot_usage_counters"."token_count" + EXCLUDED."token_count"
    RETURNING "request_count", "token_count"`;
  return rows[0] ?? { request_count: 0, token_count: 0 };
}

const budgetExceeded = () => new HttpError(429, "copilot_budget_exceeded", "Copilot daily usage limit reached. Please try again tomorrow.");

/** Counts one Copilot conversation turn before any paid provider call. */
export async function reserveCopilotRequest(workspaceId: string, actorUserId: string) {
  const now = new Date();
  // ponytail: probabilistic cleanup of expired rows; move to the worker if the table grows noticeably.
  if (Math.random() < 0.01) await prisma.copilotUsageCounter.deleteMany({ where: { expiresAt: { lt: now } } });
  const minute = Math.floor(now.getTime() / 60_000);
  const user = await bump(`user:${actorUserId}:${minute}`, new Date((minute + 2) * 60_000), 1, 0);
  if (user.request_count > limit("COPILOT_USER_REQUESTS_PER_MINUTE", 6)) {
    throw new HttpError(429, "copilot_rate_limit", "Copilot request limit reached. Please try again shortly.");
  }
  const { day, expiresAt } = utcDay(now);
  const workspace = await bump(`workspace:${workspaceId}:${day}`, expiresAt, 1, 0);
  if (workspace.request_count > limit("COPILOT_WORKSPACE_DAILY_REQUESTS", 200)) throw budgetExceeded();
}

/** Checked before every provider call, because one turn can make several calls. */
export async function assertCopilotTokenBudget(workspaceId: string) {
  const { day } = utcDay(new Date());
  const rows = await prisma.copilotUsageCounter.findMany({
    where: { bucket: { in: [`workspace:${workspaceId}:${day}`, `global:${day}`] } },
    select: { bucket: true, tokenCount: true },
  });
  for (const row of rows) {
    const max = row.bucket.startsWith("global:")
      ? limit("COPILOT_GLOBAL_DAILY_TOKENS", 5_000_000) : limit("COPILOT_WORKSPACE_DAILY_TOKENS", 500_000);
    // ponytail: soft cap; concurrent calls can overshoot by about one response each.
    if (row.tokenCount >= max) throw budgetExceeded();
  }
}

/** Content-free daily count of questions the topic filter rejected, for tuning false rejections. */
export async function recordOutOfScope() {
  const { day, expiresAt } = utcDay(new Date());
  await bump(`out_of_scope:${day}`, expiresAt, 1, 0);
}

export async function recordCopilotTokens(workspaceId: string, tokens: number) {
  const { day, expiresAt } = utcDay(new Date());
  await bump(`workspace:${workspaceId}:${day}`, expiresAt, 0, tokens);
  await bump(`global:${day}`, expiresAt, 0, tokens);
}
