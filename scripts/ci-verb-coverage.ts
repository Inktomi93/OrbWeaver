// D321: every domain verb implementation executes in the server suite, proved by native V8 function coverage.
// The thresholds hold only over the whole server suite (strict and legacy), so this run is their one home: a
// scoped `--coverage` run would red on verbs that a test outside its scope executes.
import process from "node:process";
import { runTool } from "@orb/tooling/floor/cli/run-tool";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { testProcessEnv } from "@orb/tooling/floor/process/process-env";
import { ownScheme } from "@orb/tooling/verify";

const SERVER_SUITE = ["tests/server/", "tests/legacy/server/"] as const;
// A service file wires every verb (inline arrows run only when the verb runs); verbs/ holds the factory bodies.
const VERB_IMPLEMENTATIONS = ["packages/server/src/domain/*/service.ts", "packages/server/src/domain/*/verbs/**/*.ts"] as const;
const REPORTS = "reports/verb-coverage";

await runTool(() => {
  const argv = [
    "test:node",
    ...SERVER_SUITE,
    "--coverage.enabled",
    ...VERB_IMPLEMENTATIONS.map((glob) => `--coverage.include=${glob}`),
    "--coverage.thresholds.perFile",
    "--coverage.thresholds.functions=100",
    "--coverage.reporter=text-summary",
    "--coverage.reporter=json",
    `--coverage.reportsDirectory=${REPORTS}`,
  ];
  return ownScheme(runNicedSync("pnpm", argv, { cwd: process.cwd(), env: testProcessEnv(), stdio: "inherit" }).status);
});
