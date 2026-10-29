import process from "node:process";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
const bash = process.platform === "win32" ? join(process.env.ProgramFiles, "Git/bin/bash.exe") : "bash";
function run(failure) {
  const dir = mkdtempSync(join(tmpdir(), "pagerwho-runner-"));
  try {
    writeFileSync(join(dir, "audit.env"), "AUDIT=synthetic\n");
    const docker = join(dir, "docker");
    writeFileSync(docker, '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\nif [[ "$FAIL_AT" == validate && "$*" == *validate-env.mjs* ]]; then exit 41; fi\nif [[ "$FAIL_AT" == migrate && "$*" == *"run --rm --no-deps migrate" && "$*" != *validate-env.mjs* ]]; then exit 42; fi\n');
    chmodSync(docker, 0o755);
    const command = 'dir="$AUDIT_DIR"; if command -v cygpath >/dev/null; then dir="$(cygpath -u "$dir")"; fi; export PATH="$dir:$PATH"; export COMMAND_LOG="$dir/commands"; export PAGERWHO_ENV_FILE="$dir/audit.env"; bash deploy/deploy.sh dev';
    const result = spawnSync(bash, ["-c", command], { cwd: resolve("."), encoding: "utf8", env: { ...process.env, AUDIT_DIR: dir, FAIL_AT: failure, PAGERWHO_IMAGE_TAG: "audit-script" } });
    return { status: result.status, calls: readFileSync(join(dir, "commands"), "utf8") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test("invalid configuration prevents migrations and service replacement", () => { const result=run("validate"); assert.equal(result.status,41); assert(!result.calls.includes("run --rm --no-deps migrate\n")); assert(!result.calls.includes(" up ")); });
test("migration failure prevents service replacement", () => { const result=run("migrate"); assert.equal(result.status,42); assert(!result.calls.includes(" up ")); });
test("successful deployment waits for services and performs no pruning", () => { const result=run(""); assert.equal(result.status,0); assert(result.calls.includes("--wait --wait-timeout 180")); assert(!result.calls.includes("prune")); });
