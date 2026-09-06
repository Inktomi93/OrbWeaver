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
  resolveTypeIdentityOrigin,
  resolveTypeMemberOrigin,
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

test("an empty declaration set is never a home — the fail-closed floor under both matchers", () => {
  const project = projectOf({ "j.ts": "export const g = 1;\n" });

  expect(declaredByPackage([], "@vendor/cache")).toBe(false);
  expect(declaredByAnyPackage([], ["@vendor/cache"])).toBe(false);
  expect(declaredByFile([], file(project, "j.ts"))).toBe(false);
});
