// Fixed observation records actual indexed/fallback production without changing its queries or outcomes.
import { cpSync, mkdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { z } from "zod";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { copyNativeInventoryImplementation } from "./native-inventory-tree.ts";

test("indexed occurrence generations preserve dependency invalidation overlay pins and executable currentness", { timeout: scaledBudget(120_000) }, ({
  scratch,
}) => {
  const root = join(scratch, "subject");
  mkdirSync(join(root, "vendor"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".cache/\nvendor/\n");
  writeFileSync(join(root, "vendor/a.ts"), "export interface Item {value:number}\n");
  writeFileSync(join(root, "vendor/b.ts"), "export interface Item {value:number;other?:string}\n");
  writeFileSync(join(root, "vendor/index.ts"), "export {Item} from './a';\n");
  writeFileSync(
    join(root, "consumer.ts"),
    "import type {Item} from './vendor/index';export function read(seed:Item){const local:Item=seed;const unused=0;const shorthand={local};return [local,shorthand.local];}\n",
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  execFixtureGit(root, ["init", "-q"]);
  const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const implementation = copyNativeInventoryImplementation(join(scratch, "runtime"), repoRoot);
  const nativeModules = processEnvValue("ORB_NATIVE_OCCURRENCE_PACKAGES");
  const morphPackage = nativeModules === undefined ? findPackageJSON("ts-morph", import.meta.url) : join(nativeModules, "ts-morph/package.json");
  if (morphPackage === undefined) {
    throw new Error("native ts-morph package missing");
  }
  const morph = dirname(realpathSync(morphPackage));
  const commonPackage = findPackageJSON("@ts-morph/common", join(morph, "package.json"));
  if (commonPackage === undefined) {
    throw new Error("native common package missing");
  }
  const common = dirname(realpathSync(commonPackage));
  const modules = join(implementation, "native-modules");
  mkdirSync(join(modules, "@ts-morph"), { recursive: true });
  const copy = { recursive: true, dereference: true, filter: (path: string): boolean => !path.endsWith("/node_modules") };
  cpSync(morph, join(modules, "ts-morph"), copy);
  cpSync(common, join(modules, "@ts-morph/common"), copy);
  const packageSchema = z.object({ dependencies: z.record(z.string(), z.string()) });
  for (const [name, owner] of [
    ["ts-morph", morph],
    ["@ts-morph/common", common],
  ] as const) {
    const metadata = packageSchema.parse(JSON.parse(readFileSync(join(owner, "package.json"), "utf8")));
    for (const dependency of Object.keys(metadata.dependencies).filter((dependencyName) => dependencyName !== "@ts-morph/common")) {
      const packagePath = findPackageJSON(dependency, join(owner, "package.json"));
      if (packagePath === undefined) {
        throw new Error(`native dependency package missing: ${dependency}`);
      }
      const link = join(modules, name, "node_modules", dependency);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(dirname(packagePath), link, "dir");
    }
  }
  mkdirSync(join(modules, "ts-morph/node_modules/@ts-morph"), { recursive: true });
  symlinkSync(join(modules, "@ts-morph/common"), join(modules, "ts-morph/node_modules/@ts-morph/common"), "dir");
  mkdirSync(join(implementation, "tests/node_modules"), { recursive: true });
  symlinkSync(join(modules, "ts-morph"), join(implementation, "tests/node_modules/ts-morph"), "dir");
  const toolingModules = join(implementation, "tooling/node_modules");
  unlinkSync(toolingModules);
  mkdirSync(toolingModules);
  symlinkSync(join(modules, "ts-morph"), join(toolingModules, "ts-morph"), "dir");
  const toolingPackage = packageSchema.parse(JSON.parse(readFileSync(join(implementation, "tooling/package.json"), "utf8")));
  for (const dependency of Object.keys(toolingPackage.dependencies)) {
    if (dependency !== "ts-morph") {
      const link = join(toolingModules, dependency);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(join(repoRoot, "tooling/node_modules", dependency), link, "dir");
    }
  }
  const extract = join(implementation, "tooling/src/floor/compiler/semantic-inventory-extract.ts");
  const source = readFileSync(extract, "utf8");
  const point = "  if (occurrences !== undefined && occurrences.length !== declarations.length) {";
  expect(source.split(point)).toHaveLength(2);
  writeFileSync(
    extract,
    `import {appendFileSync as observeOccurrences} from 'node:fs';\n${source.replace(point, `  observeOccurrences(${JSON.stringify(join(root, ".cache/occurrence-coverage.jsonl"))},JSON.stringify(occurrences?.map((answer)=>answer.kind)??[])+'\\n');\n${point}`)}`,
  );
  const entry = join(implementation, "tests/support/node/native-reference-occurrence-delivery-child.mjs");
  mkdirSync(dirname(entry), { recursive: true });
  cpSync(fileURLToPath(new URL("../../../support/node/native-reference-occurrence-delivery-child.mjs", import.meta.url)), entry);
  const result = join(scratch, "result.json");
  const completed = runNicedSync(process.execPath, [
    "--import",
    join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts"),
    entry,
    root,
    result,
  ]);
  expect(completed.status, completed.stderr).toBe(0);
  const observed = z
    .object({
      coverage: z.array(z.array(z.enum(["indexed", "native"]))),
      before: z.object({ origins: z.array(z.string()), zero: z.array(z.never()) }),
      now: z.object({ origins: z.array(z.string()) }),
      warmReused: z.boolean(),
      dependencyInvalidated: z.boolean(),
      historicalPinsUnchanged: z.boolean(),
      disposed: z.boolean(),
      publicationUnchanged: z.boolean(),
    })
    .parse(JSON.parse(readFileSync(result, "utf8")));
  expect(observed).toMatchObject({ warmReused: true, dependencyInvalidated: true, historicalPinsUnchanged: true, disposed: true, publicationUnchanged: true });
  expect(observed.before.zero).toEqual([]);
  expect(observed.before.origins).toEqual([join(root, "vendor/a.ts")]);
  expect(observed.now.origins).toEqual([join(root, "vendor/b.ts")]);
  expect(observed.coverage).toHaveLength(3);
  for (const coverage of observed.coverage) {
    expect(coverage.filter((kind) => kind === "indexed").length).toBeGreaterThan(0);
    expect(coverage.filter((kind) => kind === "native").length).toBeGreaterThan(0);
  }
});
