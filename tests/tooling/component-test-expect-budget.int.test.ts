// The component-test assertion budget follows the box during a run: Playwright's own config model, built from the real
// `playwright-ct.config.ts`, hands each test the expect timeout from a reading taken when that test begins.
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import type { BoxLoad } from "@orb/tooling/floor/host/load-budget";
import { BOX_LOAD_ENV, budget } from "@orb/tooling/floor/host/load-budget";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { z } from "zod";
import { runNodeWithBudget, scaledBudget } from "./_load-budget.ts";

const CONFIG_FILE = fileURLToPath(new URL("../../playwright-ct.config.ts", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PROBE_BASE_MS = 30_000;

/** Per-core under 0.01: quiet, so every budget is its base. */
const QUIET: BoxLoad = { loadavg1: 0.2, cpuCount: 24 };
/** Per-core 4.0. */
const LOADED: BoxLoad = { loadavg1: 96, cpuCount: 24 };
const planted = (box: BoxLoad): string => `${String(box.loadavg1)}/${String(box.cpuCount)}`;

// The config runs in a child because a test may not import a root config that reaches test code. The child builds the
// model a Playwright worker builds from the config it re-imports at start; when a test begins the worker calls
// `setExpectConfig` with `testInfo._projectInternal.expect?.timeout`, and `_projectInternal` is one of these projects.
// Between reads the child plants the next box reading, as a run that picks up neighbours after its workers started.
const PROBE = `import { createRequire } from "node:module";
const [, configFile, configDir, envKey, ...readings] = process.argv;
const { default: config } = await import(configFile);
const { FullConfigInternal } = createRequire(createRequire(import.meta.url).resolve("@playwright/test/cli"))("playwright/lib/common");
const { projects } = new FullConfigInternal({ resolvedConfigFile: configFile, configDir }, config, {});
const reads = [];
for (const reading of readings) {
  process.env[envKey] = reading;
  reads.push(Object.fromEntries(projects.map((project) => [project.project.name, project.expect.timeout])));
}
process.stdout.write(JSON.stringify(reads));
`;

const readsSchema = z.array(z.record(z.string(), z.number()));

test("every component-test project scales its expect timeout from the reading at test start, not at config load", () => {
  const stdout = runNodeWithBudget(
    ["--input-type=module", "-e", PROBE, "--", CONFIG_FILE, REPO_ROOT, BOX_LOAD_ENV, planted(QUIET), planted(LOADED), planted(QUIET)],
    { cwd: REPO_ROOT, env: inheritedProcessEnv({ [BOX_LOAD_ENV]: planted(QUIET) }) },
    scaledBudget(PROBE_BASE_MS),
    "ct expect budget probe",
  );
  const [quiet, loaded, quietAgain] = readsSchema.parse(JSON.parse(stdout));
  expect(Object.keys(quiet ?? {}), "the probe read the configured projects").toContain("chromium");
  for (const [name, base] of Object.entries(quiet ?? {})) {
    expect(loaded?.[name], `${name} reads the busy box when its next test begins`).toBe(budget(base, () => LOADED));
    expect(loaded?.[name], `${name} scaled past its quiet budget`).toBeGreaterThan(base);
  }
  // The other direction: a box that quiets down again returns every budget to its base.
  expect(quietAgain).toEqual(quiet);
});
