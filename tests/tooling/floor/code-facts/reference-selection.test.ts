import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ModuleKind, ModuleResolutionKind, Project, SyntaxKind } from "ts-morph";
import { buildLiveness, collectApiSurface, collectOrphanCandidates, deadEvidenceFor } from "../../../../tooling/src/ast/index.ts";
import { INVENTORY_VERBS } from "../../../../tooling/src/ast/ops/verbs.ts";
import { dynamicModuleTarget, importerModulePath, relativeModuleTarget as resolveModule } from "../../../../tooling/src/floor/code-facts/module-target.ts";
import { declarationsNamed } from "../../../../tooling/src/floor/code-facts/reference-declarations.ts";
import {
  isDocumentationLinkReference,
  literalMemberAccess,
  literalTypeIndex,
  readMemberAccess,
} from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { declarationBindingKeys } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { semanticReferenceNodes } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";

function sourceOf(text: string): ReturnType<Project["createSourceFile"]> {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile("/repo/source.ts", text);
}

test("named declaration selection preserves barrel-origin deduplication and every existing local declaration kind", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const base = project.createSourceFile(
    "/repo/base.ts",
    `
export function target(): void {}
function local(): void {}
const value = 1;
class LocalClass { method(): void {} }
interface LocalInterface { value: string }
type LocalType = LocalInterface;
enum LocalEnum { Value }
`,
  );
  project.createSourceFile("/repo/barrel.ts", 'export { target } from "./base";');
  const files = project.getSourceFiles();
  expect(declarationsNamed(files, "target")).toEqual([base.getFunctionOrThrow("target")]);
  const expected = [
    ["local", base.getFunctionOrThrow("local")],
    ["value", base.getVariableDeclarationOrThrow("value")],
    ["LocalClass", base.getClassOrThrow("LocalClass")],
    ["LocalInterface", base.getInterfaceOrThrow("LocalInterface")],
    ["LocalType", base.getTypeAliasOrThrow("LocalType")],
    ["LocalEnum", base.getEnumOrThrow("LocalEnum")],
    ["method", base.getClassOrThrow("LocalClass").getMethodOrThrow("method")],
  ] as const;
  for (const [name, declaration] of expected) {
    expect(declarationsNamed(files, name), name).toEqual([declaration]);
  }
  expect(declarationsNamed(files, "absent")).toEqual([]);
});

test("literal member extraction preserves dot, optional and bracket spelling without borrowing constant or numeric semantics", () => {
  const source = sourceOf('const KEY = "foo"; const reads = [obj.foo, obj?.foo, obj["foo"], obj?.["foo"], obj[KEY], obj[0], obj["foo" as const]];');
  const expressions = source.getVariableDeclarationOrThrow("reads").getInitializerOrThrow().asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();
  expect(expressions.map((node) => literalMemberAccess(node)?.name)).toEqual(["foo", "foo", "foo", "foo", undefined, undefined, undefined]);
  const alias = expressions[4];
  if (alias === undefined) {
    throw new Error("constant-origin member control missing");
  }
  expect(readMemberAccess(alias)).toMatchObject({ kind: "resolved", value: { name: "foo" } });
  const read = literalMemberAccess(source.getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression));
  expect(read?.receiver.getText()).toBe("obj");
  expect(read?.nameNode.getText()).toBe('"foo"');
});

test("template admission is explicit and expression wrappers and qualified types remain separate subjects", () => {
  const source = sourceOf("const reads = [obj[`foo`], (obj.foo), obj[`f${key}`]]; type Value = NS.Foo;");
  const expressions = source.getVariableDeclarationOrThrow("reads").getInitializerOrThrow().asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();
  expect(expressions.map((node) => literalMemberAccess(node)?.name)).toEqual([undefined, undefined, undefined]);
  expect(expressions.map((node) => literalMemberAccess(node, true)?.name)).toEqual(["foo", undefined, undefined]);
  const qualified = source.getFirstDescendantByKindOrThrow(SyntaxKind.QualifiedName);
  expect(literalMemberAccess(qualified, true)).toBeUndefined();
});

test("indexed type extraction accepts only a literal string index, not value members, number indices or type-level computed names", () => {
  const source = sourceOf('type A = T["foo"]; type B = T[0]; type C = T[Key]; const value = obj["foo"];');
  const indices = source.getDescendantsOfKind(SyntaxKind.IndexedAccessType).map((node) => node.getIndexTypeNode());
  expect(indices.map(literalTypeIndex)).toEqual(["foo", undefined, undefined]);
  const access = source.getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression);
  expect(literalTypeIndex(access)).toBeUndefined();
});

test("native importer lookup and relative-only module policy preserve different admitted suffixes and unresolved outcomes", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  const target = project.createSourceFile("/repo/target.mts", "export const value = 1;");
  const source = project.createSourceFile("/repo/from.ts", 'export const load = () => import("./target");');
  const call = source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  expect(importerModulePath(source, "./target")).toBe(target.getFilePath());
  expect(resolveModule(project, source.getDirectoryPath(), "./target")).toBeUndefined();
  expect(dynamicModuleTarget(call)).toBeUndefined();
  expect(importerModulePath(source, "./missing")).toBeUndefined();
  expect(resolveModule(project, source.getDirectoryPath(), "@fixture/target")).toBeUndefined();
});

test("unqualified reference and importer verbs retain explicit native views rather than invoking syntax-carrier type readers", () => {
  expect(["refs", "callers", "jsx", "importers"].filter((verb) => INVENTORY_VERBS.has(verb))).toEqual([]);
});

test("a JSDoc link remains documentation rather than a product consumer", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/packages/kit/src/documentation.ts",
    `
export function documented(): void {}
/** See {@link documented}. */
export function unrelated(): void {}
`,
  );
  const evidence = deadEvidenceFor(project, source.getFunctionOrThrow("documented"), "documented", buildLiveness(project));
  expect(semanticReferenceNodes(source.getFunctionOrThrow("documented")).some(isDocumentationLinkReference)).toBe(true);
  expect(evidence.prodCount).toBe(0);
  expect(evidence.verdict).toBe("CANDIDATE");
  expect(evidence.commentMentions).toBeGreaterThan(0);
});

test("link-only classification preserves real code references beside documentation and genuine type positions", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/packages/kit/src/references.ts",
    `
export function callable(): void {}
export interface Shape { value: string }
/** See {@linkcode callable} and {@linkplain Shape}. */
export function consuming(value: Shape): void { callable(); }
`,
  );
  const live = buildLiveness(project);
  expect(deadEvidenceFor(project, source.getFunctionOrThrow("callable"), "callable", live)).toMatchObject({ prodCount: 1, verdict: "ALIVE" });
  expect(deadEvidenceFor(project, source.getInterfaceOrThrow("Shape"), "Shape", live)).toMatchObject({ prodCount: 1, verdict: "ALIVE" });
});

test("own-file liveness excludes every documentation link spelling without excluding code, types or explicit markers", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/packages/kit/src/documentation.ts",
    `
/** See {@link beforeFunction}, {@linkcode beforeValue}, {@linkplain BeforeType}. */
export const introduction = 0;
export function beforeFunction(): void {}
export const beforeValue = 1;
export interface BeforeType { value: number }
export function afterFunction(): void {}
export const afterValue = 2;
export type AfterType = string;
/** See {@linkplain afterFunction}, {@link afterValue}, {@linkcode AfterType}. */
export function documentation(): void {}
export function shadow(beforeFunction: () => void): void { beforeFunction(); }
export function called(): void {}
export interface Shape { value: string }
export function consumer(value: Shape): void { called(); }
export function recursive(): void { recursive(); }
/** @public future: supported external consumer */
export function supported(): void {}
`,
  );
  const live = buildLiveness(project);
  const api = collectApiSurface(project, () => true, live);
  const orphans = collectOrphanCandidates(project, live, () => true);
  const documentedNames = ["beforeFunction", "beforeValue", "BeforeType", "afterFunction", "afterValue", "AfterType"];
  for (const name of documentedNames) {
    const declaration = declarationsNamed([source], name)[0];
    if (declaration === undefined) {
      throw new Error(`missing documented declaration: ${name}`);
    }
    const links = semanticReferenceNodes(declaration).filter(isDocumentationLinkReference);
    expect(
      links.map((node) => [node.getKind(), node.getText()]),
      name,
    ).toEqual([[SyntaxKind.Identifier, name]]);
    expect(
      links.every((node) => declarationBindingKeys(node).some((key) => declarationBindingKeys(declaration).includes(key))),
      name,
    ).toBe(true);
    expect(api.find((entry) => entry.name === name)?.klass, name).toBe("unused");
    expect(
      orphans.some((entry) => entry.name === name),
      name,
    ).toBe(true);
    expect(deadEvidenceFor(project, declaration, name, live), name).toMatchObject({ prodCount: 0, verdict: "CANDIDATE" });
  }
  for (const name of ["called", "Shape", "recursive"]) {
    expect(api.find((entry) => entry.name === name)?.klass, name).toBe("internal");
    const declaration = declarationsNamed([source], name)[0];
    if (declaration === undefined) {
      throw new Error(`missing consumed declaration: ${name}`);
    }
    expect(deadEvidenceFor(project, declaration, name, live), name).toMatchObject({ prodCount: 1, verdict: "ALIVE" });
  }
  expect(deadEvidenceFor(project, source.getFunctionOrThrow("supported"), "supported", live)).toMatchObject({ prodCount: 0, verdict: "TAGGED-KEEP" });
});

test("documentation-link exclusion preserves genuine JSDoc type references", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  const source = project.createSourceFile(
    "/repo/packages/kit/src/annotations.js",
    "export class Shape {}\n/** @type {Shape} */\nexport const annotated = null;\n",
  );
  const declaration = source.getClassOrThrow("Shape");
  const references = semanticReferenceNodes(declaration);
  expect(references.map((node) => [node.getText(), isDocumentationLinkReference(node)])).toEqual([["Shape", false]]);
  const live = buildLiveness(project);
  expect(collectApiSurface(project, () => true, live).find((entry) => entry.name === "Shape")?.klass).toBe("internal");
  expect(deadEvidenceFor(project, declaration, "Shape", live)).toMatchObject({ prodCount: 1, verdict: "ALIVE" });
});
