import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const encryptedValuePrefix = "enc:v1";

export function encryptProviderCredential(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", readEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return [
    encryptedValuePrefix,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptProviderCredential(value: string): string {
  if (!value.startsWith(`${encryptedValuePrefix}:`)) return value;

  const [, , ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid encrypted provider credential");
  }

  const decipher = createDecipheriv("aes-256-gcm", readEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function readEncryptionKey(): Buffer {
  const secret = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("PROVIDER_CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters");
  }

  return createHash("sha256").update(secret, "utf8").digest();
}
