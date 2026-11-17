import { createIncidentActionToken } from "@im/backend-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acknowledgeIncident: vi.fn(),
  assertWorkspacePermission: vi.fn(),
  findIncident: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock("@im/db", () => ({
  prisma: {
    incident: { findUnique: mocks.findIncident },
    user: { findUnique: mocks.findUser },
  },
}));
vi.mock("@im/backend-core", async (original) => ({
  ...await original<typeof import("@im/backend-core")>(),
  IncidentService: vi.fn(() => ({ acknowledgeIncident: mocks.acknowledgeIncident })),
  WorkspaceService: vi.fn(() => ({ assertWorkspacePermission: mocks.assertWorkspacePermission })),
}));

import { WorkspaceError } from "@im/backend-core";

import {
  acknowledgeIncidentActionLinkHandler,
  getIncidentActionLinkHandler,
  voiceIncidentActionLinkHandler,
} from "./incident-actions.handler";

const incidentId = "44444444-4444-4444-8444-444444444444";
const userId = "11111111-1111-4111-8111-111111111111";

describe("incident action link HTTP boundary", () => {
  const originalKey = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
  let token: string;
  let incidentStatus: "triggered" | "acknowledged" | "resolved";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = "test-provider-key-with-at-least-32-characters";
    token = createIncidentActionToken({ incidentId, userId });
    incidentStatus = "triggered";
    mocks.findIncident.mockImplementation(async () => ({
      id: incidentId,
      workspaceId: "22222222-2222-4222-8222-222222222222",
      title: "Checkout latency",
      severity: "critical",
      priority: "P1",
      status: incidentStatus,
      createdAt: new Date("2026-11-17T00:00:00Z"),
      service: { name: "Checkout API" },
      workspace: { suspendedAt: null },
    }));
    mocks.findUser.mockResolvedValue({ name: "Dana", suspendedAt: null });
    mocks.assertWorkspacePermission.mockResolvedValue(["responder"]);
    mocks.acknowledgeIncident.mockImplementation(async () => {
      incidentStatus = "acknowledged";
    });
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = originalKey;
  });

  async function invoke(handler: typeof getIncidentActionLinkHandler, params: { token: string }, body?: unknown) {
    const next = vi.fn();
    const json = vi.fn();
    const send = vi.fn();
    const res = { json, send, type: vi.fn(() => res) };
    await handler({ params, body } as never, res as never, next);
    return { json, next, send };
  }

  it("previews the incident without acknowledging it", async () => {
    const result = await invoke(getIncidentActionLinkHandler, { token });

    expect(result.json).toHaveBeenCalledWith({ data: expect.objectContaining({
      incident: expect.objectContaining({ id: incidentId, status: "triggered", service_name: "Checkout API" }),
      responder_name: "Dana",
    }) });
    expect(mocks.acknowledgeIncident).not.toHaveBeenCalled();
  });

  it("acknowledges as the token's user, never a fallback actor", async () => {
    const result = await invoke(acknowledgeIncidentActionLinkHandler, { token });

    expect(mocks.acknowledgeIncident).toHaveBeenCalledWith(incidentId, userId);
    expect(result.json).toHaveBeenCalledWith({ data: expect.objectContaining({
      incident: expect.objectContaining({ status: "acknowledged" }),
    }) });
  });

  it("does not acknowledge an incident that is no longer triggered", async () => {
    incidentStatus = "resolved";
    await invoke(acknowledgeIncidentActionLinkHandler, { token });

    expect(mocks.acknowledgeIncident).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens and responders who lost access", async () => {
    const invalid = await invoke(acknowledgeIncidentActionLinkHandler, { token: "forged" });
    expect(invalid.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, code: "incident_action_link_invalid" }));

    mocks.assertWorkspacePermission.mockRejectedValue(new WorkspaceError("workspace_permission_required", "denied"));
    const forbidden = await invoke(acknowledgeIncidentActionLinkHandler, { token });
    expect(forbidden.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "incident_action_link_forbidden" }));

    mocks.assertWorkspacePermission.mockResolvedValue(["responder"]);
    mocks.findUser.mockResolvedValue({ name: "Dana", suspendedAt: new Date() });
    const suspended = await invoke(acknowledgeIncidentActionLinkHandler, { token });
    expect(suspended.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(mocks.acknowledgeIncident).not.toHaveBeenCalled();
  });

  it("acknowledges from the phone keypad only when 1 is pressed", async () => {
    const other = await invoke(voiceIncidentActionLinkHandler, { token }, { Digits: "2" });
    expect(other.send).toHaveBeenCalledWith(expect.stringContaining("No action was taken."));
    expect(mocks.acknowledgeIncident).not.toHaveBeenCalled();

    const pressed = await invoke(voiceIncidentActionLinkHandler, { token }, { Digits: "1" });
    expect(pressed.send).toHaveBeenCalledWith(expect.stringContaining("The incident has been acknowledged."));
    expect(mocks.acknowledgeIncident).toHaveBeenCalledWith(incidentId, userId);

    const forged = await invoke(voiceIncidentActionLinkHandler, { token: "forged" }, { Digits: "1" });
    expect(forged.send).toHaveBeenCalledWith(expect.stringContaining("could not be acknowledged"));
  });
});
