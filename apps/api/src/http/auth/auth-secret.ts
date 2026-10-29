import { HttpError } from "../errors/http-error";

const minimumProductionSecretLength = 32;

export function readAuthSecret(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    return null;
  }

  if (process.env.NODE_ENV === "production" && value.length < minimumProductionSecretLength) {
    return null;
  }

  return value;
}

export function requireAuthSecret(name: string, code: string, message: string) {
  const secret = readAuthSecret(name);

  if (!secret) {
    throw new HttpError(503, code, message);
  }

  return secret;
}
