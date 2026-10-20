import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { vi } from "vitest";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { openInventoryDatabase, readInventoryGeneration } from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { nativeTypeFactSession } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";
import { copyNativeInventoryImplementation } from "../compiler/native-inventory-tree.ts";

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("module fixture value is missing");
  }
  return value;
}

function fixture(root: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const compilerOptions = { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" };
  write(".gitignore", ".cache\n");
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: ["shared.ts", "node.ts", "browser.ts"] }));
  write("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...compilerOptions, customConditions: ["browser"] }, files: ["shared.ts"] }));
  write("package.json", JSON.stringify({ type: "module", imports: { "#target": { browser: "./browser.ts", default: "./node.ts" } } }));
  write("node.ts", "export interface Kind {readonly node:true}\nexport const marker=1;\n");
  write("browser.ts", "export interface Kind {readonly browser:true}\nexport const marker=2;\n");
  write(
    "shared.ts",
    'import "#target";\nimport type {Kind} from "#target";\nexport type {Kind as Public} from "#target";\nimport "./missing.ts";\nconst own=1; export {own};\n',
  );
  execFixtureGit(root, ["init", "-q"]);
}

test("explicit native module targets retain importing-world meaning, side effects, type-only doors and explicit absence", { timeout: scaledBudget(60_000) }, ({
  scratch,
}) => {
  fixture(scratch);
  const native = createSemanticWorkspace({ root: scratch });
  const expected = native.sourceViews("shared.ts").map(({ program, sourceFile }) => ({
    id: program.descriptor.id,
    targets: [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations().filter((declaration) => declaration.getModuleSpecifier() !== undefined),
    ].map((declaration) => declaration.getModuleSpecifierSourceFile()?.getFilePath()),
  }));
  expect(expected.map(({ targets }) => targets[0]).toSorted((left, right) => String(left).localeCompare(String(right)))).toEqual([
    join(scratch, "browser.ts"),
    join(scratch, "node.ts"),
  ]);
  using inventory = nativeInventoryFixture({ root: scratch, families: ["modules"] });
  const source = inventory.sourceCorpus().getSourceFile("shared.ts");
  if (source === undefined) {
    throw new Error("shared module fixture is missing");
  }
  const doors = [...source.getImportDeclarations(), ...source.getExportDeclarations().filter((declaration) => declaration.getModuleSpecifier() !== undefined)];
  for (const { id, targets } of expected) {
    expect(doors.map((door) => inventory.moduleTarget(door, id)?.getFilePath())).toEqual(targets);
  }
  expect(() => inventory.moduleTarget(required(source.getExportDeclarations().at(-1)), "tsconfig.json")).toThrow("authored import or export door");
  expect(() => inventory.moduleTarget(source.getVariableDeclarationOrThrow("own"), "tsconfig.json")).toThrow("authored import or export door");
  expect(() => inventory.moduleTarget(required(doors[0]), "foreign-program")).toThrow("partition is unavailable");
});

test("explicit module targets refuse stale query and target bytes, foreign roots and disposed snapshots", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  fixture(scratch);
  using inventory = nativeInventoryFixture({ root: scratch, families: ["modules"] });
  using corpus = inventory.sourceCorpus();
  const source = corpus.getSourceFile("shared.ts");
  const target = corpus.getSourceFile("node.ts");
  if (source === undefined || target === undefined) {
    throw new Error("module lifetime fixture is missing");
  }
  const door = source.getImportDeclarations()[0];
  if (door === undefined) {
    throw new Error("module fixture door is missing");
  }
  expect(inventory.moduleTarget(door, "tsconfig.json")?.getBaseName()).toBe("node.ts");
  target.replaceWithText("export const replacement=1;");
  expect(() => inventory.moduleTarget(door, "tsconfig.json")).toThrow("replay source/epoch is stale");
  const foreign = new Project({ useInMemoryFileSystem: true }).createSourceFile("/foreign.ts", 'import "#target";');
  expect(() => inventory.moduleTarget(required(foreign.getImportDeclarations()[0]), "tsconfig.json")).toThrow("not admitted");
  source.replaceWithText('import "./other.ts";');
  expect(() => inventory.moduleTarget(required(source.getImportDeclarations()[0]), "tsconfig.json")).toThrow("not admitted");
  inventory[Symbol.dispose]();
  expect(() => inventory.moduleTarget(required(foreign.getImportDeclarations()[0]), "tsconfig.json")).toThrow("disposed");
});

test("module-target requests preserve owner registration, seal and disposal boundaries", () => {
  const source = new Project({ useInMemoryFileSystem: true }).createSourceFile("/request.ts", 'import "./target.ts"; const own=1; export {own};');
  const door = source.getImportDeclarations()[0];
  if (door === undefined) {
    throw new Error("module request fixture is missing");
  }
  const acquire = vi.fn(() => {
    throw new Error("unexpected acquisition");
  });
  using session = nativeTypeFactSession(acquire);
  session.request("owner", { kind: "module-targets", nodes: [door] });
  expect(() => session.moduleTargets("owner", [door])).toThrow("sealed before reading");
  expect(() => session.request("owner", { kind: "module-targets", nodes: source.getExportDeclarations() })).toThrow("authored import or export door");
  session.seal(new Set(["owner"]));
  expect(() => session.moduleTargets("foreign-owner", [door])).toThrow("not registered");
  expect(() => session.request("owner", { kind: "module-targets", nodes: [door] })).toThrow("registration is sealed");
  expect(acquire).not.toHaveBeenCalled();
  session[Symbol.dispose]();
  expect(() => session.moduleTargets("owner", [door])).toThrow("disposed");
});

const span = (node: Node): InventorySpan => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() });

test(
  "contextual module requests preserve an explicitly registered non-primary importing world",
  ({ scratch, repoRoot }) => {
    const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
    const root = join(scratch, "subject");
    mkdirSync(root);
    writeFileSync(join(root, ".gitignore"), ".cache/\n");
    execFixtureGit(root, ["init", "-q"]);
    const entry = fileURLToPath(new URL("../compiler/native-inventory-adapter-cases.ts", import.meta.url));
    const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
    const resultPath = join(scratch, "result.json");
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "module-owner", implementation, root, resultPath], {
      timeout: scaledBudget(110_000),
    });
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toMatchObject({
      mode: "module-owner",
      target: "browser.ts",
      stale: expect.stringMatching(/epoch is stale/u),
    });
  },
  scaledBudget(120_000),
);

test.for(["bridge.ts", "node_modules/fixture/bridge.ts"])(
  "contextual module demand captures closure imports in %s, keeps prospective closure refusals and refuses missing available rows",
  { timeout: scaledBudget(30_000) },
  (bridgePath, { scratch }) => {
    const write = (file: string, text: string): void => {
      mkdirSync(dirname(join(scratch, file)), { recursive: true });
      writeFileSync(join(scratch, file), text);
    };
    write(".gitignore", ".cache\nnode_modules\n");
    write("tsconfig.json", JSON.stringify({ compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" }, files: ["root.ts"] }));
    write("root.ts", `import "./${bridgePath}";export const root=1;`);
    write(bridgePath, 'import "./leaf.ts";import "./missing.ts";');
    const leafPath = join(scratch, dirname(bridgePath), "leaf.ts");
    writeFileSync(leafPath, "export const leaf=1;");
    write("outside.ts", 'import "./outside-target.ts";');
    execFixtureGit(scratch, ["init", "-q"]);
    const workspace = createSemanticWorkspace({ root: scratch });
    const program = required(workspace.program("tsconfig.json"));
    const importer = required(program.sourceFile(join(scratch, "root.ts")));
    const bridge = required(required(importer.getImportDeclarations()[0]).getModuleSpecifierSourceFile());
    const door = required(bridge.getImportDeclarations()[0]);
    const absent = required(bridge.getImportDeclarations()[1]);
    const outside = new Project({ useInMemoryFileSystem: true }).createSourceFile(join(scratch, "outside.ts"), 'import "./outside-target.ts";');
    const unavailable = required(outside.getImportDeclarations()[0]);
    const queries = [door, absent, unavailable].map((node) => ({ program: program.descriptor.id, query: { importer: span(importer), node: span(node) } }));
    let baselineGeneration = 0;
    {
      using baseline = nativeInventoryFixture({ root: scratch, families: ["modules"], programs: [program.descriptor] });
      baselineGeneration = baseline.generation;
      expect(baseline.moduleTarget(required(importer.getImportDeclarations()[0]), program.descriptor.id)?.getFilePath()).toBe(bridge.getFilePath());
      expect(() => baseline.moduleTarget(door, program.descriptor.id)).toThrow("not admitted");
    }
    let generation = 0;
    {
      using inventory = nativeInventoryFixture({ root: scratch, families: ["modules"], programs: [program.descriptor], moduleTargetQueries: queries });
      generation = inventory.generation;
      expect(generation).toBeGreaterThan(baselineGeneration);
      expect(inventory.moduleTarget(door, program.descriptor.id, importer)?.getFilePath()).toBe(leafPath);
      expect(inventory.moduleTarget(absent, program.descriptor.id, importer)).toBeUndefined();
      expect(() => inventory.moduleTarget(unavailable, program.descriptor.id, importer)).toThrow("outside its importing closure");
      expect(() => inventory.moduleTarget(door, program.descriptor.id, outside)).toThrow("not admitted");
      const foreignImporter = importer.getProject().createSourceFile(join(scratch, "foreign.ts"), "export const foreign=1;");
      expect(() => inventory.moduleTarget(door, program.descriptor.id, foreignImporter)).toThrow("not admitted");
    }
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    using borrowed = inventoryReader(scratch, generation, readInventoryGeneration(db, generation), {
      db,
      moduleTargetQueries: queries,
      dispose: () => undefined,
    });
    expect(borrowed.moduleTarget(door, program.descriptor.id, importer)?.getFilePath()).toBe(leafPath);
    db.prepare("DELETE FROM inventory_declaration WHERE kind='modules'").run();
    db.prepare("DELETE FROM inventory_fact WHERE kind='modules'").run();
    expect(() => borrowed.moduleTarget(door, program.descriptor.id, importer)).toThrow("coverage is unavailable");
    borrowed[Symbol.dispose]();
    expect(() => borrowed.moduleTarget(door, program.descriptor.id, importer)).toThrow("disposed");
  },
);

test("contextual module registration binds exact importer identities and same-text epochs before acquisition", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const importer = project.createSourceFile("/root.ts", 'import "./target.ts";');
  const other = project.createSourceFile("/other.ts", 'import "./target.ts";');
  const door = required(importer.getImportDeclarations()[0]);
  const acquire = vi.fn(() => {
    throw new Error("unexpected acquisition");
  });
  using owner = nativeTypeFactSession(acquire);
  owner.request("owner", { kind: "module-targets", nodes: [door], importer });
  owner.seal(new Set(["owner"]));
  expect(() => owner.moduleTargets("owner", [door], other)).toThrow("not registered");
  importer.replaceWithText(importer.getFullText());
  expect(() => owner.moduleTargets("owner", [door], importer)).toThrow("epoch is stale");
  expect(acquire).not.toHaveBeenCalled();
});
