import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createIncidentActionToken, verifyIncidentActionToken } from "./incident-action-token";

const incidentId = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";
const userId = "0b6f7e2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b";

describe("incident action token", () => {
  const originalKey = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = "test-provider-key-with-at-least-32-characters";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = originalKey;
  });

  it("round-trips the incident and user and stays SMS-sized", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    const token = createIncidentActionToken({ incidentId, userId }, now);

    expect(token).toMatch(/^[A-Za-z0-9_-]{71}$/);
    expect(verifyIncidentActionToken(token, now)).toEqual({
      incidentId,
      userId,
      expiresAt: new Date("2026-11-18T00:00:00Z"),
    });
  });

  it("rejects expired tokens", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    const token = createIncidentActionToken({ incidentId, userId }, now, 60);

    expect(verifyIncidentActionToken(token, new Date("2026-11-17T00:01:00Z"))).toBeNull();
  });

  it("rejects tampered tokens and tokens signed with another key", () => {
    const token = createIncidentActionToken({ incidentId, userId });
    const tampered = `${token.slice(0, 10)}${token[10] === "A" ? "B" : "A"}${token.slice(11)}`;

    expect(verifyIncidentActionToken(tampered)).toBeNull();
    expect(verifyIncidentActionToken("not a token")).toBeNull();
    expect(verifyIncidentActionToken("")).toBeNull();

    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = "another-provider-key-with-at-least-32-chars";
    expect(verifyIncidentActionToken(token)).toBeNull();
  });
});
