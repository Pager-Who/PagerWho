import { afterEach, describe, expect, it } from "vitest";

import { decryptProviderCredential, encryptProviderCredential } from "./provider-credential";

describe("provider credentials", () => {
  const originalKey = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = originalKey;
    }
  });

  it("encrypts and decrypts a provider credential", () => {
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = "test-provider-key-with-at-least-32-characters";

    const encrypted = encryptProviderCredential("smtp-app-password");

    expect(encrypted).not.toContain("smtp-app-password");
    expect(decryptProviderCredential(encrypted)).toBe("smtp-app-password");
  });

  it("rejects a missing encryption key", () => {
    delete process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;

    expect(() => encryptProviderCredential("smtp-app-password"))
      .toThrow("PROVIDER_CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters");
  });
});
