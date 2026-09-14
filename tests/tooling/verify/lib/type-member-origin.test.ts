// The TYPE-level origin readers answer the question the VALUE walk structurally cannot: a receiver minted
// by a call (`useTRPC()`, `useQueryClient()`, a store hook, a form api) has no module origin, so the only
// identity available is the declaration home of the property symbol the checker resolved. Every control
// here is a same-SPELLING/different-IDENTITY pair — a local lookalike interface, a second module exporting
// the same type name — because that pair is the whole reason the readers exist.

import type { ReferenceFact, ResolvedReferenceFact } from "@orb/tooling/_shared/reference-fact-contract";
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind, Type } from "ts-morph";
import { vi } from "vitest";
import {
  declaredByAnyPackage,
  declaredByFile,
  declaredByPackage,
  resolveContextualMemberOrigin,
  resolveTypeIdentityChain,
  resolveTypeIdentityOrigin,
  resolveTypeMemberOrigin,
  resolveTypePropertyOrigin,
  resolveTypeValueOrigins,
} from "../../../../tooling/src/verify/lib/type-member-origin.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Test-only fail-fast tripwire for any expanding generic. A removed production recurrence boundary must
 *  fail an assertion rather than exhaust the test worker. This budget is not a production hop limit. */
function withRecursiveTypeTripwire<T>(run: () => T): T {
  const originalProperties = Type.prototype.getProperties;
  const originalIntersections = Type.prototype.getIntersectionTypes;
  const expansions = new Map<object, Set<object>>();
  const record = (type: Type): void => {
    const alias = type.getAliasSymbol();
    const target = alias !== undefined && type.getAliasTypeArguments().length > 0 ? alias.compilerSymbol : undefined;
    if (target === undefined) {
      return;
    }
    const instances = expansions.get(target) ?? new Set<object>();
    instances.add(type.compilerType);
    expansions.set(target, instances);
    if (instances.size > 64) {
      throw new Error("TEST TRIPWIRE: expanding generic data graph crossed its recurrence boundary");
    }
  };
  const propertySpy = vi.spyOn(Type.prototype, "getProperties").mockImplementation(function (this: Type) {
    record(this);
    return originalProperties.call(this);
  });
  const intersectionSpy = vi.spyOn(Type.prototype, "getIntersectionTypes").mockImplementation(function (this: Type) {
    record(this);
    return originalIntersections.call(this);
  });
  try {
    return run();
  } finally {
    intersectionSpy.mockRestore();
    propertySpy.mockRestore();
  }
}

const ROOT = "/type-member-origin";

const VENDOR = [
  "export declare class Cache {",
  "  setQueryData(key: string, value: unknown): void;",
  "}",
  "export interface Options {",
  "  staleTime?: number | 'static';",
  "}",
  "export declare function configure(options: Options): void;",
].join("\n");

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/node_modules/@vendor/cache/index.d.ts`, VENDOR);
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function file(project: Project, path: string): SourceFile {
  return project.getSourceFileOrThrow(`${ROOT}/${path}`);
}

function expectResolved<T>(fact: ReferenceFact<T>): ResolvedReferenceFact<T> {
  expect(fact.kind).toBe("resolved");
  if (fact.kind === "unresolved") {
    throw new Error(`${fact.reason}: ${fact.detail}`);
  }
  return fact;
}

function memberReads(source: SourceFile, name: string): readonly Node[] {
  return [
    ...source.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).filter((node) => node.getName() === name),
    ...source
      .getDescendantsOfKind(SyntaxKind.ElementAccessExpression)
      .filter((node) => node.getArgumentExpression()?.getText().replaceAll(/["']/gu, "") === name),
  ];
}

test("a member read resolves to the property symbol's declaration home through every spelling", () => {
  const project = projectOf({
    "a.ts": [
      'import type { Cache } from "@vendor/cache";',
      "export function dotted(cache: Cache): void { cache.setQueryData('k', 1); }",
      "export function computed(cache: Cache): void { cache['setQueryData']('k', 1); }",
      "export function optional(cache?: Cache): void { cache?.setQueryData('k', 1); }",
    ].join("\n"),
  });
  const reads = memberReads(file(project, "a.ts"), "setQueryData");

  expect(reads).toHaveLength(3);
  const homes = reads.map((read) => {
    const fact = expectResolved(resolveTypeMemberOrigin(read));
    return {
      name: fact.value.name,
      vendor: declaredByPackage(fact.value.declarations, "@vendor/cache"),
      other: declaredByPackage(fact.value.declarations, "@vendor/other"),
    };
  });
  // The dotted, computed and optional spellings are ONE fact — and the negative package is the planted
  // control proving `declaredByPackage` is answering about the home rather than always saying yes.
  expect(homes).toEqual([
    { name: "setQueryData", vendor: true, other: false },
    { name: "setQueryData", vendor: true, other: false },
    { name: "setQueryData", vendor: true, other: false },
  ]);
});

test("a same-named member of a LOCAL lookalike resolves but is not the vendor home", () => {
  const project = projectOf({
    "b.ts": [
      "interface LocalCache { setQueryData(key: string, value: unknown): void }",
      "export function run(cache: LocalCache): void { cache.setQueryData('k', 1); }",
    ].join("\n"),
  });
  const [read] = memberReads(file(project, "b.ts"), "setQueryData");
  const fact = expectResolved(resolveTypeMemberOrigin(read ?? file(project, "b.ts")));

  expect(declaredByPackage(fact.value.declarations, "@vendor/cache")).toBe(false);
  expect(declaredByAnyPackage(fact.value.declarations, ["@vendor/cache", "@vendor/other"])).toBe(false);
});

test("an assignment target refuses as a write rather than reporting a read", () => {
  const project = projectOf({ "c.ts": ["interface Box { value: number }", "export function write(box: Box): void { box.value = 2; }"].join("\n") });
  const [read] = memberReads(file(project, "c.ts"), "value");

  expect(resolveTypeMemberOrigin(read ?? file(project, "c.ts"))).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("a property the checker cannot find on the receiver refuses as missing, never as absence", () => {
  const project = projectOf({
    "d.ts": ["interface Box { value: number }", "declare const box: Box;", "export const ghost = (box as unknown as Record<never, never>)['value'];"].join(
      "\n",
    ),
  });
  const [read] = memberReads(file(project, "d.ts"), "value");

  expect(resolveTypeMemberOrigin(read ?? file(project, "d.ts"))).toMatchObject({ kind: "unresolved", reason: "missing" });
});

test("a node that is not a member access refuses as unsupported", () => {
  const project = projectOf({ "e.ts": "export const literal = 1;\n" });
  const [numeric] = file(project, "e.ts").getDescendantsOfKind(SyntaxKind.NumericLiteral);

  expect(resolveTypeMemberOrigin(numeric ?? file(project, "e.ts"))).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("an object-literal key resolves to the CONTEXTUAL property its own literal cannot supply", () => {
  const project = projectOf({
    "f.ts": ['import { configure } from "@vendor/cache";', "configure({ staleTime: 5 });", "export const bag = { staleTime: 5 };"].join("\n"),
  });
  const assignments = file(project, "f.ts")
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .filter((node) => node.getName() === "staleTime");

  expect(assignments).toHaveLength(2);
  const [contextual, freeStanding] = assignments;
  const fact = expectResolved(resolveContextualMemberOrigin(contextual ?? file(project, "f.ts")));
  expect(declaredByPackage(fact.value.declarations, "@vendor/cache")).toBe(true);
  // A free-standing bag is a DIFFERENT `staleTime`: the reader refuses instead of adopting the spelling.
  expect(resolveContextualMemberOrigin(freeStanding ?? file(project, "f.ts"))).toMatchObject({ kind: "unresolved", reason: "missing" });
});

test("a computed object key refuses as dynamic instead of naming one contextual property", () => {
  const project = projectOf({
    "g.ts": ['import { configure } from "@vendor/cache";', "declare const key: string;", "configure({ [key]: 5 } as never);"].join("\n"),
  });
  const [assignment] = file(project, "g.ts").getDescendantsOfKind(SyntaxKind.PropertyAssignment);

  expect(resolveContextualMemberOrigin(assignment ?? file(project, "g.ts"))).toMatchObject({ kind: "unresolved", reason: "dynamic" });
});

test("a type identity resolves through its ALIAS symbol and only the declaring FILE separates two homes", () => {
  const project = projectOf({
    "state/hook-home.ts": [
      "export type StoreHook<T> = { (): T; <U>(select: (state: T) => U): U };",
      "export declare function mint<T>(initial: T): StoreHook<T>;",
    ].join("\n"),
    "state/impostor.ts": ["export type StoreHook<T> = { (): T };", "export declare function mintOther<T>(initial: T): StoreHook<T>;"].join("\n"),
    "h.ts": [
      'import { mint } from "./state/hook-home.ts";',
      'import { mintOther } from "./state/impostor.ts";',
      "export const useReal = mint({ a: 1 });",
      "export const useFake = mintOther({ a: 1 });",
    ].join("\n"),
  });
  const home = file(project, "state/hook-home.ts");
  const source = file(project, "h.ts");
  const [real, fake] = ["useReal", "useFake"].map((name) => source.getVariableDeclarationOrThrow(name).getNameNode());

  const realFact = expectResolved(resolveTypeIdentityOrigin(real ?? source));
  expect(realFact.value).toMatchObject({ name: "StoreHook", aliased: true });
  expect(declaredByFile(realFact.value.declarations, home)).toBe(true);

  const fakeFact = expectResolved(resolveTypeIdentityOrigin(fake ?? source));
  expect(fakeFact.value).toMatchObject({ name: "StoreHook", aliased: true });
  expect(declaredByFile(fakeFact.value.declarations, home)).toBe(false);
});

test("a node with no named type refuses instead of reporting an anonymous home", () => {
  const project = projectOf({ "i.ts": "export const literal = 1;\n" });
  const [numeric] = file(project, "i.ts").getDescendantsOfKind(SyntaxKind.NumericLiteral);

  expect(resolveTypeIdentityOrigin(numeric ?? file(project, "i.ts"))).toMatchObject({ kind: "unresolved", reason: "missing" });
});

test("the identity CHAIN walks declared type aliases to their home, across modules and import doors", () => {
  const project = projectOf({
    "state/hook-home.ts": ["export type StoreHook<T> = { (): T; <U>(select: (state: T) => U): U };", "export declare const unused: number;"].join("\n"),
    "state/hooks.ts": ['import type { StoreHook } from "./hook-home.ts";', "export type UserHook = StoreHook<{ user: string }>;"].join("\n"),
    "m.ts": [
      'import type { UserHook } from "./state/hooks.ts";',
      "type LocalHook = UserHook;",
      "declare const useUserStore: LocalHook;",
      "export const read = useUserStore;",
    ].join("\n"),
  });
  const home = file(project, "state/hook-home.ts");
  const source = file(project, "m.ts");
  const callee = source.getVariableDeclarationOrThrow("read").getInitializerOrThrow();

  // The checker keeps an outermost alias that is NOT the home — a bare `type LocalHook = UserHook` carries
  // no type arguments, so TS collapses it and reports `UserHook`, declared in state/hooks.ts.
  const outermost = expectResolved(resolveTypeIdentityOrigin(callee));
  expect(outermost.value.name).toBe("UserHook");
  expect(declaredByFile(outermost.value.declarations, home)).toBe(false);

  // The chain reaches the home, following the import specifier on the way.
  const chain = expectResolved(resolveTypeIdentityChain(callee));
  expect(chain.value.map((identity) => identity.name)).toEqual(["UserHook", "StoreHook"]);
  expect(chain.value.some((identity) => declaredByFile(identity.declarations, home))).toBe(true);
});

test("a self-referential alias terminates the chain instead of looping", () => {
  const project = projectOf({
    "n.ts": ["type Loop = Loop;", "declare const value: Loop;", "export const read = value;"].join("\n"),
  });
  const callee = file(project, "n.ts").getVariableDeclarationOrThrow("read").getInitializerOrThrow();
  const chain = resolveTypeIdentityChain(callee);

  // Whether the checker names this type at all is its business; the reader must not hang either way.
  expect(["resolved", "unresolved"]).toContain(chain.kind);
});

test("annotation provenance follows local and nested aliases to the canonical declaration", () => {
  const project = projectOf({
    "contract.ts": "export interface ExemptionRow { readonly why: string }\nexport type ExemptionTable = Readonly<Record<string, ExemptionRow>>;",
    "aliases.ts": 'export type { ExemptionRow as CanonicalRow } from "./contract.ts";',
    "subject.ts": [
      'import type { ExemptionTable as Base } from "./contract.ts";',
      'import type { CanonicalRow as Row } from "./aliases.ts";',
      "type Homes = Base;",
      "type FreshnessRow = Row & { readonly plane: string };",
      "type Rows = Readonly<Record<string, FreshnessRow>>;",
      "declare const homes: Homes;",
      "declare const rows: Rows;",
    ].join("\n"),
  });
  const home = file(project, "contract.ts");
  const source = file(project, "subject.ts");
  const origins = (name: string): readonly string[] =>
    resolveTypeValueOrigins(source.getVariableDeclarationOrThrow(name).getTypeNodeOrThrow())
      .filter((fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, home))
      .map((fact) => expectResolved(fact).value.name)
      .toSorted();

  expect(origins("homes")).toContain("ExemptionTable");
  expect(origins("rows")).toEqual(["ExemptionRow"]);
});

test.each([
  ["keyof Table", ""],
  ["Phantom<Table>", "type Phantom<T> = string;"],
  ["Reader<Row>", "type Reader<T> = (row: T) => T;"],
  ["[Phantom<Row>, unknown]", "type Phantom<T> = string;"],
  ['Row["why"]', ""],
  ["Row extends object ? string : Row", ""],
])("annotation value semantics exclude erased or non-value reference in %s", (annotation, prelude) => {
  const project = projectOf({
    "contract.ts": "export interface Row { why: string }\nexport type Table = Readonly<Record<string, Row>>;",
    "subject.ts": `import type { Row, Table } from "./contract.ts";\n${prelude}\ndeclare const value: ${annotation};`,
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow());
  // Container members can contribute unrelated interface-projection facts. Neither resolved nor
  // unresolved canonical provenance may be revived by an erased argument or a callable signature.
  expect(facts.some((fact) => declaredByFile(fact.kind === "resolved" ? fact.value.declarations : fact.trace.declarations, file(project, "contract.ts")))).toBe(
    false,
  );
});

test.each([
  "Identity<Row>",
  "ReturnType<() => Row>",
  "Table[string]",
  "Row extends object ? Row : string",
])("annotation value semantics preserve actual canonical output in %s", (annotation) => {
  const project = projectOf({
    "contract.ts": "export interface Row { why: string }\nexport type Table = Readonly<Record<string, Row>>;",
    "subject.ts": `import type { Row, Table } from "./contract.ts";\ntype Identity<T> = T;\ndeclare const value: ${annotation};`,
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow());
  expect(
    facts.some((fact) => fact.kind === "resolved" && fact.value.name === "Row" && declaredByFile(fact.value.declarations, file(project, "contract.ts"))),
  ).toBe(true);
});

test("annotation provenance retains namespace identity and distinguishes the same-named foreign alias", () => {
  const project = projectOf({
    "canonical.ts": "export interface Row { readonly why: string }",
    "foreign.ts": "export interface Row { readonly why: string }",
    "subject.ts": [
      'import type * as Canonical from "./canonical.ts";',
      'import type { Row as Other } from "./foreign.ts";',
      "type Real = readonly Canonical.Row[];",
      "type Fake = readonly Other[];",
      "declare const real: Real;",
      "declare const fake: Fake;",
    ].join("\n"),
  });
  const source = file(project, "subject.ts");
  const atCanonicalHome = (name: string): boolean =>
    resolveTypeValueOrigins(source.getVariableDeclarationOrThrow(name).getTypeNodeOrThrow()).some(
      (fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, file(project, "canonical.ts")),
    );

  expect(atCanonicalHome("real")).toBe(true);
  expect(atCanonicalHome("fake")).toBe(false);
});

test.each([
  "[Row]",
  "[row: Row]",
  "[Row?]",
  "[...Row[]]",
  "[row?: Row, ...rows: Row[]]",
])("annotation provenance reads tuple element wrappers in %s", (tuple) => {
  const project = projectOf({
    "contract.ts": "export interface Row { readonly why: string }",
    "subject.ts": `import type { Row } from "./contract.ts";\ntype Rows = readonly ${tuple};\ndeclare const rows: Rows;`,
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("rows").getTypeNodeOrThrow());
  expect(facts.some((fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, file(project, "contract.ts")))).toBe(true);
});

test("annotation provenance preserves the missing leaf and refuses identities absorbed by its opaque union", () => {
  const project = projectOf({
    "present.ts": "export interface Present { value: string }",
    "subject.ts": ['import type { Missing as Leaf, Present } from "./present.ts";', "type Alias = Leaf | Present;", "declare const value: Alias;"].join("\n"),
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow());
  expect(facts.flatMap((fact) => (fact.kind === "unresolved" && fact.reason === "missing" ? [fact.node.getText()] : []))).toEqual(["Leaf"]);
  expect(
    facts.some((fact) => fact.kind === "unresolved" && fact.reason === "unsupported" && declaredByFile(fact.trace.declarations, file(project, "present.ts"))),
  ).toBe(true);
  expect(facts.some((fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, file(project, "present.ts")))).toBe(false);
});

test.each([
  "[readonly Local[], Phantom<Local>]",
  "[Phantom<Local>, readonly Local[]]",
])("annotation value semantics retains missing alias provenance in each path of %s", (annotation) => {
  const project = projectOf({
    "contract.ts": "export interface Present { why: string }",
    "subject.ts": `import type { Row } from "./contract.ts";\ntype Local = Row;\ntype Phantom<T> = string;\ndeclare const value: ${annotation};`,
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow());
  expect(facts.some((fact) => fact.kind === "unresolved" && fact.reason === "missing" && fact.node.getText() === "Row")).toBe(true);
});

test("annotation alias recursion refuses an opaque canonical candidate", () => {
  const project = projectOf({
    "contract.ts": "export interface Row { why: string }",
    "subject.ts": 'import type { Row } from "./contract.ts";\ntype Loop = Loop | Row;\ndeclare const value: Loop;',
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow());
  expect(facts.some((fact) => fact.kind === "unresolved" && fact.node.getText() === "Row")).toBe(true);
});

test.each(["Readonly<Row>", "Row | unknown", "Row | any"])("annotation value semantics refuses unproven canonical identity in %s", (annotation) => {
  const project = projectOf({
    "contract.ts": "export interface Row { why: string }",
    "subject.ts": `import type { Row } from "./contract.ts";\ndeclare const value: ${annotation};`,
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow());
  expect(facts.some((fact) => fact.kind === "unresolved" && declaredByFile(fact.trace.declarations, file(project, "contract.ts")))).toBe(true);
  expect(facts.some((fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, file(project, "contract.ts")))).toBe(false);
});

test("annotation value semantics follows mapped property values but not an erased mapped argument", () => {
  const project = projectOf({
    "contract.ts": "export interface Row { why: string }",
    "subject.ts": [
      'import type { Row } from "./contract.ts";',
      'type Phantom<T> = { [K in "label"]: string };',
      'declare const rows: Record<"first", Row>;',
      "declare const erased: Phantom<Row>;",
    ].join("\n"),
  });
  const source = file(project, "subject.ts");
  const rows = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("rows").getTypeNodeOrThrow());
  const erased = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("erased").getTypeNodeOrThrow());
  expect(rows.some((fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, file(project, "contract.ts")))).toBe(true);
  expect(erased.some((fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, file(project, "contract.ts")))).toBe(false);
  expect(erased.filter((fact) => fact.kind === "unresolved")).toEqual([]);
});

test("annotation containment distinguishes callable signatures from canonical data properties", () => {
  const project = projectOf({
    "contract.ts": "export interface Row { why: string }",
    "subject.ts": [
      'import type { Row } from "./contract.ts";',
      "type Reader = (row: Row) => Row;",
      "type Vocabulary = { row: Row };",
      "declare const reader: Reader;",
      "declare const vocabulary: Vocabulary;",
    ].join("\n"),
  });
  const source = file(project, "subject.ts");
  for (const name of ["reader", "vocabulary"]) {
    const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow(name).getTypeNodeOrThrow());
    expect(facts.some((fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, file(project, "contract.ts")))).toBe(name === "vocabulary");
  }
});

test.each([
  ["Readonly<{ child: Readonly<{ row: Row }> }>", ""],
  ["Box<Box<Row>>", "type Box<T> = { value: T };"],
  ["{ first: Row }", ""],
  ['Record<"first", Row>', ""],
  ["Readonly<{ first: Row }>", ""],
  ["Partial<{ first: Row }>", ""],
  ["Readonly<Vocabulary>", "interface Vocabulary { readonly first: Row }"],
  ["Readonly<Partial<{ nested: { rows: readonly Row[] } }>>", ""],
  ["Cycle", "interface Cycle { row?: Row; next?: Cycle }"],
  ["Left", "type Left = { right?: Right }; type Right = { left?: Left; row: Row };"],
])("annotation containment follows equivalent data wrappers and finite cycles in %s", (annotation, prelude) => {
  const project = projectOf({
    "contract.ts": "export interface Row { why: string }",
    "subject.ts": `import type { Row } from "./contract.ts";\n${prelude}\ndeclare const value: ${annotation};`,
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow());
  expect(
    facts.some((fact) => fact.kind === "resolved" && fact.value.name === "Row" && declaredByFile(fact.value.declarations, file(project, "contract.ts"))),
  ).toBe(true);
});

test.each([
  ['Holder["clean"]', "type Holder = { row: Row | unknown; clean: unknown };"],
  ['[Row["why"], unknown]', ""],
  ["Readonly<{ first: Local }>", "interface Local { why: string }"],
  ["{ read: (row: Row) => Row }", ""],
  ["{ read(row: Row): Row }", ""],
  ["{ key: keyof Table; erased: Phantom<Row>; opaque: unknown }", "type Phantom<T> = string;"],
  ["Cycle", "interface Cycle { next?: Cycle; row: { why: string } }"],
])("annotation containment excludes foreign, erased and callable paths in %s", (annotation, prelude) => {
  const project = projectOf({
    "contract.ts": "export interface Row { why: string }\nexport type Table = Readonly<Record<string, Row>>;",
    "subject.ts": `import type { Row, Table } from "./contract.ts";\n${prelude}\ndeclare const value: ${annotation};`,
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow());
  expect(facts.some((fact) => declaredByFile(fact.kind === "resolved" ? fact.value.declarations : fact.trace.declarations, file(project, "contract.ts")))).toBe(
    false,
  );
});

test.each([
  ['Holder["row"]', "type Holder = { row: Row | unknown; clean: unknown };"],
  ["{ row: Row | unknown }", ""],
  ["Opaque", "interface Opaque { row: Row | unknown }"],
  ["{ row: Readonly<Row> }", ""],
  ["{ row: Loop }", "type Loop = Loop | Row;"],
])("annotation containment refuses opaque canonical data provenance in %s", (annotation, prelude) => {
  const project = projectOf({
    "contract.ts": "export interface Row { why: string }",
    "subject.ts": `import type { Row } from "./contract.ts";\n${prelude}\ndeclare const value: ${annotation};`,
  });
  const source = file(project, "subject.ts");
  const facts = resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow());
  expect(facts.some((fact) => fact.kind === "unresolved" && declaredByFile(fact.trace.declarations, file(project, "contract.ts")))).toBe(true);
  expect(facts.some((fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, file(project, "contract.ts")))).toBe(false);
});

test("annotation containment excludes a canonical argument erased by an expanding recursive generic", () => {
  const project = projectOf({
    "canonical.ts": "export interface Row { why: string }",
    "subject.ts": 'import type { Row } from "./canonical.ts";\ntype Nested<T> = { next: Nested<T[]> };\ndeclare const value: Nested<Row>;',
  });
  const source = file(project, "subject.ts");
  const facts = withRecursiveTypeTripwire(() => resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow()));
  expect(
    facts.some((fact) => declaredByFile(fact.kind === "resolved" ? fact.value.declarations : fact.trace.declarations, file(project, "canonical.ts"))),
  ).toBe(false);
});

test.each([
  ["T", true, true],
  ["Readonly<T>", true, true],
] as const)("annotation containment preserves %s data evidence before an expanding recursive edge", (member, resolved, unresolved) => {
  const project = projectOf({
    "canonical.ts": "export interface Row { why: string }",
    "subject.ts": `import type { Row } from "./canonical.ts";\ntype Nested<T> = { value: ${member}; next: Nested<T[]> };\ndeclare const value: Nested<Row>;\nconst compilerRow: Row = value.next.value[0];`,
  });
  const source = file(project, "subject.ts");
  expect(source.getPreEmitDiagnostics()).toEqual([]);
  const facts = withRecursiveTypeTripwire(() => resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow()));
  expect(facts.some((fact) => fact.kind === "resolved" && declaredByFile(fact.value.declarations, file(project, "canonical.ts")))).toBe(resolved);
  expect(facts.some((fact) => fact.kind === "unresolved" && declaredByFile(fact.trace.declarations, file(project, "canonical.ts")))).toBe(unresolved);
});

test.each([
  ["type N<T, D> = { value: D; next: N<D, T[]> };", "N<Row, string>", { resolved: true }],
  ["type N<A, B, C> = { value: C; next: N<C, A, B[]> };", "N<Row, string, number>", { resolved: true }],
  ["type A<T, U> = { b: B<T, U> }; type B<T, U> = { value: U; a: A<U, T[]> };", "A<Row, string>", { resolved: true }],
  [
    "type N<T> = { value: T extends readonly unknown[] ? T[number] : never; next: N<T[]> }; declare const compilerValue: N<Row>; const compilerRow: Row = compilerValue.next.value;",
    "N<Row>",
    { resolved: true, unresolved: true },
  ],
  ["type N<T, D> = { value: D; next: N<D, T> };", "N<Row, string>", { resolved: true }],
  ["type N<T, D> = { value: Readonly<D>; next: N<D, T[]> };", "N<Row, { x: 1 }>", { resolved: true }],
  ["type N<T, D> = { value: Readonly<D>; next: N<D, T> };", "N<Row, string>", { resolved: false }],
  ["type N<A, B, C> = { value: A; next: N<{ k: B }, { k: C }, { k: A }> };", "N<string, number, Row>", { resolved: true }],
  ["type N<A, B, C, D> = { value: A; next: N<{ k: B }, { k: C }, { k: D }, { k: A }> };", "N<string, number, boolean, Row>", { resolved: true }],
  ["type N<A, B, C> = { value: A; next: N<Readonly<{ k: B }>, Readonly<{ k: C }>, Readonly<{ k: A }>> };", "N<string, number, Row>", { resolved: true }],
  ["type Box<T> = { k: T }; type N<A, B, C> = { value: A; next: N<Box<Box<B>>, Box<Box<C>>, Box<Box<A>>> };", "N<string, number, Row>", { resolved: true }],
  [
    'type Wrap<T> = { item: { k: T } }; type N<A, B, C> = { value: A; next: N<Wrap<B>["item"], Wrap<C>["item"], Wrap<A>["item"]> };',
    "N<string, number, Row>",
    { resolved: true },
  ],
  [
    "type Box<T> = { k: T }; type N<A, B, C> = { value: A; next: Box<N<Box<B>, Box<C>, Box<A>>> }; declare const edgeValue: N<string, number, Row>; const edgeRow: Row = edgeValue.next.k.next.k.value.k.k;",
    "N<string, number, Row>",
    { resolved: true },
  ],
  [
    "type N<A, B, C> = { value: A; next: Readonly<{ inner: N<Readonly<{ k: B }>, Readonly<{ k: C }>, Readonly<{ k: A }>> }> }; declare const edgeValue: N<string, number, Row>; const edgeRow: Row = edgeValue.next.inner.next.inner.value.k.k;",
    "N<string, number, Row>",
    { resolved: true },
  ],
  [
    "type Box<T> = { k: T }; type N<A, B, C> = { value: string; next: Box<N<Box<B>, Box<C>, Box<A>>> };",
    "N<string, number, Row>",
    { resolved: false, unresolved: false },
  ],
  [
    "type N<T, D> = { value: D } & { next: N<D, T[]> }; declare const intersectionValue: N<Row, string>; const intersectionRow: Row = intersectionValue.next.value[0];",
    "N<Row, string>",
    { resolved: true },
  ],
  ["type N<T, D> = { value: string } & { next: N<D, T[]> };", "N<Row, number>", { resolved: false, unresolved: false }],
  ["type N<A, B, C> = { value: string; next: N<{ k: B }, { k: C }, { k: A }> };", "N<string, number, Row>", { resolved: false, unresolved: false }],
  ["type B<T> = { value: T; next: B<T[]> }; type N<T> = { nested: B<T>; next: N<T[]> };", "N<Row>", { resolved: true }],
  ["type B<T> = { next: B<T[]> }; type N<T> = { nested: B<T>; next: N<T[]> };", "N<Row>", { resolved: false, unresolved: false }],
  ["type B<T> = { next: B<T[]> }; type N<T> = { next: N<T[]>; nested: B<T> };", "N<Row>", { resolved: false, unresolved: false }],
  ["type Box<T> = { k: T }; type N<T> = { next: Box<Box<N<T[]>>> };", "N<Row>", { resolved: false, unresolved: false }],
  ["type N<T = Row> = { next: N<T[]> };", "N", { resolved: false, unresolved: false }],
  ["type N<T> = { next: N<T[]> }; type Alias = N<Row>;", "Alias", { resolved: false, unresolved: false }],
  [
    "type Later<T extends unknown[]> = T extends [unknown, unknown, unknown] ? Row : string; type N<T extends unknown[]> = { value: Later<T>; next: N<[unknown, ...T]> }; declare const delayed: N<[]>; const compilerRow: Row = delayed.next.next.next.value;",
    "N<[]>",
    { resolved: false, unresolved: true },
  ],
  [
    "type N<T extends unknown[]> = { value: Row extends T[number] ? string : string; next: N<[unknown, ...T]> };",
    "N<[]>",
    { resolved: false, unresolved: false },
  ],
] as const)("annotation containment follows parameter recurrence in %s", (prelude, annotation, expected) => {
  const project = projectOf({
    "canonical.ts": "export interface Row { why: string }",
    "subject.ts": `import type { Row } from "./canonical.ts";\n${prelude}\ndeclare const value: ${annotation};`,
  });
  const source = file(project, "subject.ts");
  expect(source.getPreEmitDiagnostics()).toEqual([]);
  const facts = withRecursiveTypeTripwire(() => resolveTypeValueOrigins(source.getVariableDeclarationOrThrow("value").getTypeNodeOrThrow()));
  const canonical = facts.filter((fact) =>
    declaredByFile(fact.kind === "resolved" ? fact.value.declarations : fact.trace.declarations, file(project, "canonical.ts")),
  );
  expect({
    resolved: canonical.some((fact) => fact.kind === "resolved"),
    unresolved: canonical.some((fact) => fact.kind === "unresolved"),
  }).toMatchObject(expected);
});

test("an empty declaration set is never a home — the fail-closed floor under both matchers", () => {
  const project = projectOf({ "j.ts": "export const g = 1;\n" });

  expect(declaredByPackage([], "@vendor/cache")).toBe(false);
  expect(declaredByAnyPackage([], ["@vendor/cache"])).toBe(false);
  expect(declaredByFile([], file(project, "j.ts"))).toBe(false);
});

// ── THE BINDING-PATTERN TWIN (#2097 / #2194) ────────────────────────────────────────────────────────
// `resolveTypePropertyOrigin` exists because a destructure has NO member-access node: its subject is a
// `BindingElement`, so `resolveTypeMemberOrigin` cannot be asked at all and three modules were finishing
// `type.getProperty(name)?.getDeclarations()` themselves. These two arms walk the reader the way its callers
// do — from the BindingElement to its VariableDeclaration's initializer — and pin the fail-closed floor,
// which is the half that matters: an unreadable receiver must REFUSE, never come back as an empty set that
// reads exactly like "declared somewhere else".
function destructuredInitializer(source: SourceFile, name: string): Node {
  const binding = source.getDescendantsOfKind(SyntaxKind.BindingElement).find((element) => element.getName() === name);
  if (binding === undefined) {
    throw new Error(`no BindingElement named ${name}`);
  }
  const initializer = binding.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
  if (initializer === undefined) {
    throw new Error(`the BindingElement named ${name} has no VariableDeclaration initializer`);
  }
  return initializer;
}

test("a DESTRUCTURED property resolves to the same declaration home the dotted read gives", () => {
  const project = projectOf({
    "o.ts": [
      'import type { Cache } from "@vendor/cache";',
      "export function vendor(cache: Cache): void {",
      "  const { setQueryData } = cache;",
      "  setQueryData('k', 1);",
      "}",
    ].join("\n"),
    "p.ts": [
      "interface LocalCache { setQueryData(key: string, value: unknown): void }",
      "export function local(cache: LocalCache): void {",
      "  const { setQueryData } = cache;",
      "  setQueryData('k', 1);",
      "}",
    ].join("\n"),
  });

  const vendor = expectResolved(resolveTypePropertyOrigin(destructuredInitializer(file(project, "o.ts"), "setQueryData"), "setQueryData"));
  const local = expectResolved(resolveTypePropertyOrigin(destructuredInitializer(file(project, "p.ts"), "setQueryData"), "setQueryData"));

  // Same spelling, two identities — the pair the whole module exists for, now answerable without a
  // member-access node. The negative package is the planted control on the matcher itself.
  expect(declaredByPackage(vendor.value, "@vendor/cache")).toBe(true);
  expect(declaredByPackage(vendor.value, "@vendor/other")).toBe(false);
  expect(declaredByPackage(local.value, "@vendor/cache")).toBe(false);
  expect(declaredByFile(local.value, file(project, "p.ts"))).toBe(true);
});

test("a destructure the checker cannot place REFUSES as missing — never an empty declaration set", () => {
  const project = projectOf({
    "q.ts": [
      "declare const opaque: Record<never, never>;",
      "export function ghost(): void {",
      "  const { setQueryData } = opaque as Record<never, never>;",
      "  void setQueryData;",
      "}",
    ].join("\n"),
  });
  const fact = resolveTypePropertyOrigin(destructuredInitializer(file(project, "q.ts"), "setQueryData"), "setQueryData");

  // FAIL-CLOSED: the open-coded chain this reader replaced answered `[]` here, which `declaredByPackage`
  // then turned into a confident "not this package" — a refusal wearing a verdict's clothes.
  expect(fact).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(fact.kind === "unresolved" ? fact.detail : "").toContain("setQueryData");
});
