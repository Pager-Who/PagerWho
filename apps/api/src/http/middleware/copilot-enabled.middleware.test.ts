import { afterEach, describe, expect, it, vi } from "vitest";

import { requireCopilotEnabled } from "./copilot-enabled.middleware";

const COPILOT_ENV = ["COPILOT_API_FORMAT", "COPILOT_API_KEY", "COPILOT_BASE_URL", "COPILOT_MODEL", "COPILOT_EXTRA_BODY",
  "QWEN_API_KEY", "COPILOT_QWEN_BASE_URL", "COPILOT_QWEN_MODEL"];

function run() {
  const next = vi.fn();
  requireCopilotEnabled({} as never, {} as never, next);
  return next;
}

describe("requireCopilotEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects every Copilot request when no provider is configured", () => {
    for (const name of COPILOT_ENV) vi.stubEnv(name, "");
    expect(run()).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503, code: "copilot_not_configured" }));
  });

  it("passes through when a provider is configured", () => {
    for (const name of COPILOT_ENV) vi.stubEnv(name, "");
    vi.stubEnv("COPILOT_API_KEY", "k");
    vi.stubEnv("COPILOT_BASE_URL", "https://llm.example.test/v1");
    vi.stubEnv("COPILOT_MODEL", "m");
    expect(run()).toHaveBeenCalledWith(undefined);
  });
});
