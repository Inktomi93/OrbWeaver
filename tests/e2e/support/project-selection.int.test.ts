// Native collection is independent of the shared stack-boot/seed selector; no stack starts under --list.
import { execFileSync } from "node:child_process";
import process from "node:process";
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
const CONFIG_PROBE = `
import config from "./playwright.config.ts";
console.log(JSON.stringify(config.webServer.map(server => server.env.AUTH_MODE)));
`;

function collectedProjects(suites: readonly JSONReportSuite[]): string[] {
  return suites.flatMap((suite) => [...suite.specs.flatMap((spec) => spec.tests.map((entry) => entry.projectName)), ...collectedProjects(suite.suites ?? [])]);
}

test("native repeated, variadic, equals and wildcard project selection agrees with boot configuration and the shared seed selector", { tags: ["slow"] }, () => {
  for (const selector of SELECTORS) {
    const argv = [...SPEC_FILTERS, "--list", "--reporter=json", ...selector];
    const report = JSON.parse(execFileSync("pnpm", ["e2e", ...argv], { encoding: "utf8" })) as JSONReport;
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
