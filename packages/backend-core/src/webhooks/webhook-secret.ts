const defaultWebhookBaseUrl = "http://127.0.0.1:3000";
const defaultSecretPepper = "dev-webhook-pepper";

export type WebhookSecretOptions = {
  baseUrl?: string;
  secretPepper?: string;
};

export function getWebhookBaseUrl(options: WebhookSecretOptions = {}) {
  return (options.baseUrl ?? defaultWebhookBaseUrl).replace(/\/$/, "");
}

export function buildWebhookUrl(endpointId: string, options: WebhookSecretOptions = {}) {
  return `${getWebhookBaseUrl(options)}/api/v1/webhooks/${endpointId}`;
}

export function buildWebhookUrlWithSecret(endpointId: string, secret: string, options: WebhookSecretOptions = {}) {
  return `${buildWebhookUrl(endpointId, options)}?token=${encodeURIComponent(secret)}`;
}

export function generateWebhookEndpointId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = randomBytes(16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateWebhookSecret() {
  return `whsec_${bytesToHex(randomBytes(24))}`;
}

export async function hashWebhookSecret(secret: string, options: WebhookSecretOptions = {}) {
  const pepper = options.secretPepper ?? defaultSecretPepper;
  const input = `${pepper}:${secret}`;

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return `sha256:${bytesToHex(new Uint8Array(digest))}`;
  }

  return `fallback:${hashString(input)}`;
}

export async function verifyWebhookSecret(secret: string | undefined, secretHash: string, options: WebhookSecretOptions = {}) {
  if (!secret) {
    return false;
  }

  const candidateHash = await hashWebhookSecret(secret, options);
  return candidateHash === secretHash;
}

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return bytes;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }

  return Math.abs(hash).toString(16);
}
