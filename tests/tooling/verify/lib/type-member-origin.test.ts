// The TYPE-level origin readers answer the question the VALUE walk structurally cannot: a receiver minted
// by a call (`useTRPC()`, `useQueryClient()`, a store hook, a form api) has no module origin, so the only
// identity available is the declaration home of the property symbol the checker resolved. Every control
// here is a same-SPELLING/different-IDENTITY pair — a local lookalike interface, a second module exporting
// the same type name — because that pair is the whole reason the readers exist.
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { ReferenceFact, ResolvedReferenceFact } from "../../../../tooling/src/verify/contract/reference-fact.ts";
import {
  declaredByAnyPackage,
  declaredByFile,
  declaredByPackage,
  resolveContextualMemberOrigin,
  resolveTypeIdentityChain,
  resolveTypeIdentityOrigin,
  resolveTypeMemberOrigin,
  resolveTypePropertyOrigin,
} from "../../../../tooling/src/verify/lib/type-member-origin.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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
