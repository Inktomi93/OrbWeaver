import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import {
  buildLiveness,
  collectApiSurface,
  collectOrphanCandidates,
  collectSwallowedCandidates,
  collectTypeOnlyCandidates,
  deadEvidenceFor,
  ownExports,
  testOnlyClassOf,
} from "@orb/tooling/ast";
import { pidAlive } from "@orb/tooling/floor/artifacts/run-retention";
import { beginReferencePass, endReferencePass, isDocumentationLinkReference, resolveExportedDeclarations } from "@orb/tooling/floor/code-facts/reference-fact";
import type { SemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { SemanticInventoryError } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { latestInventoryGeneration, openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import type { SourceCorpus } from "@orb/tooling/floor/compiler/ts-workspace";
import { createSemanticWorkspace, nativeCompilerSourceFiles, semanticReferenceNodes, sourceBindingUsage } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { declarationsNamed } from "../../../../tooling/src/floor/code-facts/reference-declarations.ts";
import { readInventoryInputs, readInventoryModules, readInventorySourceMetadata } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { declarationBindingKeys, samePhysicalNode } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { scaledBudget } from "../../_load-budget.ts";
import {
  initializeNativeInventoryFixture as initialize,
  nativeInventoryFixture,
  writeNativeInventoryFixtureFile as write,
} from "../compiler/native-inventory-fixture.ts";

function fixtureValue<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("required fixture value is missing");
  }
  return value;
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
  using stored = nativeInventoryFixture({ root: scratch });
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

test.for(["native", "stored"] as const)("own-file binding work is reused across exports and repeated collectors: %s", (mode, { scratch }) => {
  initialize(scratch);
  write(
    scratch,
    "packages/kit/src/usage.ts",
    `
export function called(): void {}
export function unusedA(): void {}
export function unusedB(): void {}
export interface UnusedShape { value: string }
/** See {@link unusedA}. */
export function documentation(): void {}
export function consumer(): void { called(); }
`,
  );
  const workspace = createSemanticWorkspace({ root: scratch });
  using stored = nativeInventoryFixture({ root: scratch });
  const corpus = mode === "native" ? workspace.sourceCorpus() : stored.sourceCorpus();
  const file = fixtureValue(corpus.getSourceFile("packages/kit/src/usage.ts"));
  let queries = 0;
  const counts = new Map<object, number>();
  const symbols = stored.symbols;
  const nativeSymbol = Node.prototype.getSymbol;
  const storedSpy = vi.spyOn(stored, "symbols").mockImplementation((node) => {
    if (node.getSourceFile().getFilePath() === file.getFilePath()) {
      queries++;
      counts.set(node.compilerNode, (counts.get(node.compilerNode) ?? 0) + 1);
    }
    return symbols(node);
  });
  const nativeSpy = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (!Node.isSourceFile(this) && this.getSourceFile().getFilePath() === file.getFilePath()) {
      queries++;
      counts.set(this.compilerNode, (counts.get(this.compilerNode) ?? 0) + 1);
    }
    return nativeSymbol.call(this);
  });
  const classify = (): object => {
    const phase = buildLiveness(corpus);
    return {
      api: collectApiSurface(corpus, (path) => path === file.getFilePath(), phase).map(({ name, klass }) => [name, klass]),
      orphans: collectOrphanCandidates(corpus, phase, (path) => path === file.getFilePath()).map(({ name }) => name),
      testonly: [...ownExports(file)].map(({ name, decl }) => [name, testOnlyClassOf(file, name, decl, phase)]),
    };
  };
  try {
    const first = classify();
    const initialQueries = queries;
    expect(initialQueries).toBeGreaterThan(0);
    expect(first).toMatchObject({
      api: [
        ["called", "internal"],
        ["unusedA", "unused"],
        ["unusedB", "unused"],
        ["documentation", "unused"],
        ["consumer", "unused"],
        ["UnusedShape", "unused"],
      ],
    });
    expect(classify()).toEqual(first);
    expect(queries).toBe(initialQueries);
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  } finally {
    nativeSpy.mockRestore();
    storedSpy.mockRestore();
  }
});

test.for(["source", "roots", "options", "other-source", "forgotten"] as const)("native binding usage refuses changed %s epochs", (change, { scratch }) => {
  initialize(scratch);
  const workspace = createSemanticWorkspace({ root: scratch });
  const program = fixtureValue(workspace.program("packages/kit/tsconfig.json"));
  const file = fixtureValue(program.sourceFile("packages/kit/src/base.ts"));
  const usage = workspace.bindingUsage(file);
  expect(usage.parents().size).toBeGreaterThan(0);
  const mutate = {
    source: () => file.replaceWithText(`/*shift*/${file.getFullText()}`),
    roots: () => program.project().createSourceFile(join(scratch, "packages/kit/src/additional.ts"), "export const additional = 1;"),
    options: () => program.project().compilerOptions.set({ strictNullChecks: false }),
    "other-source": () => fixtureValue(program.sourceFile("packages/kit/src/barrel.ts")).replaceWithText("export const replacement = 1;"),
    forgotten: () => file.forget(),
  };
  mutate[change]();
  expect(() => usage.parents()).toThrow("source/program epoch");
});

test("binding usage preserves each defining parent for merged, overloaded, class and local alias references", ({ scratch }) => {
  initialize(scratch);
  write(
    scratch,
    "packages/kit/src/defining-parents.ts",
    `
export interface Merged { first: string }
export interface Merged { second: number }
export function overloaded(value: string): string;
export function overloaded(value: number): number;
export function overloaded(value: string | number): string | number { return value; }
export class Kept { static clone(): Kept { return new Kept(); } }
export function recursive(): void { recursive(); }
function Inner(): void {}
export { Inner as Renamed };
export const useInner = Inner();
export function shadowOnly(): void {}
export function shadows(shadowOnly: () => void): void { shadowOnly(); }
`,
  );
  const workspace = createSemanticWorkspace({ root: scratch });
  using stored = nativeInventoryFixture({ root: scratch });
  const summarize = (corpus: SourceCorpus): object => {
    const live = buildLiveness(corpus);
    return {
      api: collectApiSurface(corpus, (path) => path.endsWith("/defining-parents.ts"), live).map(({ name, klass }) => [name, klass]),
      orphan: collectOrphanCandidates(corpus, live, (path) => path.endsWith("/defining-parents.ts")).map(({ name }) => name),
    };
  };
  expect(summarize(stored.sourceCorpus())).toEqual(summarize(workspace.sourceCorpus()));
  for (const corpus of [workspace.sourceCorpus(), stored.sourceCorpus()]) {
    const api = collectApiSurface(corpus, (path) => path.endsWith("/defining-parents.ts"));
    for (const name of ["Merged", "overloaded", "Kept", "recursive", "Renamed"]) {
      const classifications = api.filter((entry) => entry.name === name).map((entry) => entry.klass);
      expect(classifications.length, name).toBeGreaterThan(0);
      expect(
        classifications.every((klass) => klass === "internal"),
        name,
      ).toBe(true);
    }
    expect(api.find((entry) => entry.name === "shadowOnly")?.klass).toBe("unused");
  }
});

test("binding analyses reject foreign sources and release through their existing owners", ({ scratch }) => {
  initialize(scratch);
  const workspace = createSemanticWorkspace({ root: scratch });
  const native = fixtureValue(workspace.program("packages/kit/tsconfig.json"));
  const nativeFile = fixtureValue(native.sourceFile("packages/kit/src/base.ts"));
  const otherWorkspace = createSemanticWorkspace({ root: scratch });
  const foreignFile = fixtureValue(fixtureValue(otherWorkspace.program("packages/kit/tsconfig.json")).sourceFile("packages/kit/src/base.ts"));
  beginReferencePass();
  const usage = workspace.bindingUsage(nativeFile);
  try {
    expect(usage.parents().size).toBeGreaterThan(0);
    expect(() => usage.lexical(foreignFile.getVariableDeclarationOrThrow("alive"))).toThrow("foreign or stale");
    expect(() => workspace.bindingUsage(foreignFile)).toThrow("no admitted native owner");
    expect(otherWorkspace.bindingUsage(foreignFile)).not.toBe(usage);
  } finally {
    endReferencePass();
  }
  expect(() => usage.parents()).toThrow("disposed");
  expect(workspace.bindingUsage(nativeFile)).not.toBe(usage);
  using stored = nativeInventoryFixture({ root: scratch });
  const file = source(stored, "packages/kit/src/base.ts");
  const storedUsage = stored.bindingUsage(file);
  expect(storedUsage.parents().size).toBeGreaterThan(0);
  expect(sourceBindingUsage(file)).toBe(storedUsage);
  expect(() => storedUsage.lexical(nativeFile.getVariableDeclarationOrThrow("alive"))).toThrow("physical source/epoch");
  file.replaceWithText(`/*shift*/${file.getFullText()}`);
  expect(() => storedUsage.parents()).toThrow("physical source/epoch");
  stored[Symbol.dispose]();
  expect(() => storedUsage.parents()).toThrow("disposed");
});

test("stored dead evidence excludes only its exact defining name across contextual and default carriers", ({ scratch }) => {
  initialize(scratch);
  write(
    scratch,
    "packages/kit/src/documented.ts",
    `
/** See {@link unused}, {@linkcode value}, {@linkplain Shape}. */
export const introduction = 0;
export function unused(): void {}
export const value = 1;
export interface Shape { value: string }
/** See {@link called} and {@link recursive}. */
export function called(): void {}
export function recursive(): void { recursive(); }
export function consumer(): void { called(); }
`,
  );
  write(scratch, "packages/kit/src/documented-barrel.ts", "export { unused as renamedUnused } from './documented';\n");
  const native = createSemanticWorkspace({ root: scratch });
  using stored = nativeInventoryFixture({ root: scratch });
  const corpus = stored.sourceCorpus();
  const file = source(stored, "packages/kit/src/documented.ts");
  const live = buildLiveness(corpus);
  for (const name of ["unused", "value", "Shape", "called", "recursive"]) {
    const declaration = fixtureValue([...ownExports(file)].find((entry) => entry.name === name)).decl;
    const nameNode = fixtureValue(Node.hasName(declaration) ? declaration.getNameNode() : undefined);
    const references = semanticReferenceNodes(declaration);
    const definingReference = fixtureValue(
      references.find((node) => node.getSourceFile().getFilePath() === file.getFilePath() && node.getStart() === nameNode.getStart()),
    );
    expect(definingReference.getSourceFile()).not.toBe(declaration.getSourceFile());
    expect(definingReference.getSourceFile().getFullText()).toBe(declaration.getSourceFile().getFullText());
    expect([definingReference.getStart(), definingReference.getEnd(), definingReference.getKind()]).toEqual([
      nameNode.getStart(),
      nameNode.getEnd(),
      SyntaxKind.Identifier,
    ]);
    expect(declarationBindingKeys(definingReference, false)).toEqual(declarationBindingKeys(declaration, false));
    const physical = (nodes: readonly Node[]): object[] =>
      nodes.map((node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }));
    const nativeDeclaration = fixtureValue(
      declarationsNamed(native.sourceCorpus().getSourceFiles(), name).find((node) => node.getSourceFile().getFilePath() === file.getFilePath()),
    );
    expect(physical(references)).toEqual(physical(semanticReferenceNodes(nativeDeclaration)));
    expect(references.some(isDocumentationLinkReference), name).toBe(true);
    const used = name === "called" || name === "recursive";
    expect(deadEvidenceFor(corpus, declaration, name, live), name).toMatchObject({ prodCount: used ? 1 : 0, verdict: used ? "ALIVE" : "CANDIDATE" });
    const code = references.filter((node) => node.getParentIfKind(SyntaxKind.CallExpression)?.getExpression() === node);
    expect(code).toHaveLength(used ? 1 : 0);
    expect(deadEvidenceFor(corpus, declaration, name, live).prodRefs).toEqual(code.map((node) => `${file.getFilePath()}:${String(node.getStartLineNumber())}`));
  }
});

test("physical self-name identity refuses foreign, modified and closed captured snapshots", ({ scratch }) => {
  initialize(scratch);
  using stored = nativeInventoryFixture({ root: scratch });
  const workers: string[] = [];
  using foreign = nativeInventoryFixture({ root: scratch }, { workers });
  expect(workers).toEqual([]);
  const file = source(stored, "packages/kit/src/base.ts");
  const local = file.getVariableDeclarationOrThrow("unused").getNameNode();
  const contextual = fixtureValue([...ownExports(file)].find((entry) => entry.name === "unused")).decl;
  const contextualName = fixtureValue(Node.hasName(contextual) ? contextual.getNameNode() : undefined);
  const foreignName = source(foreign, "packages/kit/src/base.ts").getVariableDeclarationOrThrow("unused").getNameNode();
  expect(stored.generation).toBe(foreign.generation);
  expect(samePhysicalNode(local, contextualName)).toBe(true);
  expect(samePhysicalNode(local, foreignName)).toBe(false);
  expect(stored.sameNode(local, foreignName)).toBe(false);
  expect(samePhysicalNode(local, file.getVariableDeclarationOrThrow("alive").getNameNode())).toBe(false);
  expect(samePhysicalNode(local, contextual)).toBe(false);
  const native = new Project({ useInMemoryFileSystem: true }).createSourceFile(file.getFilePath(), file.getFullText());
  const changed = new Project({ useInMemoryFileSystem: true }).createSourceFile(file.getFilePath(), file.getFullText().replace("unused=4", "unused=9"));
  const nativeName = native.getVariableDeclarationOrThrow("unused").getNameNode();
  expect(samePhysicalNode(nativeName, nativeName)).toBe(true);
  expect(samePhysicalNode(nativeName, changed.getVariableDeclarationOrThrow("unused").getNameNode())).toBe(false);
  expect(samePhysicalNode(nativeName, local)).toBe(false);
  file.replaceWithText(file.getFullText().replace("unused=4", "unused=9"));
  const modified = file.getVariableDeclarationOrThrow("unused").getNameNode();
  expect([modified.getStart(), modified.getEnd(), modified.getKind()]).toEqual([contextualName.getStart(), contextualName.getEnd(), contextualName.getKind()]);
  expect(() => samePhysicalNode(modified, contextualName)).toThrow("physical source/epoch is not admitted");
  stored[Symbol.dispose]();
  expect(() => stored.sameNode(modified, contextualName)).toThrow("disposed");
});

test.for(["comparison", "live-origin", "empty-origin", "dead-evidence"] as const)(
  "captured references refuse shifted source before %s can establish absence",
  (operation, { scratch }) => {
    initialize(scratch);
    write(
      scratch,
      "packages/kit/src/shifted.ts",
      "export function unused(): void {} export function consumer(): void { unused(); } export function isolated(): void {}\n",
    );
    using stored = nativeInventoryFixture({ root: scratch });
    const corpus = stored.sourceCorpus();
    const file = source(stored, "packages/kit/src/shifted.ts");
    const contextual = fixtureValue([...ownExports(file)].find((entry) => entry.name === "unused")).decl;
    const contextualName = fixtureValue(Node.hasName(contextual) ? contextual.getNameNode() : undefined);
    const live = buildLiveness(corpus);
    expect(deadEvidenceFor(corpus, contextual, "unused", live)).toMatchObject({ verdict: "ALIVE", prodCount: 1 });
    expect(stored.references(file.getFunctionOrThrow("isolated"))).toEqual([]);
    file.replaceWithText(`/*shift*/${file.getFullText()}`);
    const changed = file.getFunctionOrThrow("unused");
    expect(changed.getNameNode()?.getStart()).not.toBe(contextualName.getStart());
    const attempts = {
      comparison: () => samePhysicalNode(changed.getNameNodeOrThrow(), contextualName),
      "live-origin": () => stored.references(changed),
      "empty-origin": () => stored.references(file.getFunctionOrThrow("isolated")),
      "dead-evidence": () => deadEvidenceFor(corpus, changed, "unused", live),
    };
    expect(attempts[operation]).toThrow("physical source/epoch is not admitted");
  },
);

test("partitions retain native options, closure, failed resolution and importing-world package targets", { tags: ["slow"] }, ({ scratch }) => {
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
  using stored = nativeInventoryFixture({ root: scratch });
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
  expect([...readInventorySourceMetadata(database, browser.id)].some((file) => file.file.endsWith("fixture-platform/browser.ts"))).toBe(true);
  expect(browser.nativeRoots.toSorted()).toEqual([join(scratch, "packages/client/src/browser.ts"), join(scratch, "packages/client/src/missing.ts")]);
  expect(
    new Set(
      partitions.flatMap((partition) =>
        [...readInventorySourceMetadata(database, partition.id)].filter((file) => file.authored).map((file) => file.consumerClass),
      ),
    ),
  ).toEqual(new Set(["product", "tooling", "test"]));
  expect([...readInventoryModules(database, browser.id)].find((module) => module.specifier === "./absent")?.target).toBeNull();
  expect([...readInventoryInputs(database, browser.id)].some((input) => input.path.endsWith("/absent.ts") && input.version === "false")).toBe(true);
  expect(latestInventoryGeneration(database)).toBe(stored.generation);
  for (const partition of partitions) {
    expect(pidAlive(fixtureValue(partition.workerPid))).toBe(false);
  }
});

test("changes, additions, removals, package resolution and failed lookups invalidate without mixing pinned generations", { tags: ["slow"] }, ({ scratch }) => {
  initialize(scratch);
  write(scratch, "packages/client/src/missing.ts", "import { absent } from './absent'; export const read=absent;\n");
  using previous = nativeInventoryFixture({ root: scratch });
  const old = source(previous, "packages/kit/src/base.ts").getFullText();
  write(scratch, "packages/kit/src/base.ts", old.replace("export const unused=4;", "export const replacement=4;"));
  write(scratch, "packages/client/src/absent.ts", "export const absent=7;\n");
  write(scratch, "node_modules/fixture-platform/browser.ts", "export const platform='changed';\n");
  rmSync(join(scratch, "tests/consumer.ts"));
  using current = nativeInventoryFixture({ root: scratch });
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
  const workers: string[] = [];
  using unchanged = nativeInventoryFixture({ root: scratch }, { workers });
  expect(workers).toEqual([]);
  expect(unchanged.generation).toBe(current.generation);
});

test("same-input competing writers recheck under the lock and build each native partition once", { timeout: scaledBudget(120_000) }, async ({ scratch }) => {
  initialize(scratch);
  const log = join(scratch, ".cache/builds.jsonl");
  const entry = fileURLToPath(new URL("../compiler/native-inventory-command-cases.ts", import.meta.url));
  const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
  const leftPath = join(scratch, ".cache/left.json");
  const rightPath = join(scratch, ".cache/right.json");
  const [left, right] = await Promise.all([
    spawnNiced(process.execPath, ["--import", bootstrap, entry, "writer", scratch, leftPath, log], { cwd: scratch }),
    spawnNiced(process.execPath, ["--import", bootstrap, entry, "writer", scratch, rightPath, log], { cwd: scratch }),
  ]);
  expect(left.code, left.stderr).toBe(0);
  expect(right.code, right.stderr).toBe(0);
  expect(JSON.parse(readFileSync(leftPath, "utf8"))).toEqual(JSON.parse(readFileSync(rightPath, "utf8")));
  const builds = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string);
  expect(builds.toSorted()).toEqual(["packages/client/tsconfig.json", "packages/kit/tsconfig.json", "tsconfig.tools.json"]);
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
  using stored = nativeInventoryFixture({ root: scratch });
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

  using stored = nativeInventoryFixture({ root: scratch });
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

for (const carrier of ["references", "exports"] as const) {
  test(`stored library ${carrier} materialize captured syntax and release on consumer failure`, ({ scratch }) => {
    write(scratch, ".gitignore", ".cache/\n");
    write(scratch, "tsconfig.json", JSON.stringify({ files: ["ambient.ts", "barrel.ts"], compilerOptions: { lib: ["ES2015.Collection", "DOM"], types: [] } }));
    write(scratch, "ambient.ts", "interface Map<K, V> { readonly marker: K }\n");
    write(scratch, "barrel.ts", "export type { Map }; export declare const value: Map<string, number>;\n");
    execFixtureGit(scratch, ["init", "-q"]);
    const native = createSemanticWorkspace({ root: scratch });
    const ambient = fixtureValue(native.sourceCorpus().getSourceFile("ambient.ts"));
    const physical = (nodes: readonly import("ts-morph").Node[]): object[] =>
      nodes.map((node) => ({
        file: node.getSourceFile().getFilePath(),
        start: node.getStart(),
        end: node.getEnd(),
        kind: node.getKind(),
        text: node.getText(),
      }));
    const capture = (nodes: readonly import("ts-morph").Node[]): { nodes: object[]; libraryPath: string; libraryText: string } => {
      const library = fixtureValue(nodes.find((node) => node.getSourceFile().getFilePath().startsWith("/node_modules/typescript/lib/"))).getSourceFile();
      return { nodes: physical(nodes), libraryPath: library.getFilePath(), libraryText: library.getFullText() };
    };
    const nativeExports = (): ReturnType<typeof capture> => {
      const program = fixtureValue(fixtureValue(native.program("tsconfig.json")).project().getLanguageService().compilerObject.getProgram());
      const wrappers = nativeCompilerSourceFiles(program);
      try {
        return capture(
          fixtureValue(
            fixtureValue(wrappers.find((file) => file.getFilePath() === join(scratch, "barrel.ts")))
              .getExportedDeclarations()
              .get("Map"),
          ),
        );
      } finally {
        for (const file of wrappers) {
          file.forget();
        }
      }
    };
    const expected = carrier === "references" ? capture(semanticReferenceNodes(ambient.getInterfaceOrThrow("Map").getNameNode())) : nativeExports();
    using stored = nativeInventoryFixture({ root: scratch });
    const close = vi.spyOn(DatabaseSync.prototype, "close");
    const program = vi.spyOn(Project.prototype, "getProgram").mockImplementation(() => {
      throw new Error("stored syntax hydrated a native Program");
    });
    let captured: import("ts-morph").SourceFile | undefined;
    try {
      expect(() => {
        using corpus = stored.sourceCorpus();
        const actual =
          carrier === "references"
            ? stored.references(fixtureValue(corpus.getSourceFile("ambient.ts")).getInterfaceOrThrow("Map").getNameNode())
            : fixtureValue(stored.exports(fixtureValue(corpus.getSourceFile("barrel.ts"))).get("Map"));
        expect(physical(actual)).toEqual(expected.nodes);
        captured = fixtureValue(actual.find((node) => node.getSourceFile().getFilePath() === expected.libraryPath)).getSourceFile();
        expect(captured.getFullText()).toBe(expected.libraryText);
        expect(() => stored.references(fixtureValue(actual.find((node) => node.getSourceFile() === captured)))).toThrow("unsupported for non-authored origin");
        throw new Error("consumer failed after stored library read");
      }).toThrow("consumer failed after stored library read");
      expect(close).toHaveBeenCalledTimes(1);
      expect(captured?.wasForgotten()).toBe(true);
      expect(() => stored.sourceCorpus().getSourceFile(expected.libraryPath)).toThrow("disposed");
      expect(program).not.toHaveBeenCalled();
    } finally {
      stored[Symbol.dispose]();
      program.mockRestore();
      close.mockRestore();
    }
  });
}
