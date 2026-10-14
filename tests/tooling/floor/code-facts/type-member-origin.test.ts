import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { resolveReturnTypeIdentityGraph, resolveReturnTypeIdentityOrigin, resolveTypeIdentityOrigin } from "@orb/tooling/floor/code-facts/type-member-origin";
import { resolveTypePropertyOrigin } from "@orb/tooling/floor/code-facts/type-member-origin-core";
import type { CallExpression, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";

const CONTRACT = "/repo/contract.ts";

test("native property paths preserve one-name evidence, generic instantiation and every union declaration", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile(
    "/repo/paths.ts",
    `interface First { readonly value: () => string; }
interface Second { readonly value: () => number; }
interface Box<T> { readonly nested?: T; }
declare const root: Box<First | Second>;
`,
  );
  const root = source.getVariableDeclarationOrThrow("root").getNameNode();
  const one = resolveTypePropertyOrigin(root, "nested");
  const singlePath = resolveTypePropertyOrigin(root, ["nested"]);
  expect(singlePath).toEqual(one);
  const nested = resolveTypePropertyOrigin(root, ["nested", "value"]);
  if (nested.kind === "unresolved") {
    throw new Error(nested.detail);
  }
  expect(nested.value.map((declaration) => declaration.getText())).toEqual(["readonly value: () => string;", "readonly value: () => number;"]);
  expect(nested.trace.origin).toBe(root);
  expect(resolveTypePropertyOrigin(root, [])).toMatchObject({ kind: "unresolved", reason: "unsupported", node: root });
  expect(resolveTypePropertyOrigin(root, ["nested", "absent"])).toMatchObject({ kind: "unresolved", reason: "missing", node: root });
  expect(resolveTypePropertyOrigin(root, "absent")).toMatchObject({
    kind: "unresolved",
    reason: "missing",
    node: root,
    detail: "the checker resolved no property symbol named absent on root",
  });
});

test("native property paths refuse a member missing from a union branch instead of selecting the readable branch", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile("/repo/partial-path.ts", "declare const root: { nested: { value: () => void } | { other: string } };\n");
  const root = source.getVariableDeclarationOrThrow("root").getNameNode();
  expect(resolveTypePropertyOrigin(root, ["nested", "value"])).toMatchObject({ kind: "unresolved", reason: "missing", node: root });
});

function fixture(source: string): { readonly file: SourceFile; readonly call: CallExpression } {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  project.createSourceFile(CONTRACT, "export interface Result { readonly read: () => number }\n");
  const file = project.createSourceFile("/repo/use.ts", source);
  const call = file.getDescendantsOfKind(SyntaxKind.CallExpression).at(-1);
  if (call === undefined) {
    throw new Error("return identity fixture has no subject call");
  }
  return { file, call };
}

test.each([
  "import type { Result } from './contract.ts'; function run(): Result { return { read: () => 1 }; } run();",
  "import type { Result } from './contract.ts'; async function run(): Promise<Result> { return { read: () => 1 }; } run();",
  "import type { Result as Imported } from './contract.ts'; type Alias = Imported; function run(): Alias { return { read: () => 1 }; } const alias = run; alias();",
])("callable results retain canonical contract identity across synchronous, promised and aliased results: %s", (source) => {
  const { call } = fixture(source);
  const result = resolveReturnTypeIdentityOrigin(call);
  expect(result.kind).toBe("resolved");
  if (result.kind !== "resolved") {
    throw new Error(result.detail);
  }
  expect(result.value.declarations.map((declaration) => declaration.getSourceFile().getFilePath())).toEqual([CONTRACT]);
});

test("a structurally identical local result is not the imported contract, and ordinary node identity stays local", () => {
  const { file, call } = fixture("interface Result { readonly read: () => number } function run(): Result { return { read: () => 1 }; } run();");
  const result = resolveReturnTypeIdentityOrigin(call);
  const own = resolveTypeIdentityOrigin(file.getInterfaceOrThrow("Result"));
  expect(result.kind).toBe("resolved");
  expect(own.kind).toBe("resolved");
  if (result.kind !== "resolved" || own.kind !== "resolved") {
    throw new Error("local result type identity was unreadable");
  }
  expect(result.value.declarations).toEqual(own.value.declarations);
  expect(result.value.declarations[0]?.getSourceFile().getFilePath()).toBe("/repo/use.ts");
});

test.each([
  ["function run(): number { return 1; } run();", "missing"],
  ["declare const promise: { then(onfulfilled: number): number }; function run(): typeof promise { return promise; } run();", "missing"],
  ["function run(): object { return {}; } let alias = run; alias();", "write"],
  ["function use(run: () => object) { return run(); }", "missing"],
  ["function run(): object { return {}; } run.call(null);", "unsupported"],
])("unreadable callable results retain their specific refusal: %s", (source, reason) => {
  expect(resolveReturnTypeIdentityOrigin(fixture(source).call)).toMatchObject({ kind: "unresolved", reason });
});

test.each([
  'import type { Result } from "./contract.ts"; declare const result: Result; function run(): { payload: Result } { return { payload: result }; } run();',
  'import type { Result } from "./contract.ts"; declare const result: Result; async function run(): Promise<{ other: { nested: Result } }> { return { other: { nested: result } }; } run();',
  'import type { Result } from "./contract.ts"; type First = Result; type Second = First; declare const result: Second; function run(): { different: Second } { return { different: result }; } run();',
  'import type { Result } from "./contract.ts"; declare const result: Result; function run(): readonly Result[] { return [result]; } run();',
  'import type { Result } from "./contract.ts"; declare const result: Result; function run(): readonly [string, Result] { return ["x", result]; } run();',
  'import type { Result } from "./contract.ts"; declare const result: Result; function run(): Readonly<Record<string, Result>> { return { item: result }; } run();',
  'import type { Result } from "./contract.ts"; interface Wrapper { self?: Wrapper; payload: Result } declare const wrapper: Wrapper; function run(): Wrapper | null { return wrapper; } run();',
])("returned data retains owned identity across wrappers and native containers: %s", (source) => {
  const graph = resolveReturnTypeIdentityGraph(fixture(source).call, CONTRACT);
  if (graph.kind !== "resolved") {
    throw new Error(graph.detail);
  }
  expect(graph.value.flatMap((identity) => identity.declarations.map((declaration) => declaration.getSourceFile().getFilePath()))).toContain(CONTRACT);
});

test.each([
  'import type { Result } from "./contract.ts"; declare const result: Result; function run(): { load: () => Result } { return { load: () => result }; } run();',
  'import type { Result } from "./contract.ts"; type Phantom<T> = { stamp: number }; function run(): Phantom<Result> { return { stamp: 1 }; } run();',
])("callable and erased generic references are not returned service data: %s", (source) => {
  const graph = resolveReturnTypeIdentityGraph(fixture(source).call, CONTRACT);
  if (graph.kind !== "resolved") {
    throw new Error(graph.detail);
  }
  expect(graph.value.flatMap((identity) => identity.declarations.map((declaration) => declaration.getSourceFile().getFilePath()))).not.toContain(CONTRACT);
});

test("the owned-home query stops before expanding unrelated returned identities", () => {
  const { call } = fixture(
    'import type { Result } from "./contract.ts"; interface Unrelated { deeper: Unrelated } declare const result: Result; declare const other: Unrelated; function run(): { first: Result; later: Unrelated } { return { first: result, later: other }; } run();',
  );
  const graph = resolveReturnTypeIdentityGraph(call, CONTRACT);
  if (graph.kind !== "resolved") {
    throw new Error(graph.detail);
  }
  expect(graph.value.map((identity) => identity.name)).toContain("Result");
  expect(graph.value.map((identity) => identity.name)).not.toContain("Unrelated");
});

test("returned-data queries preserve a refused mutable callable origin", () => {
  expect(resolveReturnTypeIdentityGraph(fixture("function run(): object { return {}; } let alias = run; alias();").call)).toMatchObject({
    kind: "unresolved",
    reason: "write",
  });
});
