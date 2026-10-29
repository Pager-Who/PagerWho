import console from "node:console";
import process from "node:process";
import { resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";

export function validateDeploymentEnv(env, mode) {
  const errors = [];
  for (const name of ["DATABASE_URL", "WEB_APP_URL", "WEBHOOK_SECRET_PEPPER", "PROVIDER_CREDENTIAL_ENCRYPTION_KEY"]) {
    if (!env[name]?.trim() || /REPLACE_WITH/i.test(env[name])) errors.push(name + " must be configured");
  }
  for (const name of ["WEBHOOK_SECRET_PEPPER", "PROVIDER_CREDENTIAL_ENCRYPTION_KEY", "AUTH_STATE_SECRET", "PHONE_VERIFICATION_SECRET"]) {
    if (env[name] && (env[name].length < 32 || /REPLACE_WITH/i.test(env[name]))) errors.push(name + " must be an independent random secret of at least 32 characters");
  }
  const secrets = ["WEBHOOK_SECRET_PEPPER", "PROVIDER_CREDENTIAL_ENCRYPTION_KEY", "AUTH_STATE_SECRET", "PHONE_VERIFICATION_SECRET"].map(name => env[name]).filter(Boolean);
  if (new Set(secrets).size !== secrets.length) errors.push("Application secrets must use independent values");
  try {
    const db = new URL(env.DATABASE_URL);
    if (!["postgresql:", "postgres:"].includes(db.protocol)) throw new Error();
    if (["localhost", "127.0.0.1", "[::1]"].includes(db.hostname)) errors.push("DATABASE_URL must reach PostgreSQL outside the application container");
  } catch { errors.push("DATABASE_URL must be a valid PostgreSQL URL"); }
  for (const name of ["WEB_APP_URL", "WEB_APP_BASE_URL", "WEBHOOK_PUBLIC_BASE_URL"]) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
      if (mode === "prod" && url.protocol !== "https:") errors.push(name + " must use HTTPS in production (session cookies are secure)");
    } catch { errors.push(name + " must be an HTTP(S) origin without credentials, path, query, or fragment"); }
  }
  const oidc = ["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"];
  if (oidc.some(name => env[name]?.trim())) {
    for (const name of [...oidc, "AUTH_STATE_SECRET"]) if (!env[name]?.trim()) errors.push(name + " is required when OIDC is enabled");
  }
  const smtp = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"];
  if (smtp.some(name => env[name]?.trim())) {
    for (const name of smtp) if (!env[name]?.trim()) errors.push(name + " is required when authentication email is enabled");
  }
  if (!["auto", "live", "log"].includes(env.NOTIFICATION_DELIVERY_MODE || (mode === "prod" ? "live" : "log"))) errors.push("NOTIFICATION_DELIVERY_MODE must be auto, live, or log");
  const retention = env.PAGERWHO_RETENTION_DAYS;
  if (retention !== undefined && (!/^\d+$/.test(retention) || Number(retention) < 1 || Number(retention) > 36500)) errors.push("PAGERWHO_RETENTION_DAYS must be between 1 and 36500");
  for (const resource of ["WORKSPACES", "MEMBERS", "SERVICES", "ON_CALL_SCHEDULES", "ESCALATION_POLICIES"]) {
    const key = "PAGERWHO_LIMIT_" + resource, raw = env[key];
    if (raw !== undefined && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))) errors.push(key + " must be a non-negative safe integer");
  }
  return errors;
}

export function deploymentWarnings(env) {
  const mail = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"].every(name => env[name]?.trim());
  const oidc = ["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI", "AUTH_STATE_SECRET"].every(name => env[name]?.trim());
  return mail || oidc ? [] : ["Authentication email and OIDC are not configured. Password users can sign in, but email verification and password-reset messages will not be delivered."];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  const errors = ["dev", "prod"].includes(mode) ? validateDeploymentEnv(process.env, mode) : ["Expected deployment mode dev or prod"];
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log("Deployment environment validated.");
    for (const warning of deploymentWarnings(process.env)) console.warn(warning);
  }
}
