// The installed import checker judges actual DB/server source and package doors, never substitute DB declarations.
import { copyFileSync, cpSync, mkdirSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const ENTRY = "packages/server/src/entry/compose/native-query-probe.ts";
const QUERY_RULE = "entry-wiring-no-query-capability";
const DRIVER_RULE = "entry-wiring-no-physical-driver";
const LOADER_RULE = "entry-wiring-no-module-loader";
const CONTRACT_RULE = "query-wiring-contract-is-type-only";
const OWNER_RULE = "query-wiring-owner-conversion";

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

function productionPackages(root: string, repoRoot: string): void {
  for (const name of ["db", "server"]) {
    const source = join(repoRoot, "packages", name);
    const target = join(root, "packages", name);
    cpSync(join(source, "src"), join(target, "src"), { recursive: true });
    copyFileSync(join(source, "package.json"), join(target, "package.json"));
    linkPackageDependencies(source, target);
  }
  const modules = join(root, "node_modules");
  mkdirSync(join(modules, "@orb"), { recursive: true });
  for (const name of readdirSync(join(repoRoot, "node_modules"))) {
    if (name !== "@orb") {
      symlinkSync(realpathSync(join(repoRoot, "node_modules", name)), join(modules, name));
    }
  }
  for (const name of readdirSync(join(repoRoot, "node_modules/@orb"))) {
    const target = name === "db" || name === "server" ? join(root, "packages", name) : realpathSync(join(repoRoot, "node_modules/@orb", name));
    symlinkSync(target, join(modules, "@orb", name));
  }
}

const IMPORT_CASES = [
  { name: "public alias", source: 'import { createDb as connect } from "@orb/db"; export { connect };', rule: QUERY_RULE },
  { name: "computed namespace", source: 'import * as db from "@orb/db"; const name = "createDb"; export const connect = db[name];', rule: QUERY_RULE },
  { name: "reexport", source: 'export { createDb as connect } from "@orb/db";', rule: QUERY_RULE },
  { name: "literal dynamic owner import", source: 'export const owner = import("@orb/db/wiring-owner");', rule: QUERY_RULE },
  { name: "relative client", source: 'import { createDb } from "../../../../db/src/client/index.ts"; export { createDb };', rule: QUERY_RULE },
  { name: "physical admission", source: 'import { databaseHandle } from "@orb/db/wiring-driver"; export { databaseHandle };', rule: QUERY_RULE },
  { name: "module loader alias", source: 'import { createRequire as loader } from "node:module"; export { loader };', rule: LOADER_RULE },
  { name: "boot barrel", source: 'export * from "@orb/server/entry/boot";', rule: DRIVER_RULE },
  { name: "Drizzle constructor", source: 'export { drizzle } from "drizzle-orm/libsql";', rule: QUERY_RULE },
  { name: "raw batch door", source: 'export { batchStmt } from "@orb/db/query";', rule: QUERY_RULE },
  {
    name: "helper local alias reexport",
    source: 'export { connect } from "../http/native-query-helper.ts";',
    helperPath: "packages/server/src/entry/http/native-query-helper.ts",
    helper: 'import { createDb as connect } from "@orb/db"; export { connect };',
    rule: QUERY_RULE,
  },
  {
    name: "helper owner conversion reexport",
    source: 'export * from "../http/native-query-helper.ts";',
    helperPath: "packages/server/src/entry/http/native-query-helper.ts",
    helper: 'export { databaseForOwner as recover } from "@orb/db/wiring-owner";',
    rule: QUERY_RULE,
  },
  {
    name: "non-owner foundation helper",
    source: 'export * from "../../foundation/native-query-helper.ts";',
    helperPath: "packages/server/src/foundation/native-query-helper.ts",
    helper: 'export { databaseForOwner as recover } from "@orb/db/wiring-owner";',
    rule: OWNER_RULE,
  },
  { name: "inert public contract", source: 'import type { DatabaseHandle } from "@orb/db/wiring"; export type Input = DatabaseHandle;', rule: null },
  { name: "real stats owner", source: 'export { createStatsBatchWiring } from "#domain/stats";', rule: null },
] as const;

test.for(IMPORT_CASES)("native entry query ownership judges $name", async (row, { plantedTree, repoRoot }) => {
  const root = await plantedTree({ "package.json": '{"type":"module"}' });
  productionPackages(root, repoRoot);
  writeFileSync(join(root, ENTRY), row.source);
  if ("helperPath" in row) {
    writeFileSync(join(root, row.helperPath), row.helper);
  }
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [ENTRY, "--config", join(repoRoot, ".dependency-cruiser.cjs"), "--output-type", "err-long"],
    { cwd: root },
  );
  const output = result.stdout + result.stderr;
  expect(result.errorCode, output).toBeUndefined();
  expect(output, row.source).not.toContain("not-to-unresolvable");
  expect({ clean: result.status === 0, requiredRule: row.rule === null || output.includes(row.rule) }, output).toEqual({
    clean: row.rule === null,
    requiredRule: true,
  });
});

test("the actual wiring package door cannot publish an executable private conversion", async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree({ "package.json": '{"type":"module"}' });
  productionPackages(root, repoRoot);
  const contract = "packages/db/src/client/wiring.ts";
  mkdirSync(dirname(join(root, ENTRY)), { recursive: true });
  writeFileSync(join(root, ENTRY), 'import { databaseForOwner } from "@orb/db/wiring"; export { databaseForOwner };');
  writeFileSync(join(root, contract), 'export { databaseForOwner } from "./wiring-capabilities.ts";');
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [ENTRY, "--config", join(repoRoot, ".dependency-cruiser.cjs"), "--output-type", "err-long"],
    { cwd: root },
  );
  const output = result.stdout + result.stderr;
  expect(result.errorCode, output).toBeUndefined();
  expect(output).not.toContain("not-to-unresolvable");
  expect(result.status, output).toBe(1);
  expect(output).toContain(CONTRACT_RULE);
  copyFileSync(join(repoRoot, contract), join(root, contract));
});
