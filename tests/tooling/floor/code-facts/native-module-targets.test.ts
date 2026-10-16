import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { createSemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project } from "ts-morph";
import { vi } from "vitest";
import { nativeTypeFactSession } from "../../../../tooling/src/verify/lib/project-context.ts";

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

test("explicit native module targets retain importing-world meaning, side effects, type-only doors and explicit absence", ({ scratch }) => {
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
  using inventory = createSemanticInventory({ root: scratch, families: ["modules"] });
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

test("explicit module targets refuse stale query and target bytes, foreign roots and disposed snapshots", ({ scratch }) => {
  fixture(scratch);
  using inventory = createSemanticInventory({ root: scratch, families: ["modules"] });
  const corpus = inventory.sourceCorpus();
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
