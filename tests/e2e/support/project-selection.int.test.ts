// Native collection is independent of the shared stack-boot/seed selector; no stack starts under --list.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { JSONReport, JSONReportSuite } from "@playwright/test/reporter";
import { expect, test } from "../../support/fixtures.ts";
import { selectedModeProjects } from "./modes.ts";

const SELECTORS = [
  ["--project", "single-user", "local"],
  ["--project=single-user", "--project", "local", "forward-header"],
  ["--project=single-user", "local"],
  ["--project", "SINGLE-*", "LOCAL", "--project=forward-*"],
  ["--", "--project", "local"],
] as const;
const SPEC_FILTERS = ["auth-smoke.local.spec.ts", "smoke.spec.ts", "auth-smoke.forward.spec.ts"];
const COLLECTION_ARGS = [...SPEC_FILTERS, "--list", "--reporter=json"];
// Linked .bin launchers can load another runner copy than the sandbox specs register against.
const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve("@playwright/test/cli");
const CONFIG_PROBE = `
import config from "./playwright.config.ts";
console.log(JSON.stringify(config.webServer.map(server => server.env.AUTH_MODE)));
`;

function collect(selector: readonly string[], configFile = "playwright.config.ts"): ReturnType<typeof runNicedSync> {
  return runNicedSync(process.execPath, [PLAYWRIGHT_CLI, "test", "-c", configFile, ...COLLECTION_ARGS, ...selector]);
}

function collectedProjects(suites: readonly JSONReportSuite[]): string[] {
  return suites.flatMap((suite) => [...suite.specs.flatMap((spec) => spec.tests.map((entry) => entry.projectName)), ...collectedProjects(suite.suites ?? [])]);
}

test("native repeated, variadic, equals and wildcard project selection agrees with boot configuration and the shared seed selector", { tags: ["slow"] }, () => {
  for (const selector of SELECTORS) {
    const argv = [...COLLECTION_ARGS, ...selector];
    const collection = collect(selector);
    expect(collection.status, collection.stdout + collection.stderr).toBe(0);
    const report = JSON.parse(collection.stdout) as JSONReport;
    expect(report.errors).toEqual([]);
    const native = [...new Set(collectedProjects(report.suites))].sort();
    expect(native.length).toBeGreaterThan(0);
    const sharedSelection = selectedModeProjects(argv)
      .map((mode) => mode.name)
      .sort();
    const bootConfiguration = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", CONFIG_PROBE, "--", ...argv], { encoding: "utf8" }),
    ) as readonly string[];
    expect(sharedSelection, JSON.stringify(selector)).toEqual(native);
    expect([...bootConfiguration].sort(), JSON.stringify(selector)).toEqual(native);
  }
});

test("native collection rejects an unmatched project instead of falling back to other auth modes", () => {
  const selector = ["--project=unconfigured-auth-project"];
  const argv = [...COLLECTION_ARGS, ...selector];
  const collection = collect(selector);
  expect(collection.status, collection.stdout + collection.stderr).toBe(1);
  expect(collection.stdout + collection.stderr).toContain('Project(s) "unconfigured-auth-project" not found');
  expect(selectedModeProjects(argv)).toEqual([]);
});

test("native collection rejects a missing project value instead of treating it as default selection", () => {
  const argv = [...COLLECTION_ARGS, "--project"];
  const collection = collect(["--project"]);
  expect(collection.status, collection.stdout + collection.stderr).toBe(1);
  expect(collection.stderr).toContain("argument missing");
  expect(collection.stderr).toContain("--project");
  expect(selectedModeProjects(argv)).toEqual([]);
});

test("native collection refuses a missing explicit configuration instead of silently loading the default", () => {
  const configFile = join(import.meta.dirname, "missing-project-selection.config.ts");
  const collection = collect([], configFile);
  expect(collection.status, collection.stdout + collection.stderr).toBe(1);
  expect(collection.stderr).toContain(`${configFile} does not exist`);
});
