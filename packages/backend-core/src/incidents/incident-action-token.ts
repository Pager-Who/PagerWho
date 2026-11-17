import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Compact signed token that lets a notified responder acknowledge one incident without a session.
// Layout: version(1) | incidentId(16) | userId(16) | expiresAt unix seconds(4) | HMAC-SHA256 truncated(16) → 71 base64url chars,
// short enough for SMS. Acknowledge is idempotent, so the token is reusable until it expires.
const tokenVersion = 1;
const payloadLength = 1 + 16 + 16 + 4;
const macLength = 16;
const defaultTtlSeconds = 24 * 60 * 60;

export type IncidentActionTokenPayload = {
  incidentId: string;
  userId: string;
  expiresAt: Date;
};

export function createIncidentActionToken(
  input: { incidentId: string; userId: string },
  now = new Date(),
  ttlSeconds = defaultTtlSeconds,
): string {
  const payload = Buffer.alloc(payloadLength);
  payload.writeUInt8(tokenVersion, 0);
  uuidToBytes(input.incidentId).copy(payload, 1);
  uuidToBytes(input.userId).copy(payload, 17);
  payload.writeUInt32BE(Math.floor(now.getTime() / 1000) + ttlSeconds, 33);

  return Buffer.concat([payload, sign(payload)]).toString("base64url");
}

export function verifyIncidentActionToken(token: string, now = new Date()): IncidentActionTokenPayload | null {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;

  const raw = Buffer.from(token, "base64url");
  if (raw.length !== payloadLength + macLength) return null;

  const payload = raw.subarray(0, payloadLength);
  const mac = raw.subarray(payloadLength);
  if (payload.readUInt8(0) !== tokenVersion || !timingSafeEqual(mac, sign(payload))) return null;

  const expiresAt = new Date(payload.readUInt32BE(33) * 1000);
  if (expiresAt.getTime() <= now.getTime()) return null;

  return {
    incidentId: bytesToUuid(payload.subarray(1, 17)),
    userId: bytesToUuid(payload.subarray(17, 33)),
    expiresAt,
  };
}

function sign(payload: Buffer): Buffer {
  return createHmac("sha256", readSigningKey()).update(payload).digest().subarray(0, macLength);
}

// Derived from the existing worker/API shared secret with a domain label, so no new deployment secret is needed.
function readSigningKey(): Buffer {
  const secret = process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("PROVIDER_CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters");
  }

  return createHash("sha256").update(`pagerwho:incident-action-token:v1:${secret}`, "utf8").digest();
}

function uuidToBytes(value: string): Buffer {
  const hex = value.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error("Invalid UUID");
  return Buffer.from(hex, "hex");
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
