import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import {
  buildLiveness,
  collectApiSurface,
  collectOrphanCandidates,
  collectSwallowedCandidates,
  collectTypeOnlyCandidates,
  deadEvidenceFor,
  ownExports,
} from "@orb/tooling/ast";
import { runCodemod } from "@orb/tooling/codemod";
import { pidAlive } from "@orb/tooling/floor/artifacts/run-retention";
import { resolveExportedDeclarations } from "@orb/tooling/floor/code-facts/reference-fact";
import { createSemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory";
import type { SemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { SemanticInventoryError } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { latestInventoryGeneration, openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import type { SourceCorpus } from "@orb/tooling/floor/compiler/ts-workspace";
import { createSemanticWorkspace, semanticReferenceNodes } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { vi } from "vitest";
import { declarationsNamed } from "../../../../tooling/src/floor/code-facts/reference-declarations.ts";

function fixtureValue<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("required fixture value is missing");
  }
  return value;
}

function write(root: string, path: string, text: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

function initialize(root: string): void {
  write(root, ".gitignore", ".cache/\nnode_modules/\n");
  write(
    root,
    "tsconfig.base.json",
    JSON.stringify({
      files: [],
      compilerOptions: {
        strict: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        types: [],
        paths: { "@fixture/barrel": ["./packages/kit/src/barrel.ts"] },
      },
    }),
  );
  write(
    root,
    "packages/kit/tsconfig.json",
    JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022"] }, include: ["src/*.ts"] }),
  );
  write(
    root,
    "packages/client/tsconfig.json",
    JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022", "DOM"], customConditions: ["browser"] }, include: ["src/*.ts"] }),
  );
  write(
    root,
    "tsconfig.tools.json",
    JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { lib: ["ES2022"] }, include: ["scripts/*.ts", "tests/*.ts"] }),
  );
  write(
    root,
    "packages/kit/src/base.ts",
    "export const alive=1; export const lazy=2; export const held=3; export const unused=4; export const onlyTest=5; export const bridge=6; export const schema={value: 1}; export interface Shape { value: number };\n",
  );
  write(
    root,
    "packages/kit/src/barrel.ts",
    "export { alive as renamed, lazy, held, schema, type Shape } from './base'; export {platform as native} from 'fixture-platform';\n",
  );
  write(
    root,
    "packages/client/src/browser.ts",
    "import { renamed, type Shape, schema, native as platformDoor } from '@fixture/barrel'; import * as ns from '@fixture/barrel'; export const read=renamed; export const viaDoor=platformDoor; export type View=typeof schema; export const held=ns.held; export function shadow(ns: {lazy:number}) { return ns.lazy }; export const later=import('@fixture/barrel').then(m=>m.lazy); export const button=document.createElement('button'); import { platform } from 'fixture-platform'; export const selected=platform;\n",
  );
  write(
    root,
    "scripts/tool.ts",
    "import { bridge } from '../packages/kit/src/base'; export const tool=bridge; const witness='alive' satisfies keyof typeof import('../packages/kit/src/base'); export const checked=witness; import { platform } from 'fixture-platform'; export const selected=platform;\n",
  );
  write(root, "tests/consumer.ts", "import { onlyTest } from '../packages/kit/src/base'; export const testValue=onlyTest;\n");
  write(
    root,
    "node_modules/fixture-platform/package.json",
    JSON.stringify({ name: "fixture-platform", exports: { ".": { browser: "./browser.ts", default: "./node.ts" } } }),
  );
  write(root, "node_modules/fixture-platform/browser.ts", "export const platform='browser';\n");
  write(root, "node_modules/fixture-platform/node.ts", "export const platform='node';\n");
  execFixtureGit(root, ["init", "-q"]);
}

function verdicts(corpus: SourceCorpus): object {
  const live = buildLiveness(corpus, { edges: true });
  const scope = (path: string): boolean => path.includes("/packages/kit/src/");
  const sort = (values: readonly string[]): string[] => [...values].toSorted();
  return {
    exports: corpus.getSourceFiles().flatMap((sf) => [...ownExports(sf)].map(({ name, decl }) => [name, decl.getSourceFile().getFilePath(), decl.getStart()])),
    prod: sort([...live.usedProd]),
    tests: sort([...live.usedTest]),
    tooling: live.externalConsumptions.map((fact) => [fact.targetKey, fact.consumerClass, fact.kind]),
    arms: [...live.arms].map(([key, arms]) => [key, sort([...arms])]).toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    edges: [...live.consumers].map(([key, consumers]) => [key, sort([...consumers])]).toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    orphans: collectOrphanCandidates(corpus, live, scope).map(({ name, starSuppressed }) => [name, starSuppressed]),
    swallowed: collectSwallowedCandidates(corpus, live, scope).map(({ name, sites }) => [name, sites]),
    types: collectTypeOnlyCandidates(corpus, scope).map(({ name, sites, unionSource }) => [name, sites, unionSource]),
    api: collectApiSurface(corpus, scope, live).map(({ name, klass, ownPkg, consumers, typeOnly, evidence }) => ({
      name,
      klass,
      ownPkg,
      consumers,
      typeOnly,
      evidence,
    })),
  };
}

function source(inventory: SemanticInventory, path: string): NonNullable<ReturnType<SourceCorpus["getSourceFile"]>> {
  const file = inventory.sourceCorpus().getSourceFile(path);
  if (file === undefined) {
    throw new Error(`fixture source missing: ${path}`);
  }
  return file;
}

test("stored native collectors preserve aliases, namespace bindings, lazy members, references and consumer classes", ({ scratch }) => {
  initialize(scratch);
  const native = createSemanticWorkspace({ root: scratch });
  using stored = createSemanticInventory({ root: scratch });
  expect(verdicts(stored.sourceCorpus())).toEqual(verdicts(native.sourceCorpus()));
  const base = source(stored, "packages/kit/src/base.ts");
  const alive = base.getVariableDeclarationOrThrow("alive");
  expect(semanticReferenceNodes(alive).map((node) => [node.getSourceFile().getFilePath(), node.getStart(), node.getEnd()])).toEqual(
    semanticReferenceNodes(fixtureValue(native.sourceCorpus().getSourceFile(base.getFilePath())).getVariableDeclarationOrThrow("alive")).map((node) => [
      node.getSourceFile().getFilePath(),
      node.getStart(),
      node.getEnd(),
    ]),
  );
  const api = collectApiSurface(stored.sourceCorpus(), (path) => path.endsWith("/base.ts"));
  expect(api.find((entry) => entry.name === "onlyTest")?.klass).toBe("test-only");
  expect(api.find((entry) => entry.name === "bridge")?.consumers).toContain("scripts/tooling");
  expect(api.find((entry) => entry.name === "unused")?.klass).toBe("unused");
  expect(native.sourceCorpus().getSourceFile("packages/client/src/browser.ts")?.getVariableDeclarationOrThrow("button").getType().getText()).toBe(
    "HTMLButtonElement",
  );
});

test("partitions retain native options, closure, failed resolution and importing-world package targets", ({ scratch }) => {
  initialize(scratch);
  write(scratch, "packages/client/src/missing.ts", "import { absent } from './absent'; export const read=absent;\n");
  const native = fixtureValue(createSemanticWorkspace({ root: scratch }).program("packages/client/tsconfig.json"));
  const nativeTarget = native.sourceFile("packages/client/src/browser.ts")?.getImportDeclaration("fixture-platform")?.getModuleSpecifierSourceFile();
  expect(
    nativeTarget?.getFilePath(),
    JSON.stringify({
      options: native.project().getCompilerOptions(),
      diagnostics: native
        .project()
        .getPreEmitDiagnostics()
        .map((diagnostic) => diagnostic.getMessageText()),
    }),
  ).toBe(join(scratch, "node_modules/fixture-platform/browser.ts"));
  using stored = createSemanticInventory({ root: scratch });
  const browserImport = fixtureValue(
    source(stored, "packages/client/src/browser.ts")
      .getImportDeclarations()
      .find((imp) => imp.getModuleSpecifierValue() === "fixture-platform"),
  );
  const toolImport = fixtureValue(
    source(stored, "scripts/tool.ts")
      .getImportDeclarations()
      .find((imp) => imp.getModuleSpecifierValue() === "fixture-platform"),
  );
  expect(stored.moduleTarget(browserImport)?.getFilePath()).toBe(join(scratch, "node_modules/fixture-platform/browser.ts"));
  expect(stored.moduleTarget(toolImport)?.getFilePath()).toBe(join(scratch, "node_modules/fixture-platform/node.ts"));
  const importingDoor = source(stored, "packages/client/src/browser.ts").getImportDeclarationOrThrow("@fixture/barrel");
  const importedBarrel = fixtureValue(stored.moduleTarget(importingDoor));
  const publicOrigin = resolveExportedDeclarations(importedBarrel, "native");
  expect(publicOrigin.kind).toBe("resolved");
  if (publicOrigin.kind !== "resolved") {
    throw new Error(publicOrigin.detail);
  }
  expect(publicOrigin.value.map((declaration) => declaration.getSourceFile().getFilePath())).toEqual([
    join(scratch, "node_modules/fixture-platform/browser.ts"),
  ]);
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partitions = readInventoryGeneration(database, stored.generation);
  const browser = fixtureValue(partitions.find((partition) => partition.program === "packages/client/tsconfig.json"));
  expect(JSON.parse(browser.compilerOptionsJson)).toMatchObject({ customConditions: ["browser"] });
  expect(browser.sources.some((file) => file.file.endsWith("fixture-platform/browser.ts"))).toBe(true);
  expect(browser.nativeRoots.toSorted()).toEqual([join(scratch, "packages/client/src/browser.ts"), join(scratch, "packages/client/src/missing.ts")]);
  expect(new Set(partitions.flatMap((partition) => partition.sources.filter((file) => file.authored).map((file) => file.consumerClass)))).toEqual(
    new Set(["product", "tooling", "test"]),
  );
  expect(browser.modules.find((module) => module.specifier === "./absent")?.target).toBeNull();
  expect(browser.inputs.some((input) => input.path.endsWith("/absent.ts") && input.version === "false")).toBe(true);
  expect(latestInventoryGeneration(database)).toBe(stored.generation);
  for (const partition of partitions) {
    expect(pidAlive(fixtureValue(partition.workerPid))).toBe(false);
  }
});

test("changes, additions, removals, package resolution and failed lookups invalidate without mixing pinned generations", ({ scratch }) => {
  initialize(scratch);
  write(scratch, "packages/client/src/missing.ts", "import { absent } from './absent'; export const read=absent;\n");
  using previous = createSemanticInventory({ root: scratch });
  const old = source(previous, "packages/kit/src/base.ts").getFullText();
  write(scratch, "packages/kit/src/base.ts", old.replace("export const unused=4;", "export const replacement=4;"));
  write(scratch, "packages/client/src/absent.ts", "export const absent=7;\n");
  write(scratch, "node_modules/fixture-platform/browser.ts", "export const platform='changed';\n");
  rmSync(join(scratch, "tests/consumer.ts"));
  using current = createSemanticInventory({ root: scratch });
  expect(current.generation).toBeGreaterThan(previous.generation);
  expect(source(previous, "packages/kit/src/base.ts").getFullText()).toBe(old);
  expect([...ownExports(source(current, "packages/kit/src/base.ts"))].map((entry) => entry.name)).not.toContain("unused");
  expect(
    current
      .sourceCorpus()
      .getSourceFiles()
      .map((file) => file.getFilePath()),
  ).not.toContain(join(scratch, "tests/consumer.ts"));
  const missing = fixtureValue(source(current, "packages/client/src/missing.ts").getImportDeclarations()[0]);
  expect(current.moduleTarget(missing)?.getFilePath()).toBe(join(scratch, "packages/client/src/absent.ts"));
  expect(source(current, "node_modules/fixture-platform/browser.ts").getFullText()).toContain("changed");
  using unchanged = createSemanticInventory({
    root: scratch,
    buildPartition: () => {
      throw new Error("unchanged generation loaded a Program");
    },
  });
  expect(unchanged.generation).toBe(current.generation);
});

test("same-input competing writers recheck under the lock and build each native partition once", async ({ scratch }) => {
  initialize(scratch);
  const log = join(scratch, ".cache/builds.jsonl");
  const store = import.meta.resolve("@orb/tooling/floor/code-facts/semantic-inventory");
  const worker = import.meta.resolve("@orb/tooling/floor/compiler/semantic-inventory-worker-run");
  const script = `import {appendFileSync,mkdirSync} from 'node:fs';
    import {dirname} from 'node:path';
    import {createSemanticInventory} from ${JSON.stringify(store)};
    import {runInventoryPartitionWorker} from ${JSON.stringify(worker)};
    mkdirSync(dirname(${JSON.stringify(log)}),{recursive:true});
    using inventory=createSemanticInventory({root:${JSON.stringify(scratch)},buildPartition(request){
      appendFileSync(${JSON.stringify(log)},JSON.stringify(request.descriptor.id)+'\\n');
      runInventoryPartitionWorker(request);
    }});
    console.log(JSON.stringify({generation:inventory.generation,programs:inventory.programs}));`;
  const [left, right] = await Promise.all([
    spawnNiced(process.execPath, ["--input-type=module", "-e", script], { cwd: scratch }),
    spawnNiced(process.execPath, ["--input-type=module", "-e", script], { cwd: scratch }),
  ]);
  expect(left.code, left.stderr).toBe(0);
  expect(right.code, right.stderr).toBe(0);
  expect(JSON.parse(left.stdout)).toEqual(JSON.parse(right.stdout));
  const builds = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string);
  expect(builds.toSorted()).toEqual(["packages/client/tsconfig.json", "packages/kit/tsconfig.json", "tsconfig.tools.json"]);
});

test("actual codemod transaction inventories preserve aliases, native package paths and overlay-only lookup roots on refusal", { tags: ["slow"] }, async ({
  scratch,
}) => {
  initialize(scratch);
  write(scratch, "packages/client/src/missing.ts", "import { absent } from './absent'; export const read=absent;\n");
  using committed = createSemanticInventory({ root: scratch });
  const basePath = join(scratch, "packages/kit/src/base.ts");
  const original = readFileSync(basePath, "utf8");
  let captured: SemanticInventory | undefined;
  await expect(
    runCodemod(
      "inventory transaction",
      (context) => {
        const added = join(scratch, "packages/client/src/absent.ts");
        const deleted = join(scratch, "tests/consumer.ts");
        context.plan({
          description: "Change transaction bytes and membership",
          touchedFiles: [basePath, added, deleted],
          transform: (ctx) => {
            ctx.project.getSourceFileOrThrow(basePath).replaceWithText(original.replace("alive=1", "alive=101"));
            ctx.project.createSourceFile(added, "export const absent=7;\n");
            ctx.project.getSourceFileOrThrow(deleted).delete();
          },
        });
        const workspace = context.semantic();
        {
          using inventory = workspace.inventory();
          captured = inventory;
          const missing = fixtureValue(source(inventory, "packages/client/src/missing.ts").getImportDeclarations()[0]);
          expect(inventory.moduleTarget(missing)?.getFilePath()).toBe(added);
          const browser = source(inventory, "packages/client/src/browser.ts");
          const aliased = fixtureValue(browser.getImportDeclarations()[0]);
          expect(
            inventory
              .exports(fixtureValue(inventory.moduleTarget(aliased)), aliased)
              .get("renamed")?.[0]
              ?.getSourceFile()
              .getFilePath(),
          ).toBe(basePath);
          const platform = fixtureValue(browser.getImportDeclarations().find((imp) => imp.getModuleSpecifierValue() === "fixture-platform"));
          expect(inventory.moduleTarget(platform)?.getFilePath()).toBe(join(scratch, "node_modules/fixture-platform/browser.ts"));
          expect(source(inventory, "packages/kit/src/base.ts").getFullText()).toContain("alive=101");
          expect(
            inventory
              .sourceCorpus()
              .getSourceFiles()
              .map((file) => file.getFilePath()),
          ).not.toContain(deleted);
        }
        using fresh = workspace.inventory();
        expect(source(fresh, "packages/kit/src/base.ts").getFullText()).toContain("alive=101");
        throw new Error("refuse transaction after extraction");
      },
      {
        argv: [],
        repoRoot: scratch,
        setup: {
          tsConfigFilePath: join(scratch, "packages/kit/tsconfig.json"),
          replaceGlobs: [`${scratch}/packages/*/src/*.ts`, `${scratch}/scripts/*.ts`, `${scratch}/tests/*.ts`],
        },
        skipDiagnosticsCheck: true,
      },
    ),
  ).rejects.toThrow("refuse transaction after extraction");
  expect(() => captured?.sourceCorpus().getSourceFiles()).toThrow("disposed");
  expect(readFileSync(basePath, "utf8")).toBe(original);
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(database)).toBe(committed.generation);
  expect(source(committed, "packages/kit/src/base.ts").getFullText()).toBe(original);
});

test("stored declaration selection preserves native local/export admission without invoking a syntax-carrier checker", ({ scratch }) => {
  initialize(scratch);
  write(
    scratch,
    "packages/kit/src/declarations.ts",
    `
export function direct(): void {}
export const directValue = 1;
function internal(): void {}
function aliased(): void {}
export { aliased as publicAlias };
const localValue = 1;
let mutableValue = 2;
class LocalClass { method(): void {} }
interface LocalInterface { value: string }
type LocalType = LocalInterface;
enum LocalEnum { Value }
export default function NamedDefault(): void {}
`,
  );
  write(scratch, "packages/kit/src/declarations-barrel.ts", 'export { direct as viaBarrel, publicAlias } from "./declarations";');
  write(scratch, "packages/kit/src/default-alias.ts", "function publishedDefault(): void {} export default publishedDefault;");
  const native = createSemanticWorkspace({ root: scratch });
  using stored = createSemanticInventory({ root: scratch });
  const names = [
    "direct",
    "directValue",
    "viaBarrel",
    "publishedDefault",
    "internal",
    "aliased",
    "publicAlias",
    "localValue",
    "mutableValue",
    "LocalClass",
    "LocalInterface",
    "LocalType",
    "LocalEnum",
    "method",
    "NamedDefault",
    "default",
  ];
  const expected = names.map((name) =>
    declarationsNamed(native.sourceCorpus().getSourceFiles(), name).map((node) => [node.getSourceFile().getFilePath(), node.getStart(), node.getKind()]),
  );
  const files = stored.sourceCorpus().getSourceFiles();
  const exportSpies = files.map((file) =>
    vi.spyOn(file, "getExportedDeclarations").mockImplementation(() => {
      throw new Error("syntax carrier invoked native export discovery");
    }),
  );
  const declarationSpies = files
    .flatMap((file) => [
      ...file.getFunctions(),
      ...file.getVariableDeclarations(),
      ...file.getClasses(),
      ...file.getInterfaces(),
      ...file.getTypeAliases(),
      ...file.getEnums(),
    ])
    .map((node) =>
      vi.spyOn(node, "isExported").mockImplementation(() => {
        throw new Error("syntax carrier invoked native export classification");
      }),
    );
  try {
    expect(names.map((name) => declarationsNamed(files, name).map((node) => [node.getSourceFile().getFilePath(), node.getStart(), node.getKind()]))).toEqual(
      expected,
    );
  } finally {
    for (const spy of [...exportSpies, ...declarationSpies]) {
      spy.mockRestore();
    }
  }
});

test("stored dead evidence refuses unindexed dependency barrel origins instead of false unused candidates", ({ scratch }) => {
  initialize(scratch);
  const native = createSemanticWorkspace({ root: scratch });
  const nativeCorpus = native.sourceCorpus();
  const browser = fixtureValue(native.program("packages/client/tsconfig.json"));
  const nativeBarrel = fixtureValue(browser.sourceFile("packages/kit/src/barrel.ts"));
  const nativeOrigin = fixtureValue(nativeBarrel.getExportedDeclarations().get("native")?.[0]);
  expect(nativeOrigin.getSourceFile().getFilePath()).toBe(join(scratch, "node_modules/fixture-platform/browser.ts"));
  expect(
    semanticReferenceNodes(nativeOrigin)
      .filter((node) => node.getText() === "platformDoor")
      .map((node) => node.getSourceFile().getFilePath()),
  ).toEqual([join(scratch, "packages/client/src/browser.ts"), join(scratch, "packages/client/src/browser.ts")]);
  expect(deadEvidenceFor(nativeCorpus, nativeOrigin, "native", buildLiveness(nativeCorpus))).toMatchObject({ verdict: "ALIVE" });

  using stored = createSemanticInventory({ root: scratch });
  const corpus = stored.sourceCorpus();
  const live = buildLiveness(corpus);
  const origins = declarationsNamed(corpus.getSourceFiles(), "native");
  expect(origins).toHaveLength(1);
  const origin = fixtureValue(origins[0]);
  expect(origin.getSourceFile().getFilePath()).toBe(join(scratch, "node_modules/fixture-platform/node.ts"));
  const diagnostic = `native semantic inventory references unsupported for non-authored origin: ${origin.getSourceFile().getFilePath()}:${String(origin.getStart())}-${String(origin.getEnd())}; dependency-origin references are not indexed; use a native semantic view`;
  expect(() => deadEvidenceFor(corpus, origin, "native", live)).toThrow(SemanticInventoryError);
  expect(() => deadEvidenceFor(corpus, origin, "native", live)).toThrow(diagnostic);
  expect(() => semanticReferenceNodes(origin)).toThrow(diagnostic);
  expect(deadEvidenceFor(corpus, source(stored, "packages/kit/src/base.ts").getVariableDeclarationOrThrow("alive"), "alive", live)).toMatchObject({
    verdict: "ALIVE",
  });
  expect(deadEvidenceFor(corpus, source(stored, "packages/kit/src/base.ts").getVariableDeclarationOrThrow("unused"), "unused", live)).toMatchObject({
    verdict: "CANDIDATE",
    prodCount: 0,
    toolCount: 0,
    testCount: 0,
  });
});
