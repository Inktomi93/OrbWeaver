// Exact importing-world use-site queries are distinct from declaration liveness unions.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createSemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory";
import { createSemanticWorkspace, hasRegisteredSemanticProgram, semanticWorkspaceOf } from "@orb/tooling/floor/compiler/ts-workspace";
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
import { inputsCurrent, inventoryAuthoredFiles } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { readInventoryInputs, readInventoryReferenceQueries } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, nativeTypeFactSession, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";

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

test("exact native reference use-site queries retain separate importing worlds and dependency origins", ({ scratch }) => {
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
  using inventory = createSemanticInventory({
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

test("strict references reject unrequested, wrong-root, stale, foreign and disposed queries without a syntax Program", ({ scratch }) => {
  const options = oneWorld(scratch);
  using inventory = createSemanticInventory(options);
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

test("strict reference SQL rejects missing, truncated, orphaned and foreign closure records, including zero answers", ({ scratch }) => {
  const options = oneWorld(scratch);
  {
    using captured = createSemanticInventory(options);
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

test("closed demand reuse, order, default completeness and failed publication preserve pinned generations", ({ scratch }) => {
  const options = oneWorld(scratch);
  using first = createSemanticInventory(options);
  const source = required(first.sourceCorpus().getSourceFile("shared.ts"));
  const use = source.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
  const before = physical(first.references(use, "tsconfig.json", source));
  using reused = createSemanticInventory({
    ...options,
    buildPartition: () => {
      throw new Error("unchanged references rebuilt");
    },
  });
  expect(reused.generation).toBe(first.generation);
  expect(() =>
    createSemanticInventory({
      ...options,
      referenceDemand: { ...options.referenceDemand, queries: [...options.referenceDemand.queries].reverse() },
      buildPartition: () => {
        throw new Error("changed ordered reference demand rebuilt");
      },
    }),
  ).toThrow("changed ordered reference demand rebuilt");
  expect(() =>
    createSemanticInventory({
      ...options,
      referenceDemand: { ...options.referenceDemand, queries: [] },
      buildPartition: () => {
        throw new Error("empty reference demand rebuilt");
      },
    }),
  ).toThrow("empty reference demand rebuilt");
  expect(physical(first.references(use, "tsconfig.json", source))).toEqual(before);
  using complete = createSemanticInventory({ root: scratch, programs: options.programs, families: ["references"] });
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
  using before = createSemanticInventory(options);
  const source = required(before.sourceCorpus().getSourceFile("shared.ts"));
  const use = source.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
  const original = physical(before.references(use, "tsconfig.json", source));
  expect(() =>
    createSemanticInventory({
      ...options,
      referenceDemand: { ...options.referenceDemand, queries: [...options.referenceDemand.queries].reverse() },
      buildPartition: (request) => {
        runInventoryPartitionWorker(request);
        using stage = openInventoryDatabase(request.destination);
        stage.exec("UPDATE inventory_reference_query SET resultCount=resultCount+1 WHERE ordinal=0");
      },
    }),
  ).toThrow("reference result coverage is incomplete");
  {
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(db)).toBe(before.generation);
  }
  const text = `${source.getFullText()}\nexport const extra=local;`;
  const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
    root: scratch,
    files: [{ path: source.getFilePath(), text }],
    deleted: [],
  });
  const root = { file: source.getFilePath(), start: source.getStart(), end: text.length, kind: source.getKind() };
  using overlay = createSemanticInventory({
    ...options,
    referenceDemand: { ...options.referenceDemand, queries: options.referenceDemand.queries.map((query) => ({ ...query, root })) },
    fileSystem,
    overlay: { addedPaths: [], deletedPaths: [] },
  });
  const current = required(overlay.sourceCorpus().getSourceFile("shared.ts"));
  const currentUse = current.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
  expect(overlay.references(currentUse, "tsconfig.json", current)).toHaveLength(3);
  expect(() => overlay.references(use, "tsconfig.json", source)).toThrow("not admitted");
  expect(physical(before.references(use, "tsconfig.json", source))).toEqual(original);
});

test("production request capability admits dependency evidence only under its nominated population root", ({ scratch }) => {
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
  const context = projectCtx(scratch);
  const dependency = context.project.addSourceFileAtPath(join(scratch, ".deps/external.d.ts")).getVariableDeclarationOrThrow("external").getNameNode();
  const source = context.project.getSourceFileOrThrow(join(scratch, entry));
  let observed: readonly Node[] = [];
  const policy = defineGate({
    id: "native-reference-probe",
    family: "native-reference-probe",
    authority: "hard",
    severity: "error",
    population: "@server",
    analysis: "types",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "reference capability probe",
    create: (ctx) => ({
      prepare: () => {
        required(ctx.nativeTypes).request({ kind: "references", nodes: [dependency], importer: source });
      },
      evaluate: () => {
        observed = required(required(ctx.nativeTypes).references([dependency], source).get(dependency));
      },
    }),
    mustFlag: [
      { mode: "types", files: { [entry]: "export const unused=1;" }, why: "the production capability control below owns the result, not a detector proof" },
    ],
    mustPass: [
      { mode: "types", files: { [entry]: "export const unused=1;" }, why: "the production capability control below owns the result, not a detector proof" },
    ],
  });
  const result = runPolicyPass({
    root: scratch,
    project: context.project,
    ...nativeTypeFactOptions(context),
    knownPolicies: [policy],
    policies: [policy],
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(observed.map((node) => node.getSourceFile().getBaseName()).toSorted()).toEqual(["importer.ts", "importer.ts", "shared.ts", "shared.ts"]);
  const outside = defineGate({
    ...policy,
    id: "native-reference-foreign-root",
    family: "native-reference-foreign-root",
    create: (ctx) => ({
      prepare: () => {
        required(ctx.nativeTypes).request({ kind: "references", nodes: [dependency], importer: dependency.getSourceFile() });
      },
      evaluate: () => undefined,
    }),
  });
  const refused = runPolicyPass({
    root: scratch,
    project: context.project,
    ...nativeTypeFactOptions(context),
    knownPolicies: [outside],
    policies: [outside],
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(refused.toolErrors).toMatchObject([{ phase: "visit", message: expect.stringContaining("outside the effective population") }]);
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
    const workspace = createSemanticWorkspace({ root: scratch });
    const views = workspace.sourceViews(path);
    expect(views).toHaveLength(3);
    const context = projectCtx(scratch);
    using session = required(context.nativeTypeFacts)();
    const cases = views.map((view) => {
      const query = required(view.sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)[0]).getNameNode();
      session.request("native", { kind: "references", nodes: [query], importer: view.sourceFile });
      return { view, query, expected: physical(query.findReferencesAsNodes()) };
    });
    session.seal(new Set(["native"]));
    for (const { view, query, expected } of cases) {
      expect(hasRegisteredSemanticProgram(view.sourceFile.getProject())).toBe(true);
      expect(physical(required(session.references("native", [query], view.sourceFile).get(query)))).toEqual(expected);
    }
    const server = required(cases.find((value) => value.view.program.descriptor.id === "packages/server/tsconfig.json"));
    const browser = required(cases.find((value) => value.view.program.descriptor.id === "tsconfig.tests-dom.json"));
    expect(server.expected).not.toEqual(browser.expected);
    const neutralWorkspace = createSemanticWorkspace({
      root: scratch,
      programs: workspace.programs.filter((program) => program.descriptor.id !== "packages/server/tsconfig.json").map((program) => program.descriptor),
    });
    const neutral = required(neutralWorkspace.sourceCorpus().getSourceFile(path));
    expect(semanticWorkspaceOf(neutral.getProject())).toBe(neutralWorkspace);
    expect(hasRegisteredSemanticProgram(neutral.getProject())).toBe(false);
    const neutralQuery = required(neutral.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)[0]).getNameNode();
    using neutralSession = required(context.nativeTypeFacts)();
    neutralSession.request("neutral", { kind: "references", nodes: [neutralQuery], importer: neutral });
    neutralSession.seal(new Set(["neutral"]));
    expect(physical(required(neutralSession.references("neutral", [neutralQuery], neutral).get(neutralQuery)))).toEqual(server.expected);
    server.view.sourceFile.getProject().compilerOptions.set({ strict: true });
    expect(() => session.references("native", [server.query], server.view.sourceFile)).toThrow("changed compiler meaning");
    browser.view.sourceFile.forget();
    expect(() => session.references("native", [browser.query], browser.view.sourceFile)).toThrow("forgotten");
    const alteredDescriptor = {
      ...server.view.program.descriptor,
      commandLine: { ...server.view.program.descriptor.commandLine, options: { ...server.view.program.descriptor.commandLine.options, strict: true } },
    };
    const altered = required(
      required(createSemanticWorkspace({ root: scratch, programs: [alteredDescriptor] }).program(alteredDescriptor.id)).sourceFile(path),
    );
    const alteredQuery = required(altered.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)[0]).getNameNode();
    using alteredSession = required(context.nativeTypeFacts)();
    alteredSession.request("altered", { kind: "references", nodes: [alteredQuery], importer: altered });
    alteredSession.seal(new Set(["altered"]));
    expect(() => alteredSession.references("altered", [alteredQuery], altered)).toThrow("foreign or changed compiler meaning");
    const foreignRoot = join(scratch, "foreign");
    fixture(foreignRoot);
    const foreign = required(required(createSemanticWorkspace({ root: foreignRoot }).program("tsconfig.json")).sourceFile("shared.ts"));
    const foreignQuery = foreign.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
    using foreignSession = required(context.nativeTypeFacts)();
    foreignSession.request("foreign", { kind: "references", nodes: [foreignQuery], importer: foreign });
    foreignSession.seal(new Set(["foreign"]));
    expect(() => foreignSession.references("foreign", [foreignQuery], foreign)).toThrow("foreign or changed compiler meaning");
  },
  scaledBudget(60_000),
);

test("unrelated family reuse retains closed reference metadata without advertising a complete union", ({ scratch }) => {
  const options = oneWorld(scratch);
  using combined = createSemanticInventory({ ...options, families: ["modules", "references"] });
  using modules = createSemanticInventory({
    root: scratch,
    programs: options.programs,
    families: ["modules"],
    buildPartition: () => {
      throw new Error("unchanged module facts rebuilt");
    },
  });
  expect(modules.generation).toBe(combined.generation);
  const source = required(modules.sourceCorpus().getSourceFile("shared.ts"));
  expect(modules.moduleTarget(required(source.getImportDeclarations()[0]), "tsconfig.json")?.getBaseName()).toBe("node.ts");
  expect(() => modules.references(source.getVariableDeclarationOrThrow("use"))).toThrow("requires complete reference coverage");
});

test.for(["complete", "closed"] as const)(
  "mixed shape/reference demand ignores membership-only %s references on a warm store",
  { timeout: scaledBudget(30_000) },
  (mode, { scratch }) => {
    const options = oneWorld(scratch);
    const workspace = createSemanticWorkspace({ root: scratch });
    const selected = required(workspace.program("tsconfig.json"));
    const other = required(workspace.program("tsconfig.tests-dom.json"));
    const source = required(selected.sourceFile("shared.ts"));
    const shapePlan = { sources: [source], owners: new Map([[source, selected.descriptor]]), prepare: () => [] };
    const coldPath = join(scratch, ".cache/cold.sqlite");
    using cold = createSemanticInventory({ ...options, databasePath: coldPath, shapePlan });
    const coldSource = required(cold.sourceCorpus().getSourceFile("shared.ts"));
    const expected = physical(cold.references(coldSource.getVariableDeclarationOrThrow("use").getInitializerOrThrow(), "tsconfig.json", coldSource));
    expect(expected).toHaveLength(2);
    const databasePath = join(scratch, ".cache/semantic-inventory.sqlite");
    using prior = createSemanticInventory({
      root: scratch,
      programs: [other.descriptor],
      families: ["references"],
      referenceDemand: {
        mode,
        queries: mode === "complete" ? [] : options.referenceDemand.queries.map((query) => ({ ...query, program: other.descriptor.id })),
      },
    });
    using db = openInventoryDatabase(databasePath);
    const retained = required(readInventoryGeneration(db, prior.generation)[0]);
    expect(retained.program).toBe(other.descriptor.id);
    expect(retained.referenceMode).toBe(mode);
    expect([...readInventoryReferenceQueries(db, retained.id)]).toHaveLength(mode === "complete" ? 0 : 2);
    using warm = createSemanticInventory({
      ...options,
      shapePlan,
      buildPartition: (request) => {
        expect(request.descriptor.id).toBe(selected.descriptor.id);
        runInventoryPartitionWorker(request);
      },
    });
    const warmSource = required(warm.sourceCorpus().getSourceFile("shared.ts"));
    expect(physical(warm.references(warmSource.getVariableDeclarationOrThrow("use").getInitializerOrThrow(), "tsconfig.json", warmSource))).toEqual(expected);
    expect(warm.references(warmSource.getVariableDeclarationOrThrow("isolated").getNameNode(), "tsconfig.json", warmSource)).toEqual([]);
    expect(() => warm.references(warmSource.getVariableDeclarationOrThrow("use"))).toThrow("requires complete reference coverage");
    expect(required(readInventoryGeneration(db, warm.generation).find((partition) => partition.program === other.descriptor.id)).id).toBe(retained.id);
    const priorSource = required(prior.sourceCorpus().getSourceFile("shared.ts"));
    const pinned =
      mode === "closed"
        ? prior.references(priorSource.getVariableDeclarationOrThrow("use").getInitializerOrThrow(), other.descriptor.id, priorSource)
        : prior.references(priorSource.getVariableDeclarationOrThrow("isolated"));
    expect(physical(pinned)).toEqual(mode === "closed" ? expected : []);
  },
);

test("persisted reference consumer classes track their executable helper input without changing pinned answers", ({ scratch }) => {
  const options = oneWorld(scratch);
  using inventory = createSemanticInventory(options);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partition = required(readInventoryGeneration(db, inventory.generation)[0]);
  const inputs = [...readInventoryInputs(db, partition.id)];
  const path = fileURLToPath(new URL("../../../../tooling/src/floor/code-facts/inventory-consumers.ts", import.meta.url));
  expect(inputs.some((input) => input.kind === "file" && input.path === path)).toBe(true);
  const authored = inventoryAuthoredFiles(scratch);
  expect(inputsCurrent(inputs, { authored })).toBe(true);
  const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
    root: scratch,
    files: [{ path, text: `${readFileSync(path, "utf8")}\n` }],
    deleted: [],
  });
  expect(inputsCurrent(inputs, { authored, fileSystem })).toBe(false);
  const source = required(inventory.sourceCorpus().getSourceFile("shared.ts"));
  expect(inventory.references(source.getVariableDeclarationOrThrow("use").getInitializerOrThrow(), "tsconfig.json", source)).toHaveLength(2);
});
