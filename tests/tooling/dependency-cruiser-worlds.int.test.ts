// Test-helper world boundaries include erased type imports; native resolution owns the edge identity.
import { copyFileSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

test("native dependency rules reject upward helper-world edges and retain compatible edges", { timeout: scaledBudget(30_000) }, ({ scratch, repoRoot }) => {
  const files: Readonly<Record<string, string>> = {
    "tests/support/iso/value.ts": "export const value = 1; export interface Value { readonly value: number }",
    "tests/support/node/value.ts": "export const value = 1; export interface Value { readonly value: number }",
    "tests/support/node/ct-consumed.ts": "export const value = 1;",
    "tests/support/browser/value.ts": "export const value = 1; export interface Value { readonly value: number }",
    "tests/support/node/rejected.ts": 'export type { Value } from "../browser/value.ts";',
    "tests/support/iso/rejected-node.ts": 'export { value } from "../node/value.ts";',
    "tests/support/iso/rejected-browser.ts": 'export type { Value } from "../browser/value.ts";',
    "tests/support/node/rejected-transitive.ts": 'export { value } from "../bridge.ts";',
    "tests/support/bridge.ts": 'export { value } from "./browser/value.ts";',
    "tests/support/node/allowed-local.ts": 'export { value } from "./value.ts";',
    "tests/support/node/allowed.ts": 'export { value } from "../iso/value.ts";',
    "tests/support/browser/allowed.ts": 'export { value } from "../iso/value.ts";',
    "tests/support/iso/allowed.ts": 'export { value } from "./value.ts";',
  };
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), source);
  }
  mkdirSync(join(scratch, "tests/client"));
  writeFileSync(join(scratch, "tests/client/helper.ct.tsx"), 'import "../support/node/ct-consumed.ts";');
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    ["tests/support", "--config", join(repoRoot, ".dependency-cruiser.cjs"), "--output-type", "json"],
    { cwd: scratch },
  );
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout) as {
    readonly summary: { readonly totalCruised: number; readonly violations: readonly { readonly from: string; readonly rule: { readonly name: string } }[] };
  };
  mkdirSync(join(scratch, "tests/support/chat"));
  writeFileSync(join(scratch, "tests/support/chat/unrelated.ts"), "export const unrelated = 1;");
  mkdirSync(join(scratch, "scripts"));
  mkdirSync(join(scratch, "packages"));
  mkdirSync(join(scratch, "tooling"));
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  copyFileSync(join(repoRoot, "scripts/depcruise.mjs"), join(scratch, "scripts/depcruise.mjs"));
  const adapted = runNicedSync(process.execPath, ["scripts/depcruise.mjs", "--config", join(repoRoot, ".dependency-cruiser.cjs"), "--output-type", "json"], {
    cwd: scratch,
  });
  expect(adapted.status, adapted.stderr).toBe(0);
  const adapterReport = JSON.parse(adapted.stdout) as typeof report;
  expect(adapterReport.summary.violations).toEqual(report.summary.violations);
  expect(adapterReport.summary.totalCruised).toBe(Object.keys(files).length);
  expect(report.summary.totalCruised).toBe(Object.keys(files).length);
  expect(report.summary.violations.filter((violation) => violation.rule.name === "no-orphans")).toEqual([]);
  const gating = runNicedSync(process.execPath, ["scripts/depcruise.mjs", "--config", join(repoRoot, ".dependency-cruiser.cjs"), "--output-type", "err-long"], {
    cwd: scratch,
  });
  const nativeGating = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    ["tests/support", "--config", join(repoRoot, ".dependency-cruiser.cjs"), "--output-type", "err-long"],
    { cwd: scratch },
  );
  expect(nativeGating.status, nativeGating.stderr).toBeGreaterThan(0);
  expect(gating.status, gating.stderr).toBe(nativeGating.status);
  expect(gating.stdout).toContain("test-helper-world-direction");
  expect(
    report.summary.violations
      .filter((violation) => violation.rule.name === "test-helper-world-direction")
      .map((violation) => violation.from)
      .toSorted(),
  ).toEqual([
    "tests/support/iso/rejected-browser.ts",
    "tests/support/iso/rejected-node.ts",
    "tests/support/node/rejected-transitive.ts",
    "tests/support/node/rejected.ts",
  ]);
});
