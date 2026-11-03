import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerCopilotQuestion, getCopilotStatus } from "./copilot.service";

const mocks = vi.hoisted(() => ({ planCopilotSettings: vi.fn() }));

vi.mock("./copilot-settings", () => ({ planCopilotSettings: mocks.planCopilotSettings }));

describe("answerCopilotQuestion", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("routes authenticated questions to the Copilot planner with the request context", async () => {
    mocks.planCopilotSettings.mockResolvedValue({ answer: "Which timezone?", kind: "message", mode: "ai", sources: [] });
    const result = await answerCopilotQuestion("온콜 만들어줘", [], { actorUserId: "actor", workspaceId: "workspace", locale: "ko", docsVersion: "0123abcd" });
    expect(result.answer).toBe("Which timezone?");
    expect(mocks.planCopilotSettings).toHaveBeenCalledWith(expect.objectContaining({ question: "온콜 만들어줘", workspace_id: "workspace", locale: "ko", docs_version: "0123abcd" }), "actor");
  });

  it("requires an authenticated actor", async () => {
    await expect(answerCopilotQuestion("온콜 만들어줘")).rejects.toThrow("Authentication required");
    expect(mocks.planCopilotSettings).not.toHaveBeenCalled();
  });

  it("reports configuration status without calling the provider", async () => {
    vi.stubEnv("COPILOT_API_KEY", "test-key");
    vi.stubEnv("COPILOT_BASE_URL", "https://llm.example.test/v1");
    vi.stubEnv("COPILOT_MODEL", "example-model");
    vi.stubEnv("COPILOT_API_FORMAT", "chat-completions");
    const status = await getCopilotStatus();
    expect(status).toMatchObject({ available: true, api_format: "chat-completions", model: "example-model" });
    expect(status.checked_at).toEqual(expect.any(String));
  });

  it("reports an unconfigured server as unavailable", async () => {
    for (const name of ["COPILOT_API_KEY", "COPILOT_BASE_URL", "COPILOT_MODEL", "COPILOT_API_FORMAT", "COPILOT_EXTRA_BODY"]) vi.stubEnv(name, "");
    await expect(getCopilotStatus()).resolves.toMatchObject({ available: false, api_format: null, model: null });
  });
});
