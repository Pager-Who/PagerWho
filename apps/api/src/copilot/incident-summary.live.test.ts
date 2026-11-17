import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CopilotLocale } from "@im/contracts";

const mocks = vi.hoisted(() => ({ find: vi.fn(), member: vi.fn() }));
vi.mock("@im/db", () => ({ prisma: { incident: { findUnique: mocks.find } } }));
vi.mock("./copilot-usage", () => ({ reserveCopilotRequest: vi.fn(), assertCopilotTokenBudget: vi.fn(), recordCopilotTokens: vi.fn(), recordOutOfScope: vi.fn() }));
vi.mock("@im/backend-core", () => ({ WorkspaceService: vi.fn(() => ({ assertMember: mocks.member })) }));

import { summarizeIncident } from "./incident-summary";
import { isCopilotConfigured } from "./model-client";
import { summaryIncidentFixture, summaryIncidentId, summaryWorkspaceId } from "./incident-summary.fixtures";

// Opt in explicitly: these cases incur LLM provider API usage. No real customer data is used.
describe.skipIf(process.env.COPILOT_LIVE_TESTS !== "true").sequential("live incident summary evaluation", () => {
  beforeEach(() => { vi.clearAllMocks(); expect(isCopilotConfigured(), "Configure COPILOT_* in apps/api/.env").toBe(true); });
  for (const locale of ["en", "ko", "zh-CN"] satisfies CopilotLocale[]) {
    for (const scenario of ["acknowledged", "resolved", "missing-description"] as const) {
      it(`${locale}: ${scenario}`, async () => {
        const fixture = summaryIncidentFixture();
        if (scenario === "resolved") { fixture.status = "resolved"; fixture.resolvedAt = new Date("2030-01-07T00:10:00Z"); fixture.updatedAt = fixture.resolvedAt; }
        const incident = scenario === "missing-description" ? { ...fixture, description: null } : fixture;
        mocks.find.mockImplementation(async (query) => query.select.workspaceId ? { workspaceId: summaryWorkspaceId } : incident);
        const result = await summarizeIncident(summaryIncidentId, randomUUID(), locale);
        expect(result.evidence.status).toBe(fixture.status);
        expect(result.evidence.service).toBe("checkout");
        expect(result.evidence.description).toBe(incident.description);
        expect(result.checklist).toHaveLength(3);
        const text = [result.summary, ...result.checklist].join(" ");
        expect(text).toMatch(locale === "ko" ? /[가-힣]/ : locale === "zh-CN" ? /[\u4e00-\u9fff]/ : /[a-zA-Z]/);
        // This is a quality evaluation, not proof that all generated claims are grounded.
        expect(text).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:%|ms|GiB|MiB|rps)\b/i);
        expect(result).not.toHaveProperty("actions");
      }, 35_000);
    }
  }
});
