import process from "node:process";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";

function render(mode, values = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pagerwho-compose-"));
  try {
    const file = join(dir, "audit.env");
    const env = { DATABASE_URL: "postgresql://audit:audit@database:5432/audit", WEB_APP_URL: "https://alerts.test", WEBHOOK_SECRET_PEPPER: "a".repeat(64), PROVIDER_CREDENTIAL_ENCRYPTION_KEY: "b".repeat(64), ...values };
    writeFileSync(file, Object.entries(env).map(([k,v]) => k+"="+v).join("\n"));
    const result = spawnSync("docker", ["compose", "--env-file", file, "-p", "pagerwho-config-test", "-f", resolve("deploy/"+mode+"/docker-compose.yml"), "config", "--format", "json"], { encoding: "utf8", env: { ...process.env, PAGERWHO_ENV_FILE: file, PAGERWHO_IMAGE_TAG: "audit-contracts" } });
    assert.equal(result.status, 0, "Compose must render the synthetic config");
    return JSON.parse(result.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function renderQuickstart() {
  const result = spawnSync("docker", ["compose", "-f", resolve("compose.yaml"), "config", "--format", "json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, "Quickstart Compose must render");
  return JSON.parse(result.stdout);
}

test("quickstart includes a private PostgreSQL database and seeded application stack", () => {
  const { services } = renderQuickstart();
  assert.equal(services.postgres.image, "postgres:16");
  assert.equal(services.postgres.ports, undefined);
  assert.equal(services.migrate.depends_on.postgres.condition, "service_healthy");
  assert.equal(services.seed.depends_on.migrate.condition, "service_completed_successfully");
  assert.equal(services.api.depends_on.seed.condition, "service_completed_successfully");
  assert.equal(services.worker.depends_on.seed.condition, "service_completed_successfully");
  assert.equal(services.api.environment.DATABASE_URL, services.worker.environment.DATABASE_URL);
  assert.equal(services.api.environment.NOTIFICATION_DELIVERY_MODE, "log");
  assert.equal(services.web.ports[0].host_ip, "127.0.0.1");
  assert.equal(services.web.ports[0].published, "8080");
});
for (const mode of ["dev", "prod"]) {
  test(mode + " maps the selected environment consistently", () => {
    const { services } = render(mode);
    assert.equal(services.api.environment.DATABASE_URL, services.worker.environment.DATABASE_URL);
    assert.equal(services.api.environment.PROVIDER_CREDENTIAL_ENCRYPTION_KEY, services.worker.environment.PROVIDER_CREDENTIAL_ENCRYPTION_KEY);
    assert.equal(services.api.environment.WEB_APP_BASE_URL, "https://alerts.test");
    assert.equal(services.api.environment.WEBHOOK_PUBLIC_BASE_URL, "https://alerts.test");
    assert.equal(services.api.image, services.worker.image);
    assert.equal(services.api.depends_on.migrate.condition, "service_completed_successfully");
    assert.equal(services.worker.depends_on.migrate.condition, "service_completed_successfully");
    assert.equal(services.api.environment.NOTIFICATION_DELIVERY_MODE, mode === "prod" ? "live" : "log");
  });
  test(mode + " uses same-origin browser requests and configurable ports", () => {
    const { services } = render(mode, { PAGERWHO_HTTP_PORT: "19090", VITE_ALLOWED_HOSTS: "alerts.test" });
    const gateway = services[mode === "prod" ? "web" : "nginx"];
    assert.equal(gateway.ports[0].published, "19090");
    assert.equal(gateway.ports[0].host_ip, "127.0.0.1");
    if (mode === "prod") assert.equal(services.web.build.args.VITE_API_BASE_URL, "/api/v1");
    else {
      assert.equal(services.web.environment.VITE_API_BASE_URL, "/api/v1");
      assert.equal(services.web.environment.VITE_ALLOWED_HOSTS, "alerts.test");
      assert(!("DATABASE_URL" in services.web.environment));
      assert(!("PROVIDER_CREDENTIAL_ENCRYPTION_KEY" in services.web.environment));
    }
    assert(gateway.healthcheck);
  });
}
