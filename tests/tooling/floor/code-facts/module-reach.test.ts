import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ModuleKind, ModuleResolutionKind, Node, Project, SyntaxKind } from "ts-morph";
import { inventoryConsumerClass } from "../../../../tooling/src/floor/code-facts/inventory-consumers.ts";
import { collectModuleImporters } from "../../../../tooling/src/floor/code-facts/module-importers.ts";
import { modulePositionSpecifier } from "../../../../tooling/src/floor/code-facts/module-specifier.ts";
import { reachableDeclarations } from "../../../../tooling/src/floor/code-facts/production-reach.ts";
import type { InventoryPartition } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { DEFAULT_INVENTORY_FAMILIES, INVENTORY_FORMAT, SemanticInventoryError } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { testReach } from "../../../../tooling/src/floor/code-facts/test-reach.ts";

const ROOT = "/repo";

test("authored module positions include erased and mocked doors but exclude path data and computed calls", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    `${ROOT}/tests/probe.test.ts`,
    `
import { value } from "import-door";
export { value } from "export-door";
type Shape = import("type-door").Shape;
const later = import("dynamic-door");
vi.mock("mock-door"); vi.doMock("do-mock-door");
vi.unmock("unmock-door"); vi.doUnmock("do-unmock-door");
vi.importActual("actual-door"); vi.importMock("import-mock-door");
require("require-door");
const plain = "data-door";
readFileSync("file-door"); new URL("url-door", import.meta.url);
declare const computed: string; import(computed); vi.mock(computed);
`,
  );
  const positions = source.getDescendants().flatMap((node) => {
    const literal = modulePositionSpecifier(node);
    return literal !== undefined && Node.isStringLiteral(literal) ? [literal.getLiteralValue()] : [];
  });
  expect(positions).toEqual([
    "import-door",
    "export-door",
    "type-door",
    "dynamic-door",
    "mock-door",
    "do-mock-door",
    "unmock-door",
    "do-unmock-door",
    "actual-door",
    "import-mock-door",
    "require-door",
  ]);
});

test("default module grammar retains nonliteral arguments without admitting relocation-only forms", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    `${ROOT}/tests/arguments.test.ts`,
    "declare const computed: string; import(computed); vi.mock(computed); require(computed);\n" +
      'require.resolve("resolve-only"); import.meta.resolve("meta-only"); createRequire(import.meta.url)("created-only");\n' +
      'new URL("url-only", import.meta.url); import other = require("equals-only");\n',
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  expect(calls.map((call) => modulePositionSpecifier(call)?.getText())).toEqual([
    "computed",
    "computed",
    "computed",
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(
    source.getDescendants().flatMap((node) => {
      const argument = modulePositionSpecifier(node);
      return argument === undefined ? [] : [argument.getText()];
    }),
  ).toEqual(["computed", "computed", "computed"]);
});

test("native importer identity includes alias peers and literal dynamic imports without counting mock, require or import-type spelling", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      baseUrl: ROOT,
      module: ModuleKind.NodeNext,
      moduleResolution: ModuleResolutionKind.NodeNext,
      paths: { "#target": ["packages/kit/src/target.ts"] },
    },
  });
  project.createSourceFile(`${ROOT}/packages/kit/src/target.ts`, "export const value = 1;");
  project.createSourceFile(`${ROOT}/packages/kit/src/alias.ts`, 'import { value } from "#target"; export { value };');
  project.createSourceFile(`${ROOT}/packages/kit/src/relative.ts`, 'export { value } from "./target";');
  project.createSourceFile(`${ROOT}/packages/kit/src/dynamic.ts`, 'export const load = () => import("./target");');
  project.createSourceFile(`${ROOT}/packages/kit/src/spelling.ts`, 'vi.mock("#target"); require("#target"); type Shape = typeof import("#target");');
  project.resolveSourceFileDependencies();
  const result = collectModuleImporters(project.getSourceFiles(), "#target");
  expect([...result.targetPaths]).toEqual([`${ROOT}/packages/kit/src/target.ts`]);
  expect(new Set(result.hits.map(({ node, kind }) => `${node.getSourceFile().getBaseName()}:${kind}`))).toEqual(
    new Set(["alias.ts:import", "relative.ts:import", "dynamic.ts:dynamic-import"]),
  );
  const exact = collectModuleImporters(project.getSourceFiles(), "#target", "exact-import-spelling");
  expect(exact.hits.map(({ node }) => node.getSourceFile().getBaseName())).toEqual(["alias.ts"]);
  expect([...exact.targetPaths]).toEqual([]);
});

test("unqualified syntax carriers refuse native importer, test and runtime reach rather than claiming empty facts", ({ scratch }) => {
  const native = new Project({ useInMemoryFileSystem: true });
  const target = native.createSourceFile(`${ROOT}/packages/kit/src/target.ts`, "export function real(): number { return 1; }");
  const spec = native.createSourceFile(`${ROOT}/tests/kit/real.test.ts`, 'import { real } from "../../packages/kit/src/target.ts"; real();');
  const runtime = native.createSourceFile(
    `${ROOT}/tooling/src/probe.ts`,
    'import { real } from "../../packages/kit/src/target.ts"; export const create = () => real();',
  );
  const files = native.getSourceFiles();
  const input = {
    files,
    relativePath: (file: import("ts-morph").SourceFile): string => file.getFilePath().slice(ROOT.length + 1),
    checker: native.getTypeChecker(),
    isSubject: (path: string): boolean => path === "packages/kit/src/target.ts",
  };
  expect(collectModuleImporters(files, "target.ts").hits.some(({ node }) => node.getSourceFile() === spec)).toBe(true);
  expect(testReach(input).reachedBy.get("packages/kit/src/target.ts")).toEqual(new Set(["unit"]));
  expect(reachableDeclarations(runtime.getVariableDeclarationOrThrow("create").getInitializerOrThrow(), new Map()).has(target.getFunctionOrThrow("real"))).toBe(
    true,
  );

  const partition: InventoryPartition = {
    format: INVENTORY_FORMAT,
    families: DEFAULT_INVENTORY_FAMILIES,
    casts: [],
    brands: [],
    memberOrigins: [],
    callableDeclarations: [],
    declarationOutputs: [],
    runtimeExports: [],
    shapes: [],
    pairs: [],
    intent: "facts",
    available: files.map((file) => file.getFilePath()),
    program: "tooling/tsconfig.json",
    descriptorVersion: "syntax-only-control",
    compilerOptionsJson: "{}",
    configPaths: [],
    projectReferences: [],
    roots: files.map((file) => file.getFilePath()),
    nativeRoots: files.map((file) => file.getFilePath()),
    inputs: [],
    sources: files.map((file) => ({
      file: file.getFilePath(),
      path: file.getFilePath(),
      consumerClass: inventoryConsumerClass(file.getFilePath()),
      text: file.getFullText(),
      authored: true,
    })),
    exports: [],
    modules: [],
    bindings: [],
    references: [],
    witnesses: [],
  };
  using database = openInventoryDatabase(`${scratch}/inventory.sqlite`);
  const generation = publishInventoryGeneration(database, [partition]);
  using stored = inventoryReader(ROOT, generation, readInventoryGeneration(database, generation), { db: database, dispose: () => undefined });
  const syntaxFiles = stored.sourceCorpus().getSourceFiles();
  const syntaxRuntime = stored.sourceCorpus().getSourceFile(runtime.getFilePath());
  if (syntaxRuntime === undefined) {
    throw new Error("refusal fixture must contain the same runtime source");
  }
  expect(() => collectModuleImporters(syntaxFiles, "target.ts")).toThrow(SemanticInventoryError);
  expect(
    collectModuleImporters(syntaxFiles, "../../packages/kit/src/target.ts", "exact-import-spelling").hits.map(({ node }) => node.getSourceFile().getFilePath()),
  ).toEqual([spec.getFilePath(), runtime.getFilePath()].toSorted());
  expect(collectModuleImporters(syntaxFiles, "target.ts", "exact-import-spelling").hits).toEqual([]);
  expect(() => collectModuleImporters(syntaxFiles, "target.ts")).toThrow("importer queries require an explicit native program view");
  expect(() => testReach({ ...input, files: syntaxFiles })).toThrow("test reach requires an explicit native program view");
  expect(() => reachableDeclarations(syntaxRuntime.getVariableDeclarationOrThrow("create").getInitializerOrThrow(), new Map())).toThrow(
    "runtime declaration reach requires an explicit native program view",
  );
});
