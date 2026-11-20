// The installed import checker judges actual DB/server source and package doors, never substitute DB declarations.
// One planted tree and one checker run per fixture shape: each case owns distinct entry and helper paths, so its
// violations are read off the shared run by path.
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { afterAll, beforeAll } from "vitest";
import type { Violation } from "./_native-cruise.ts";
import { cruiseRules, unresolvable } from "./_native-cruise.ts";

const REPO_ROOT = join(import.meta.dirname, "../..");
const ENTRY_DIR = "packages/server/src/entry/compose";
const QUERY_RULE = "entry-wiring-no-query-capability";
const DRIVER_RULE = "entry-wiring-no-physical-driver";
const LOADER_RULE = "host-module-loader-confined";
const CONTRACT_RULE = "query-wiring-contract-is-type-only";
const OWNER_RULE = "query-wiring-owner-conversion";
const WIRING_CONTRACT = "packages/db/src/client/wiring.ts";
const WIRING_ENTRY = `${ENTRY_DIR}/native-query-contract-probe.ts`;

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
  /** Where the probe is planted, when not under `ENTRY_DIR`. */
  readonly dir?: string;
  readonly rule: string | null;
}

// `createRequire` loads any specifier at runtime; the import graph sees only the `node:module` edge.
const REQUIRE_LOADER = 'import { createRequire } from "node:module"; export const load = (spec: string): unknown => createRequire(import.meta.url)(spec);';

const IMPORT_CASES: readonly ImportCase[] = [
  { name: "public alias", source: () => 'import { createDb as connect } from "@orb/db"; export { connect };', rule: QUERY_RULE },
  { name: "computed namespace", source: () => 'import * as db from "@orb/db"; const name = "createDb"; export const connect = db[name];', rule: QUERY_RULE },
  { name: "reexport", source: () => 'export { createDb as connect } from "@orb/db";', rule: QUERY_RULE },
  { name: "literal dynamic owner import", source: () => 'export const owner = import("@orb/db/wiring-owner");', rule: QUERY_RULE },
  { name: "relative client", source: () => 'import { createDb } from "../../../../db/src/client/index.ts"; export { createDb };', rule: QUERY_RULE },
  { name: "physical admission", source: () => 'import { databaseHandle } from "@orb/db/wiring-driver"; export { databaseHandle };', rule: QUERY_RULE },
  { name: "module loader alias", source: () => 'import { createRequire as loader } from "node:module"; export { loader };', rule: LOADER_RULE },
  { name: "domain createRequire", source: () => REQUIRE_LOADER, dir: "packages/server/src/domain/character", rule: LOADER_RULE },
  { name: "db createRequire", source: () => REQUIRE_LOADER, dir: "packages/db/src/client", rule: LOADER_RULE },
  {
    name: "inference bare module namespace",
    source: () => 'import * as host from "module"; export { host };',
    dir: "packages/inference/src/backends",
    rule: LOADER_RULE,
  },
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

const planted: PlantedCase[] = IMPORT_CASES.map((row, index) => {
  const entry = `${row.dir ?? ENTRY_DIR}/native-query-probe-${String(index)}.ts`;
  const helper = row.helper === undefined ? undefined : `${row.helper.dir}/native-query-helper-${String(index)}.ts`;
  return { ...row, paths: helper === undefined ? [entry] : [entry, helper] };
});

const RULES = [QUERY_RULE, DRIVER_RULE, LOADER_RULE, CONTRACT_RULE, OWNER_RULE] as const;

let treeRoot = "";
let cases: readonly Violation[];
let contract: readonly Violation[];

beforeAll(async () => {
  treeRoot = mkdtempSync(join(tmpdir(), "orb-native-compose-query-"));
  writeFileSync(join(treeRoot, "package.json"), '{"type":"module"}');
  productionPackages(treeRoot);
  for (const row of planted) {
    const [entry, helper] = row.paths;
    if (entry === undefined) {
      throw new Error(`case ${row.name} has no entry path`);
    }
    mkdirSync(dirname(join(treeRoot, entry)), { recursive: true });
    writeFileSync(join(treeRoot, entry), row.source(helper === undefined ? "" : (helper.split("/").at(-1) ?? "")));
    if (helper !== undefined && row.helper !== undefined) {
      writeFileSync(join(treeRoot, helper), row.helper.source);
    }
  }
  cases = await cruiseRules(
    treeRoot,
    planted.map(({ paths }) => paths[0] ?? ""),
    RULES,
  );
  // The contract shape replaces the shared wiring door, so it runs after the import cases and alone.
  mkdirSync(dirname(join(treeRoot, WIRING_ENTRY)), { recursive: true });
  writeFileSync(join(treeRoot, WIRING_ENTRY), 'import { databaseForOwner } from "@orb/db/wiring"; export { databaseForOwner };');
  writeFileSync(join(treeRoot, WIRING_CONTRACT), 'export { databaseForOwner } from "./wiring-capabilities.ts";');
  contract = await cruiseRules(treeRoot, [WIRING_ENTRY], RULES);
});

afterAll(() => {
  if (treeRoot !== "") {
    rmSync(treeRoot, { recursive: true, force: true });
  }
});

test("the shared run resolves every planted module and reports only planted violations", () => {
  expect(unresolvable(cases)).toEqual([]);
  const plantedPaths = new Set(planted.flatMap(({ paths }) => paths));
  expect(cases.length).toBeGreaterThan(0);
  expect(cases.filter(({ from }) => !plantedPaths.has(from))).toEqual([]);
});

test.for(planted)("native entry query ownership judges $name", (row) => {
  const rules = cases.filter(({ from }) => row.paths.includes(from)).map(({ rule }) => rule);
  expect({ clean: rules.length === 0, requiredRule: row.rule === null || rules.includes(row.rule) }, JSON.stringify(rules)).toEqual({
    clean: row.rule === null,
    requiredRule: true,
  });
});

test("the actual wiring package door cannot publish an executable private conversion", () => {
  expect(unresolvable(contract)).toEqual([]);
  expect(contract.map(({ rule }) => rule)).toEqual([CONTRACT_RULE]);
});
