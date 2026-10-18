// Fixed observation records actual indexed/fallback production without changing its queries or outcomes.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { SyntaxKind } from "ts-morph";
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
  writeFileSync(join(root, "vendor/index.ts"), "export {Item} from './a';export type {Extra} from './missing';\n");
  writeFileSync(join(root, "contracts.ts"), "export interface Local {value:number}\n");
  // The escape gives this source no admitted roster, so its queries come back computed rather than indexed.
  // Its names appear nowhere else, so the other sources' queries stay indexed.
  writeFileSync(join(root, "escaped.ts"), "const escapedText='\\u0061';export const escaped={distinct:1};escaped.distinct;\n");
  for (const directory of ["packages/kit/src", "packages/client/src", "scripts"]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  writeFileSync(join(root, "packages/kit/src/a.ts"), "export const shaped={n:1};export const runtime={n:2};export const witnessed=3;export const unused=4;\n");
  writeFileSync(join(root, "packages/kit/src/barrel.ts"), "export {shaped as Renamed,runtime} from './a';\n");
  writeFileSync(
    join(root, "packages/client/src/use.ts"),
    "import {Renamed,runtime} from '@fixture/api';import {missing} from './absent';export type Shape=typeof Renamed;export const used=runtime;export const unresolved=missing;\n",
  );
  writeFileSync(
    join(root, "scripts/tool.ts"),
    "const witness='witnessed' satisfies keyof typeof import('../packages/kit/src/a');export const checked=witness;\n",
  );
  writeFileSync(
    join(root, "consumer.ts"),
    "import type {Item,Extra} from './vendor/index';import type {Local} from './contracts';export type ExtraAlias=Extra;export function read(seed:Item){const local:Item=seed;const unused=0;const record:Local={value:seed.value};record.value;const shorthand={local};return [local,shorthand.local];}\n",
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      files: [
        "consumer.ts",
        "contracts.ts",
        "escaped.ts",
        "packages/kit/src/a.ts",
        "packages/kit/src/barrel.ts",
        "packages/client/src/use.ts",
        "scripts/tool.ts",
      ],
      compilerOptions: {
        noLib: true,
        types: [],
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        paths: { "@fixture/api": ["./packages/kit/src/barrel.ts"] },
      },
    }),
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
  // The extractor's only own search: every call here is a second native search after the occurrence pass.
  const search = "pass.findReferences(query.file, query.start, { includeDefinitionDisplay: false })";
  expect(source.split(search)).toHaveLength(2);
  const searches = join(root, ".cache/extractor-searches.log");
  writeFileSync(
    extract,
    `import {appendFileSync as observeOccurrences} from 'node:fs';\n${source
      .replace(
        point,
        `  observeOccurrences(${JSON.stringify(join(root, ".cache/occurrence-coverage.jsonl"))},JSON.stringify(occurrences?.map((answer,index)=>({kind:answer.kind,declarationKind:declarations[index]?.declaration.kind}))??[])+'\\n');\n${point}`,
      )
      .replace(search, `(observeOccurrences(${JSON.stringify(searches)},'search\\n'),${search})`)}`,
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
  expect(completed.status, completed.stdout + completed.stderr).toBe(0);
  const observed = z
    .object({
      coverage: z.array(z.array(z.object({ kind: z.enum(["indexed", "computed", "native"]), declarationKind: z.number() }))),
      before: z.object({ origins: z.array(z.string()), zero: z.array(z.never()) }),
      now: z.object({ origins: z.array(z.string()) }),
      warmReused: z.boolean(),
      dependencyInvalidated: z.boolean(),
      negativeInvalidated: z.boolean(),
      historicalPinsUnchanged: z.boolean(),
      disposed: z.boolean(),
      publicationUnchanged: z.boolean(),
    })
    .parse(JSON.parse(readFileSync(result, "utf8")));
  expect(observed).toMatchObject({
    warmReused: true,
    dependencyInvalidated: true,
    negativeInvalidated: true,
    historicalPinsUnchanged: true,
    disposed: true,
    publicationUnchanged: true,
  });
  expect(observed.before.zero).toEqual([]);
  expect(observed.before.origins).toEqual([join(root, "vendor/a.ts")]);
  expect(observed.now.origins).toEqual([join(root, "vendor/b.ts")]);
  expect(observed.coverage).toHaveLength(4);
  const answers = observed.coverage.flat();
  expect(answers.some(({ kind }) => kind === "computed")).toBe(true);
  // Computed and indexed answers are reused; the extractor searches again only for never-computed queries.
  // No log means the extractor never searched.
  expect(existsSync(searches) ? readFileSync(searches, "utf8").split("\n").filter(Boolean) : []).toHaveLength(
    answers.filter(({ kind }) => kind === "native").length,
  );
  for (const coverage of observed.coverage) {
    expect(coverage.some(({ kind, declarationKind }) => kind === "indexed" && declarationKind === SyntaxKind.PropertySignature)).toBe(true);
    expect(coverage.some(({ kind, declarationKind }) => kind === "indexed" && declarationKind === SyntaxKind.PropertyAssignment)).toBe(true);
    expect(coverage.some(({ kind, declarationKind }) => kind === "indexed" && declarationKind === SyntaxKind.InterfaceDeclaration)).toBe(true);
  }
});
