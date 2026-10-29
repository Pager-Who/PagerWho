import crypto from "node:crypto";

const hashVersion = "scrypt";
const keyLength = 64;
const scryptOptions = {
  N: 16384,
  p: 1,
  r: 8,
} as const;

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derivedKey = await scryptAsync(password, salt, keyLength, scryptOptions) as Buffer;

  return [
    hashVersion,
    scryptOptions.N,
    scryptOptions.r,
    scryptOptions.p,
    salt,
    derivedKey.toString("base64url"),
  ].join("$");
}

function scryptAsync(password: string, salt: string, keylen: number, options: crypto.ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [version, rawN, rawR, rawP, salt, expected] = passwordHash.split("$");

  if (version !== hashVersion || !rawN || !rawR || !rawP || !salt || !expected) {
    return false;
  }

  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const derivedKey = await scryptAsync(password, salt, keyLength, { N, r, p }) as Buffer;
  const expectedBuffer = Buffer.from(expected, "base64url");

  return expectedBuffer.length === derivedKey.length && crypto.timingSafeEqual(derivedKey, expectedBuffer);
}

export function createAuthToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashAuthToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
