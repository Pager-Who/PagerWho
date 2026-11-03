import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const vitest = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const extraArguments = process.argv.slice(2).filter((argument) => argument !== "--");
const outputArgument = extraArguments.find((argument) => argument.startsWith("--outputFile.json="))
  ?? "--outputFile.json=../../.tmp/copilot-evals/copilot-settings-live.json";
const result = spawnSync(process.execPath, [vitest, "run", "src/copilot/copilot-settings.live.test.ts",
  "--reporter=verbose", "--reporter=json", outputArgument,
  ...extraArguments.filter((argument) => !argument.startsWith("--outputFile.json="))], {
  cwd: new URL("../", import.meta.url),
  env: { ...process.env, COPILOT_LIVE_TESTS: "true" }, stdio: "inherit",
});
process.exitCode = result.status ?? 1;
