import { afterEach, describe, expect, it } from "vitest";

import { readAuthSecret, requireAuthSecret } from "./auth-secret";
import { getAuthStateSecret } from "./oidc-config";

describe("auth secrets", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("does not use shared secrets as an OIDC state fallback", () => {
    delete process.env.AUTH_STATE_SECRET;
    process.env.JWT_SECRET = "legacy-jwt-secret";
    process.env.WEBHOOK_SECRET_PEPPER = "webhook-pepper";

    expect(getAuthStateSecret()).toBeNull();
  });

  it("requires a dedicated phone verification secret", () => {
    delete process.env.PHONE_VERIFICATION_SECRET;
    process.env.JWT_SECRET = "legacy-jwt-secret";

    expect(readAuthSecret("PHONE_VERIFICATION_SECRET")).toBeNull();
    expect(() => requireAuthSecret(
      "PHONE_VERIFICATION_SECRET",
      "phone_verification_secret_not_configured",
      "Phone verification secret is not configured",
    )).toThrowError("Phone verification secret is not configured");
  });
});
