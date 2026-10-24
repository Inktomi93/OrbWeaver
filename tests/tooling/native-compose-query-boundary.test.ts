// The installed import checker judges actual DB/server source and package doors, never substitute DB declarations.
// One planted tree and one checker run per fixture shape: each case owns distinct entry and helper paths, so its
// violations are read off the shared run by path. A real dependency-cruiser run is the subject, hence the long hook budget.
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { SpawnNicedResult } from "@orb/tooling/floor/process/proc";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";
import { afterAll, beforeAll } from "vitest";
import { scaledBudget } from "./_load-budget.ts";

const REPO_ROOT = join(import.meta.dirname, "../..");
const ENTRY_DIR = "packages/server/src/entry/compose";
const QUERY_RULE = "entry-wiring-no-query-capability";
const DRIVER_RULE = "entry-wiring-no-physical-driver";
const LOADER_RULE = "entry-wiring-no-module-loader";
const CONTRACT_RULE = "query-wiring-contract-is-type-only";
const OWNER_RULE = "query-wiring-owner-conversion";
const WIRING_CONTRACT = "packages/db/src/client/wiring.ts";
const WIRING_ENTRY = `${ENTRY_DIR}/native-query-contract-probe.ts`;
// dependency-cruiser's err-long line: `  error <rule>: <from> → <to>`.
const VIOLATION_RE = /^\s*error (?<rule>\S+): (?<from>\S+) → (?<to>\S+)/u;

function linkPackageDependencies(source: string, target: string): void {
  const modules = join(target, "node_modules");
  mkdirSync(modules, { recursive: true });
  for (const dependency of readdirSync(join(source, "node_modules"))) {
    if (dependency === "@orb") {
      continue;
    }
    if (dependency.startsWith("@")) {
      mkdirSync(join(modules, dependency));
      for (const child of readdirSync(join(source, "node_modules", dependency))) {
        symlinkSync(realpathSync(join(source, "node_modules", dependency, child)), join(modules, dependency, child));
      }
    } else {
      symlinkSync(realpathSync(join(source, "node_modules", dependency)), join(modules, dependency));
    }
  }
}

function productionPackages(root: string): void {
  for (const name of ["db", "server"]) {
    const source = join(REPO_ROOT, "packages", name);
    const target = join(root, "packages", name);
    cpSync(join(source, "src"), join(target, "src"), { recursive: true });
    copyFileSync(join(source, "package.json"), join(target, "package.json"));
    linkPackageDependencies(source, target);
  }
  const modules = join(root, "node_modules");
  mkdirSync(join(modules, "@orb"), { recursive: true });
  for (const name of readdirSync(join(REPO_ROOT, "node_modules"))) {
    if (name !== "@orb") {
      symlinkSync(realpathSync(join(REPO_ROOT, "node_modules", name)), join(modules, name));
    }
  }
  for (const name of readdirSync(join(REPO_ROOT, "node_modules/@orb"))) {
    const target = name === "db" || name === "server" ? join(root, "packages", name) : realpathSync(join(REPO_ROOT, "node_modules/@orb", name));
    symlinkSync(target, join(modules, "@orb", name));
  }
}

interface ImportCase {
  readonly name: string;
  readonly source: (helper: string) => string;
  readonly helper?: { readonly dir: string; readonly source: string };
  readonly rule: string | null;
}

const IMPORT_CASES: readonly ImportCase[] = [
  { name: "public alias", source: () => 'import { createDb as connect } from "@orb/db"; export { connect };', rule: QUERY_RULE },
  { name: "computed namespace", source: () => 'import * as db from "@orb/db"; const name = "createDb"; export const connect = db[name];', rule: QUERY_RULE },
  { name: "reexport", source: () => 'export { createDb as connect } from "@orb/db";', rule: QUERY_RULE },
  { name: "literal dynamic owner import", source: () => 'export const owner = import("@orb/db/wiring-owner");', rule: QUERY_RULE },
  { name: "relative client", source: () => 'import { createDb } from "../../../../db/src/client/index.ts"; export { createDb };', rule: QUERY_RULE },
  { name: "physical admission", source: () => 'import { databaseHandle } from "@orb/db/wiring-driver"; export { databaseHandle };', rule: QUERY_RULE },
  { name: "module loader alias", source: () => 'import { createRequire as loader } from "node:module"; export { loader };', rule: LOADER_RULE },
  { name: "boot barrel", source: () => 'export * from "@orb/server/entry/boot";', rule: DRIVER_RULE },
  { name: "Drizzle constructor", source: () => 'export { drizzle } from "drizzle-orm/libsql";', rule: QUERY_RULE },
  { name: "raw batch door", source: () => 'export { batchStmt } from "@orb/db/query";', rule: QUERY_RULE },
  {
    name: "helper local alias reexport",
    source: (helper) => `export { connect } from "../http/${helper}";`,
    helper: { dir: "packages/server/src/entry/http", source: 'import { createDb as connect } from "@orb/db"; export { connect };' },
    rule: QUERY_RULE,
  },
  {
    name: "helper owner conversion reexport",
    source: (helper) => `export * from "../http/${helper}";`,
    helper: { dir: "packages/server/src/entry/http", source: 'export { databaseForOwner as recover } from "@orb/db/wiring-owner";' },
    rule: QUERY_RULE,
  },
  {
    name: "non-owner foundation helper",
    source: (helper) => `export * from "../../foundation/${helper}";`,
    helper: { dir: "packages/server/src/foundation", source: 'export { databaseForOwner as recover } from "@orb/db/wiring-owner";' },
    rule: OWNER_RULE,
  },
  { name: "inert public contract", source: () => 'import type { DatabaseHandle } from "@orb/db/wiring"; export type Input = DatabaseHandle;', rule: null },
  { name: "real stats owner", source: () => 'export { createStatsBatchWiring } from "#domain/stats";', rule: null },
];

interface PlantedCase extends ImportCase {
  readonly paths: readonly string[];
}

interface Violation {
  readonly rule: string;
  readonly from: string;
}

interface CheckerRun {
  readonly result: SpawnNicedResult;
  readonly output: string;
  readonly violations: readonly Violation[];
}

const planted: PlantedCase[] = IMPORT_CASES.map((row, index) => {
  const entry = `${ENTRY_DIR}/native-query-probe-${String(index)}.ts`;
  const helper = row.helper === undefined ? undefined : `${row.helper.dir}/native-query-helper-${String(index)}.ts`;
  return { ...row, paths: helper === undefined ? [entry] : [entry, helper] };
});

function cruise(root: string, entries: readonly string[]): Promise<CheckerRun> {
  return spawnNiced(
    join(REPO_ROOT, "node_modules/.bin/depcruise"),
    [...entries, "--config", join(REPO_ROOT, ".dependency-cruiser.ts"), "--output-type", "err-long"],
    { cwd: root, timeoutMs: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS) },
  ).then((result) => {
    const output = result.stdout + result.stderr;
    const violations = output.split("\n").flatMap((line) => {
      const groups = VIOLATION_RE.exec(line)?.groups;
      return groups?.["rule"] === undefined || groups["from"] === undefined ? [] : [{ rule: groups["rule"], from: groups["from"] }];
    });
    return { result, output, violations };
  });
}

let treeRoot = "";
let cases: CheckerRun;
let contract: CheckerRun;

beforeAll(async () => {
  treeRoot = mkdtempSync(join(tmpdir(), "orb-native-compose-query-"));
  writeFileSync(join(treeRoot, "package.json"), '{"type":"module"}');
  productionPackages(treeRoot);
  for (const row of planted) {
    const [entry, helper] = row.paths;
    if (entry === undefined) {
      throw new Error(`case ${row.name} has no entry path`);
    }
    writeFileSync(join(treeRoot, entry), row.source(helper === undefined ? "" : (helper.split("/").at(-1) ?? "")));
    if (helper !== undefined && row.helper !== undefined) {
      writeFileSync(join(treeRoot, helper), row.helper.source);
    }
  }
  cases = await cruise(
    treeRoot,
    planted.map(({ paths }) => paths[0] ?? ""),
  );
  // The contract shape replaces the shared wiring door, so it runs after the import cases and alone.
  mkdirSync(dirname(join(treeRoot, WIRING_ENTRY)), { recursive: true });
  writeFileSync(join(treeRoot, WIRING_ENTRY), 'import { databaseForOwner } from "@orb/db/wiring"; export { databaseForOwner };');
  writeFileSync(join(treeRoot, WIRING_CONTRACT), 'export { databaseForOwner } from "./wiring-capabilities.ts";');
  contract = await cruise(treeRoot, [WIRING_ENTRY]);
}, scaledBudget(LONG_TEST_TIMEOUT_BASE_MS));

afterAll(() => {
  if (treeRoot !== "") {
    rmSync(treeRoot, { recursive: true, force: true });
  }
});

test("the shared checker run completes, resolves every planted module and reports only planted violations", () => {
  expect(cases.result.timedOut, cases.output).toBe(false);
  expect(cases.result.code, cases.output).toBe(cases.violations.length);
  expect(cases.output).not.toContain("not-to-unresolvable");
  const plantedPaths = new Set(planted.flatMap(({ paths }) => paths));
  expect(cases.violations.length, cases.output).toBeGreaterThan(0);
  expect(cases.violations.filter(({ from }) => !plantedPaths.has(from))).toEqual([]);
});

test.for(planted)("native entry query ownership judges $name", (row) => {
  const rules = cases.violations.filter(({ from }) => row.paths.includes(from)).map(({ rule }) => rule);
  expect({ clean: rules.length === 0, requiredRule: row.rule === null || rules.includes(row.rule) }, cases.output).toEqual({
    clean: row.rule === null,
    requiredRule: true,
  });
});

test("the actual wiring package door cannot publish an executable private conversion", () => {
  expect(contract.result.timedOut, contract.output).toBe(false);
  expect(contract.output).not.toContain("not-to-unresolvable");
  expect(contract.result.code, contract.output).toBe(1);
  expect(contract.violations.map(({ rule }) => rule)).toEqual([CONTRACT_RULE]);
});
