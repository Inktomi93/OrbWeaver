// @orb-waive-file no-test-fabrication(JscpdConfig): baselined when the gate widened to value casts; burn-down item 906.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readConcurrencyProfile } from "@orb/tooling/floor/host/concurrency-profile";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { scaledBudget } from "./_load-budget.ts";

const RUN_BUDGET_MS = scaledBudget(30_000);
const CONFIG = join(process.cwd(), "jscpd.json");
const TESTS_CONFIG = join(process.cwd(), "jscpd.tests.json");

interface JscpdReport {
  readonly duplicates: readonly {
    readonly firstFile: { readonly name: string };
    readonly secondFile: { readonly name: string };
  }[];
  readonly statistics: { readonly total: { readonly sources: number } };
}

interface JscpdConfig {
  readonly ignore: readonly string[];
}

function plant(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const PACKAGE_CLONE = `export function sharedPackageSequence(values: readonly string[]): string {
  const accepted: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length < 4) continue;
    accepted.push(\`package-value:\${normalized}:\${normalized.length}\`);
  }
  return accepted.toSorted().join("|");
}
`;

const TOOLING_CLONE = `export function sharedToolScore(values: readonly number[]): number {
  let score = 11;
  for (const value of values) {
    if (value % 3 === 0) {
      score += value * 5;
    } else {
      score -= Math.ceil(value / 2);
    }
  }
  return Math.max(score, 0);
}
`;

const VENDOR_CLONE = `.vendor-control {
  color: rgb(10 20 30);
  background-color: rgb(240 241 242);
  border-color: rgb(40 50 60);
  border-style: solid;
  border-width: medium;
  display: grid;
  grid-template-columns: minmax(min-content, max-content) minmax(min-content, max-content);
  align-items: center;
  justify-content: space-between;
  padding-block: 1rem;
  padding-inline: 2rem;
  margin-block: 3rem;
  margin-inline: 4rem;
}
`;

function runCpd(root: string, config: string, output: string): ReturnType<typeof spawnNiced> {
  return spawnNiced("jscpd", ["--workers", String(readConcurrencyProfile().cpdWorkers), "-c", config, "--reporters", "json", "--output", output], {
    cwd: root,
    timeoutMs: RUN_BUDGET_MS,
  });
}

function readReport(output: string): JscpdReport {
  // @orb-waive no-test-fabrication(JscpdReport): jscpd's JSON report is a third-party file with no schema in this repo, and the test reads two of its fields; ends if a jscpd report reader lands in tooling.
  return JSON.parse(readFileSync(join(output, "jscpd-report.json"), "utf8")) as JscpdReport;
}

function duplicatePairs(report: JscpdReport): readonly string[] {
  return report.duplicates.map(({ firstFile, secondFile }) => [basename(firstFile.name), basename(secondFile.name)].toSorted().join(" ↔ "));
}

test("native CPD covers package and tooling implementation while excluding non-implementation populations", { timeout: RUN_BUDGET_MS }, async () => {
  const root = mkdtempSync(join(tmpdir(), "orb-cpd-scope-"));
  const output = join(root, "report");
  try {
    const fixtureConfig = join(root, "jscpd.json");
    writeFileSync(fixtureConfig, readFileSync(CONFIG));
    plant(root, "packages/example/src/package-a.ts", PACKAGE_CLONE);
    plant(root, "packages/example/src/package-b.ts", PACKAGE_CLONE);
    plant(root, "tooling/src/example/tooling-a.ts", TOOLING_CLONE);
    plant(root, "tooling/src/example/tooling-b.ts", TOOLING_CLONE);

    // These deliberate twins prove the configured roots and exclusions do not admit tests or generated/vendor data.
    plant(root, "tests/excluded-a.ts", PACKAGE_CLONE);
    plant(root, "tests/excluded-b.ts", PACKAGE_CLONE);
    plant(root, "packages/example/src/migrations/generated-a.ts", TOOLING_CLONE);
    plant(root, "packages/example/src/migrations/generated-b.ts", TOOLING_CLONE);
    plant(root, "tooling/src/snap/lib/devtools-frontend/vendor-a.css", VENDOR_CLONE);
    plant(root, "tooling/src/snap/lib/devtools-frontend/vendor-b.css", VENDOR_CLONE);

    const result = await runCpd(root, fixtureConfig, output);
    expect(result.code, result.stderr || result.stdout).toBe(1);

    const report = readReport(output);
    expect(report.statistics.total.sources).toBe(4);
    const pairs = duplicatePairs(report);
    expect(pairs).toContain("package-a.ts ↔ package-b.ts");
    expect(pairs).toContain("tooling-a.ts ↔ tooling-b.ts");
    expect(pairs.some((pair) => /excluded|generated|vendor/u.test(pair))).toBe(false);

    const config = JSON.parse(readFileSync(fixtureConfig, "utf8")) as JscpdConfig;
    const exposedConfig = join(root, "jscpd-vendor-exposed.json");
    writeFileSync(
      exposedConfig,
      JSON.stringify({ ...config, ignore: config.ignore.filter((pattern) => pattern !== "tooling/src/snap/lib/devtools-frontend/**") }),
    );
    const exposedOutput = join(root, "vendor-exposed-report");
    const exposedResult = await runCpd(root, exposedConfig, exposedOutput);
    expect(exposedResult.code, exposedResult.stderr || exposedResult.stdout).toBe(1);
    const exposedReport = readReport(exposedOutput);
    expect(exposedReport.statistics.total.sources).toBe(6);
    expect(duplicatePairs(exposedReport)).toContain("vendor-a.css ↔ vendor-b.css");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the tests-only ratchet scans tests/ alone and fails a copy above its threshold", { timeout: RUN_BUDGET_MS }, async () => {
  const root = mkdtempSync(join(tmpdir(), "orb-cpd-tests-"));
  try {
    const fixtureConfig = join(root, "jscpd.tests.json");
    writeFileSync(fixtureConfig, readFileSync(TESTS_CONFIG));
    plant(root, "tests/client/unique.ct.tsx", TOOLING_CLONE);
    plant(root, "packages/example/src/package-a.ts", PACKAGE_CLONE);
    plant(root, "packages/example/src/package-b.ts", PACKAGE_CLONE);

    // The passing control: the package twins are jscpd.json's population, so a tests tree with no copy is clean.
    const clean = await runCpd(root, fixtureConfig, join(root, "clean-report"));
    expect(clean.code, clean.stderr || clean.stdout).toBe(0);
    const cleanReport = readReport(join(root, "clean-report"));
    expect(cleanReport.statistics.total.sources).toBe(1);

    plant(root, "tests/server/domain/a.int.test.ts", PACKAGE_CLONE);
    plant(root, "tests/server/domain/b.int.test.ts", PACKAGE_CLONE);
    const copied = await runCpd(root, fixtureConfig, join(root, "copied-report"));
    expect(copied.code, copied.stderr || copied.stdout).toBe(1);
    const copiedReport = readReport(join(root, "copied-report"));
    expect(copiedReport.statistics.total.sources).toBe(3);
    expect(duplicatePairs(copiedReport)).toEqual(["a.int.test.ts ↔ b.int.test.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
