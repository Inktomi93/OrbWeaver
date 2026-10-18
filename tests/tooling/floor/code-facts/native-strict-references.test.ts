// Exact importing-world use-site queries are distinct from declaration liveness unions.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { InventoryReferenceQuery, InventorySpan, SemanticInventoryOptions } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inputVersion } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { readInventoryReferenceQueries } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { readInventoryRuntime } from "../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { nativeTypeFactSession } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";

function nativeCase(mode: string, root: string): string {
  const entry = fileURLToPath(new URL("../compiler/native-reference-cases.ts", import.meta.url));
  const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
  const result = join(root, ".cache/native-reference-result.json");
  const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, mode, root, result]);
  expect(completed.status, completed.stderr).toBe(0);
  return readFileSync(result, "utf8");
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("strict reference fixture is missing");
  }
  return value;
}
function physical(nodes: readonly Node[]): readonly object[] {
  return nodes.map((node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }));
}
function fixture(root: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const compilerOptions = { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" };
  write(".gitignore", ".cache\n.deps\n");
  write("package.json", JSON.stringify({ type: "module", imports: { "#target": { browser: "./browser.ts", default: "./node.ts" } } }));
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: ["shared.ts", "node.ts", "node-use.ts"] }));
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, customConditions: ["browser"] }, files: ["shared.ts", "browser.ts", "browser-use.ts"] }),
  );
  write("node.ts", "export const item=1;");
  write("browser.ts", "export const item=2;");
  write("node-use.ts", "import {item} from './node'; export const fromNode=item;declare const nodeUse: Common;");
  write("browser-use.ts", "import {item} from './browser'; export const fromBrowser=item;declare const browserUse: Common;");
  write(
    "shared.ts",
    "declare global {interface Common {marker:number}}import {item as local} from '#target';import {external} from './.deps/external';export const use=local;export const outside=external;const isolated=0;",
  );
  write(".deps/external.d.ts", "export declare const external: number;");
  execFixtureGit(root, ["init", "-q"]);
}

test("exact native reference use-site queries retain separate importing worlds and dependency origins", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  fixture(scratch);
  const native = createSemanticWorkspace({ root: scratch });
  const expected = native.sourceViews("shared.ts").map(({ program, sourceFile }) => {
    const use = sourceFile.getVariableDeclarationOrThrow("use").getInitializerOrThrow().asKindOrThrow(SyntaxKind.Identifier);
    const dependency = required(program.project().getSourceFile(join(scratch, ".deps/external.d.ts")))
      .getVariableDeclarationOrThrow("external")
      .getNameNode()
      .asKindOrThrow(SyntaxKind.Identifier);
    const common = required(sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration).find((node) => node.getName() === "Common")).getNameNode();
    const isolated = sourceFile.getVariableDeclarationOrThrow("isolated").getNameNode();
    return {
      program: program.descriptor.id,
      root: { file: sourceFile.getFilePath(), start: sourceFile.getStart(), end: sourceFile.getEnd(), kind: sourceFile.getKind() },
      use: physical(use.findReferencesAsNodes()),
      common: physical(common.findReferencesAsNodes()),
      declaration: physical(common.getParentOrThrow().asKindOrThrow(SyntaxKind.InterfaceDeclaration).findReferencesAsNodes()),
      dependency: physical(dependency.findReferencesAsNodes()),
      queries: [use, common, dependency, isolated, common.getParentOrThrow()].map((node) => ({
        file: node.getSourceFile().getFilePath(),
        start: node.getStart(),
        end: node.getEnd(),
        kind: node.getKind(),
      })),
    };
  });
  expect(expected).toHaveLength(2);
  expect(expected[0]?.use.length).toBeGreaterThan(0);
  expect(expected[1]?.use.length).toBeGreaterThan(0);
  expect(expected[0]?.common).not.toEqual(expected[1]?.common);
  using inventory = nativeInventoryFixture({
    root: scratch,
    families: ["references"],
    referenceDemand: {
      mode: "closed",
      queries: expected.flatMap((world) => world.queries.map((node) => ({ program: world.program, root: world.root, node }))),
    },
  });
  const corpus = inventory.sourceCorpus();
  const source = required(corpus.getSourceFile("shared.ts"));
  const use = source.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
  const common = required(source.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration).find((node) => node.getName() === "Common")).getNameNode();
  const dependency = required(corpus.getSourceFile(".deps/external.d.ts")).getVariableDeclarationOrThrow("external").getNameNode();
  expect(() => inventory.references(common)).toThrow("requires complete reference coverage");
  for (const world of expected) {
    expect.soft(physical(inventory.references(use, world.program, source))).toEqual(world.use);
    expect.soft(physical(inventory.references(common, world.program, source))).toEqual(world.common);
    expect.soft(physical(inventory.references(dependency, world.program, source))).toEqual(world.dependency);
    expect(physical(inventory.references(common.getParentOrThrow(), world.program, source))).toEqual(world.declaration);
    expect(inventory.references(source.getVariableDeclarationOrThrow("isolated").getNameNode(), world.program, source)).toEqual([]);
  }
});

function oneWorld(root: string): SemanticInventoryOptions & Required<Pick<SemanticInventoryOptions, "referenceDemand" | "programs">> {
  fixture(root);
  const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
  const source = project.createSourceFile(join(root, "shared.ts"), readFileSync(join(root, "shared.ts"), "utf8"));
  const use = source.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
  const isolated = source.getVariableDeclarationOrThrow("isolated").getNameNode();
  const span = (node: Node): InventorySpan => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() });
  const native = createSemanticWorkspace({ root });
  const programs = [required(native.program("tsconfig.json")).descriptor];
  const options = {
    root,
    programs,
    families: ["references"] as const,
    referenceDemand: { mode: "closed" as const, queries: [use, isolated].map((node) => ({ program: "tsconfig.json", root: span(source), node: span(node) })) },
  };
  return options;
}

test("strict references reject unrequested, wrong-root, stale, foreign and disposed queries without a syntax Program", { timeout: scaledBudget(60_000) }, ({
  scratch,
}) => {
  const options = oneWorld(scratch);
  using inventory = nativeInventoryFixture(options);
  const source = required(inventory.sourceCorpus().getSourceFile("shared.ts"));
  const use = source.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
  const isolated = source.getVariableDeclarationOrThrow("isolated").getNameNode();
  const otherRoot = required(inventory.sourceCorpus().getSourceFile("node-use.ts"));
  const program = vi.spyOn(Project.prototype, "getProgram").mockImplementation(() => {
    throw new Error("syntax reference replay opened a Program");
  });
  try {
    expect(inventory.references(use, "tsconfig.json", source)).toHaveLength(2);
    expect(inventory.references(isolated, "tsconfig.json", source)).toEqual([]);
    expect(() => inventory.references(use, "foreign", source)).toThrow("partition is unavailable");
    expect(() => inventory.references(use, "tsconfig.json", otherRoot)).toThrow("coverage is unavailable");
    expect(() => inventory.references(source.getVariableDeclarationOrThrow("outside").getInitializerOrThrow(), "tsconfig.json", source)).toThrow(
      "coverage is unavailable",
    );
    expect(() => inventory.references(use, "tsconfig.json")).toThrow("requires its registered importing root");
    otherRoot.replaceWithText("export const changed=0;");
    expect(() => inventory.references(use, "tsconfig.json", otherRoot)).toThrow("not admitted");
    source.replaceWithText(source.getFullText().replace("const isolated=0", "const isolated=1"));
    expect(() => inventory.references(source.getVariableDeclarationOrThrow("isolated").getNameNode(), "tsconfig.json", source)).toThrow("not admitted");
    inventory[Symbol.dispose]();
    expect(() => inventory.references(use, "tsconfig.json", source)).toThrow("disposed");
  } finally {
    program.mockRestore();
  }
});

test("strict reference SQL rejects missing, truncated, orphaned and foreign closure records, including zero answers", { timeout: scaledBudget(60_000) }, ({
  scratch,
}) => {
  const options = oneWorld(scratch);
  {
    using captured = nativeInventoryFixture(options);
    expect(captured.generation).toBeGreaterThan(0);
  }
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const generation = latestInventoryGeneration(db);
  const partitions = readInventoryGeneration(db, generation);
  const partition = required(partitions[0]);
  const query = required([...readInventoryReferenceQueries(db, partition.id)][0]);
  const read = (): readonly InventoryReferenceQuery[] => [...readInventoryReferenceQueries(db, partition.id)];
  for (const sql of [
    "UPDATE inventory_reference_query SET resultCount=resultCount+1 WHERE ordinal=0",
    "DELETE FROM inventory_reference_query_node WHERE owner=0 AND ordinal=0",
    "UPDATE inventory_reference_query SET ordinal=3 WHERE ordinal=1",
    "DELETE FROM inventory_source WHERE file=(SELECT s.file FROM inventory_reference_query q JOIN inventory_span s ON s.partition=q.partition AND s.ordinal=q.node WHERE q.ordinal=0)",
    "DELETE FROM inventory_list WHERE kind='available'",
    "INSERT INTO inventory_reference_query_node SELECT partition,99,0,node,consumerClass FROM inventory_reference_query_node LIMIT 1",
  ]) {
    db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
    try {
      db.exec(sql);
      expect(read).toThrow();
    } finally {
      db.exec("ROLLBACK");
    }
  }
  db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
  try {
    db.exec("DELETE FROM inventory_reference_query WHERE ordinal=1");
    using reader = inventoryReader(scratch, generation, partitions, {
      db,
      dispose: () => {
        // The test retains the borrowed connection through rollback.
      },
    });
    const source = required(reader.sourceCorpus().getSourceFile("shared.ts"));
    expect(() => reader.references(source.getVariableDeclarationOrThrow("isolated").getNameNode(), "tsconfig.json", source)).toThrow("coverage is unavailable");
  } finally {
    db.exec("ROLLBACK");
  }
  expect(read()[0]).toEqual(query);
});

test("closed demand reuse, order, default completeness and failed publication preserve pinned generations", { timeout: scaledBudget(120_000) }, ({
  scratch,
}) => {
  const options = oneWorld(scratch);
  using first = nativeInventoryFixture(options);
  const source = required(first.sourceCorpus().getSourceFile("shared.ts"));
  const use = source.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
  const before = physical(first.references(use, "tsconfig.json", source));
  const workers: string[] = [];
  using reused = nativeInventoryFixture(options, { workers });
  expect(workers).toEqual([]);
  expect(reused.generation).toBe(first.generation);
  expect(() =>
    nativeInventoryFixture(
      {
        ...options,
        referenceDemand: { ...options.referenceDemand, queries: [...options.referenceDemand.queries].reverse() },
      },
      { failWorker: true },
    ),
  ).toThrow("injected native worker exit");
  expect(() =>
    nativeInventoryFixture(
      {
        ...options,
        referenceDemand: { ...options.referenceDemand, queries: [] },
      },
      { failWorker: true },
    ),
  ).toThrow("injected native worker exit");
  expect(physical(first.references(use, "tsconfig.json", source))).toEqual(before);
  using complete = nativeInventoryFixture({ root: scratch, programs: options.programs, families: ["references"] });
  const own = required(complete.sourceCorpus().getSourceFile("shared.ts"));
  expect(complete.references(own.getVariableDeclarationOrThrow("isolated"))).toEqual([]);
  const completeCommon = required(own.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration).find((node) => node.getName() === "Common")).getNameNode();
  expect(complete.references(completeCommon).map((node) => node.getSourceFile().getBaseName())).toEqual(["node-use.ts", "shared.ts"]);
  expect(() => complete.references(own.getVariableDeclarationOrThrow("use").getInitializerOrThrow(), "tsconfig.json", own)).toThrow("coverage is unavailable");
  expect(physical(first.references(use, "tsconfig.json", source))).toEqual(before);
});

test("reference session admits the exact importer-query pair only before one seal", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/root.ts", "const held=1; held;");
  const other = project.createSourceFile("/other.ts", "const held=2; held;");
  const query = required(source.getDescendantsOfKind(SyntaxKind.Identifier)[1]);
  const absent = required(other.getDescendantsOfKind(SyntaxKind.Identifier)[1]);
  const acquire = vi.fn(() => {
    throw new Error("admitted exact pair acquired");
  });
  using session = nativeTypeFactSession(acquire);
  session.request("owner", { kind: "references", nodes: [query], importer: source });
  expect(() => session.references("owner", [query], source)).toThrow("sealed before reading");
  session.seal(new Set(["owner"]));
  expect(() => session.references("owner", [query], other)).toThrow("importer was not registered");
  expect(() => session.references("owner", [absent], source)).toThrow("not registered");
  expect(acquire).not.toHaveBeenCalled();
  expect(() => session.references("owner", [query], source)).toThrow("admitted exact pair acquired");
  expect(() => session.request("owner", { kind: "references", nodes: [absent], importer: other })).toThrow("registration is sealed");
  session[Symbol.dispose]();
  expect(() => session.references("owner", [query], source)).toThrow("disposed");
});

test("a malformed exited-worker answer never publishes and transaction bytes retain their own exact query cohort", ({ scratch }) => {
  const options = oneWorld(scratch);
  using before = nativeInventoryFixture(options);
  const source = required(before.sourceCorpus().getSourceFile("shared.ts"));
  const use = source.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
  const original = physical(before.references(use, "tsconfig.json", source));
  expect(() =>
    nativeInventoryFixture(
      {
        ...options,
        referenceDemand: { ...options.referenceDemand, queries: [...options.referenceDemand.queries].reverse() },
      },
      { fault: "reference-coverage" },
    ),
  ).toThrow("reference result coverage is incomplete");
  {
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(db)).toBe(before.generation);
  }
  const text = `${source.getFullText()}\nexport const extra=local;`;
  const root = { file: source.getFilePath(), start: source.getStart(), end: text.length, kind: source.getKind() };
  using overlay = nativeInventoryFixture(
    {
      ...options,
      referenceDemand: { ...options.referenceDemand, queries: options.referenceDemand.queries.map((query) => ({ ...query, root })) },
    },
    { projection: { root: scratch, files: [{ path: source.getFilePath(), text }], deleted: [] } },
  );
  const current = required(overlay.sourceCorpus().getSourceFile("shared.ts"));
  const currentUse = current.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
  expect(overlay.references(currentUse, "tsconfig.json", current)).toHaveLength(3);
  expect(() => overlay.references(use, "tsconfig.json", source)).toThrow("not admitted");
  expect(physical(before.references(use, "tsconfig.json", source))).toEqual(original);
});

test("production request capability admits dependency evidence only under its nominated population root", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  fixture(scratch);
  const entry = "packages/server/src/importer.ts";
  mkdirSync(dirname(join(scratch, entry)), { recursive: true });
  writeFileSync(join(scratch, entry), "import {external} from '../../../.deps/external'; export const used=external;");
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" },
      files: ["shared.ts", "node.ts", "node-use.ts", entry],
    }),
  );
  expect(JSON.parse(nativeCase("capability", scratch))).toMatchObject({
    errors: [],
    files: ["importer.ts", "importer.ts", "shared.ts", "shared.ts"],
    refused: [{ phase: "visit", message: expect.stringContaining("outside the effective population") }],
  });
});

test(
  "reference importer registration retains a nonprimary native world and distinguishes neutral, changed, forgotten and foreign owners",
  ({ scratch }) => {
    fixture(scratch);
    const path = "packages/server/src/shared.ts";
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), "declare global {interface Cross {marker:number}}export const marker=1;");
    writeFileSync(join(scratch, "packages/server/src/node-use.ts"), "export declare const nodeRead: Cross;");
    writeFileSync(join(scratch, "browser-use.ts"), "export declare const browserRead: Cross;");
    const compilerOptions = { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" };
    writeFileSync(join(scratch, "packages/server/tsconfig.json"), JSON.stringify({ compilerOptions, files: ["src/shared.ts", "src/node-use.ts"] }));
    writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ compilerOptions, files: ["shared.ts", "node.ts", "node-use.ts", path] }));
    writeFileSync(
      join(scratch, "tsconfig.tests-dom.json"),
      JSON.stringify({ compilerOptions: { ...compilerOptions, customConditions: ["browser"] }, files: [path, "browser-use.ts"] }),
    );
    fixture(join(scratch, ".cache/foreign"));
    expect(JSON.parse(nativeCase("owners", scratch))).toMatchObject({
      views: 3,
      registered: Array.from({ length: 3 }, () => ({ registered: true, same: true })),
      different: true,
      neutralWorkspace: true,
      neutralRegistered: false,
      neutralSame: true,
      changed: expect.stringContaining("changed compiler meaning"),
      forgotten: expect.stringContaining("forgotten"),
      alteredError: expect.stringContaining("foreign or changed compiler meaning"),
      foreignError: expect.stringContaining("foreign or changed compiler meaning"),
    });
  },
  scaledBudget(60_000),
);

test("unrelated family reuse retains closed reference metadata without advertising a complete union", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const options = oneWorld(scratch);
  using combined = nativeInventoryFixture({ ...options, families: ["modules", "references"] });
  const workers: string[] = [];
  using modules = nativeInventoryFixture({ root: scratch, programs: options.programs, families: ["modules"] }, { workers });
  expect(workers).toEqual([]);
  expect(modules.generation).toBe(combined.generation);
  const source = required(modules.sourceCorpus().getSourceFile("shared.ts"));
  expect(modules.moduleTarget(required(source.getImportDeclarations()[0]), "tsconfig.json")?.getBaseName()).toBe("node.ts");
  expect(() => modules.references(source.getVariableDeclarationOrThrow("use"))).toThrow("requires complete reference coverage");
});

test.for(["complete", "closed"] as const)(
  "mixed shape/reference demand ignores membership-only %s references on a warm store",
  { timeout: scaledBudget(120_000) },
  (mode, { scratch }) => {
    oneWorld(scratch);
    expect(JSON.parse(nativeCase(`shape-${mode}`, scratch))).toMatchObject({
      expectedCount: 2,
      retainedProgram: "tsconfig.tests-dom.json",
      retainedMode: mode,
      retainedQueries: mode === "complete" ? 0 : 2,
      workers: ["tsconfig.json", "tsconfig.json"],
      warmSame: true,
      isolated: [],
      completeRefusal: expect.stringContaining("requires complete reference coverage"),
      retainedSame: true,
      pinnedSame: true,
    });
  },
);

test("persisted reference consumer classes track their executable helper input without changing pinned answers", { timeout: scaledBudget(60_000) }, ({
  scratch,
}) => {
  const options = oneWorld(scratch);
  using inventory = nativeInventoryFixture(options);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partition = required(readInventoryGeneration(db, inventory.generation)[0]);
  const runtime = readInventoryRuntime(db, partition.id, "worker");
  const path = fileURLToPath(new URL("../../../../tooling/src/floor/code-facts/inventory-consumers.ts", import.meta.url));
  expect(runtime.sources.some((input) => input.path === path && input.version === inputVersion(path, "file"))).toBe(true);
  const source = required(inventory.sourceCorpus().getSourceFile("shared.ts"));
  expect(inventory.references(source.getVariableDeclarationOrThrow("use").getInitializerOrThrow(), "tsconfig.json", source)).toHaveLength(2);
});
