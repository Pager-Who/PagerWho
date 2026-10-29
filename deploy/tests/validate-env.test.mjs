import assert from "node:assert/strict";
import test from "node:test";
import { validateDeploymentEnv, deploymentWarnings } from "../validate-env.mjs";
const base = () => ({ DATABASE_URL: "postgresql://audit:audit@database:5432/audit", WEB_APP_URL: "https://alerts.test", WEBHOOK_SECRET_PEPPER: "a".repeat(64), PROVIDER_CREDENTIAL_ENCRYPTION_KEY: "b".repeat(64) });
test("minimal production config does not require optional OIDC, phone, or SMTP", () => assert.deepEqual(validateDeploymentEnv(base(), "prod"), []));
test("development allows HTTP", () => assert.deepEqual(validateDeploymentEnv({ ...base(), WEB_APP_URL: "http://localhost:8080" }, "dev"), []));
test("production rejects HTTP origins", () => assert(validateDeploymentEnv({ ...base(), WEB_APP_URL: "http://alerts.test" }, "prod").some(e => e.includes("HTTPS"))));
test("rejects container loopback DB addresses", () => assert(validateDeploymentEnv({ ...base(), DATABASE_URL: "postgresql://audit:audit@localhost:5432/audit" }, "prod").some(e => e.includes("outside"))));
test("checks the provider encryption key before migrations", () => assert(validateDeploymentEnv({ ...base(), PROVIDER_CREDENTIAL_ENCRYPTION_KEY: "short" }, "prod").some(e => e.includes("PROVIDER_CREDENTIAL_ENCRYPTION_KEY"))));
test("rejects example secrets without disclosing their values", () => { const secret = "REPLACE_WITH_PRIVATE_VALUE"; const errors = validateDeploymentEnv({ ...base(), WEBHOOK_SECRET_PEPPER: secret }, "prod"); assert(errors.length); assert(errors.every(e => !e.includes(secret))); });
test("rejects partial optional providers", () => { assert(validateDeploymentEnv({ ...base(), OIDC_CLIENT_ID: "audit" }, "prod").some(e => e.includes("OIDC_ISSUER_URL"))); assert(validateDeploymentEnv({ ...base(), SMTP_HOST: "smtp.test" }, "prod").some(e => e.includes("SMTP_PASSWORD"))); });
test("rejects short optional secrets", () => assert(validateDeploymentEnv({ ...base(), PHONE_VERIFICATION_SECRET: "short" }, "prod").some(e => e.includes("PHONE_VERIFICATION_SECRET"))));
test("rejects invalid quotas and retention", () => { assert(validateDeploymentEnv({ ...base(), PAGERWHO_LIMIT_MEMBERS: "-1" }, "prod").length); assert(validateDeploymentEnv({ ...base(), PAGERWHO_RETENTION_DAYS: "0" }, "prod").length); });

test("rejects shared secrets across different purposes", () => assert(validateDeploymentEnv({ ...base(), PHONE_VERIFICATION_SECRET: "a".repeat(64) }, "prod").some(e => e.includes("independent values"))));

test("warns when optional authentication integrations are not configured", () => assert(deploymentWarnings(base()).some(w => w.includes("Password users can sign in"))));
test("configured SMTP suppresses the onboarding warning", () => assert.deepEqual(deploymentWarnings({ ...base(), SMTP_HOST: "smtp.test", SMTP_USER: "audit", SMTP_PASSWORD: "synthetic" }), []));
