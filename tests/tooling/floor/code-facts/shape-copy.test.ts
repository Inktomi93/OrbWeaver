import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { compareShapeFields, indexByField, shapesIdentical } from "@orb/tooling/floor/code-facts/shape-copy";
import type { ShapeCopyCandidate } from "@orb/tooling/floor/code-facts/shape-copy-contract";
import { shapeDerivesFrom } from "@orb/tooling/floor/code-facts/shape-derivation";
import type { TypeAliasDeclaration } from "ts-morph";
import { Project } from "ts-morph";
import { assignabilityChecker } from "../../../../tooling/src/ast/lib/respell-shapes.ts";
import { bestCopyMatch, candidateFields, contractFields, createFieldAgreement } from "../../../../tooling/src/verify/lib/contract-structural-copy.ts";

test("the copy consumer preserves exact, subset, drift and rank decisions on a bounded corpus", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    "/shape-copy/corpus.ts",
    `
export interface Owner { a: string; b: number; c: boolean; d: string; e: number; }
export interface Small { a: string; b: number; c: boolean; d: string; }
interface Exact { a: string; b: number; c: boolean; d: string; e: number; }
interface Subset { a: string; b: number; c: boolean; d: string; }
interface Drift { a: string; b: number; c: boolean; d: string; other: number; }
interface Retyped { a: string; b: string; c: boolean; d: string; e: number; }
interface NoMatch { a: number; b: string; c: string; d: number; e: string; }
interface TooFew { a: string; b: number; c: boolean; }
`,
  );
  const sources = ["Owner", "Small"].map((name) => {
    const decl = file.getInterfaceOrThrow(name);
    const fields = contractFields(decl);
    if (fields === undefined) {
      throw new Error("missing source fields");
    }
    return { name, file: "corpus.ts", decl, fields };
  });
  const index = indexByField(sources);
  const agree = createFieldAgreement("bounded-copy", project.getTypeChecker());
  const answers = ["Exact", "Subset", "Drift", "Retyped", "NoMatch", "TooFew"].map((name) => {
    const decl = file.getInterfaceOrThrow(name);
    const fields = candidateFields(decl);
    if (fields === undefined) {
      return [name, null];
    }
    const copy = bestCopyMatch({ decl, fields }, index, agree);
    return [name, copy === undefined ? null : [copy.contract.name, copy.shared, copy.agreeing, copy.exact]];
  });
  expect(answers).toEqual([
    ["Exact", ["Owner", 5, 5, true]],
    ["Subset", ["Small", 4, 4, true]],
    ["Drift", null],
    ["Retyped", ["Owner", 5, 4, true]],
    ["NoMatch", null],
    ["TooFew", null],
  ]);
});

test("the comparer asks the agreement once per shared name in left order; identity is strict while copy agreement is lenient", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    "/shape-copy/pair.ts",
    `
export interface Owner { a: string; b: number; c: boolean; d: string; }
interface Optional { d?: string; a: string; c: boolean; b: number; }
interface Narrow { b: number; z: string; a: string; }
`,
  );
  const side = (name: string, fields: readonly string[]): ShapeCopyCandidate => ({ decl: file.getInterfaceOrThrow(name), fields: new Set(fields) });
  const owner = side("Owner", ["a", "b", "c", "d"]);
  const optional = side("Optional", ["d", "a", "c", "b"]);
  const partial = side("Narrow", ["b", "z", "a"]);
  const lenient = createFieldAgreement("bounded-copy", project.getTypeChecker());
  const asked: string[] = [];
  const recorded = (left: Parameters<typeof lenient>[0], right: Parameters<typeof lenient>[1], field: string): boolean => {
    asked.push(field);
    return lenient(left, right, field);
  };
  expect(compareShapeFields(partial, owner, recorded)).toEqual({ shared: ["b", "a"], agreeing: ["b", "a"], exact: false });
  expect(asked).toEqual(["b", "a"]);
  expect(compareShapeFields(optional, owner, lenient)).toEqual({ shared: ["d", "a", "c", "b"], agreeing: ["d", "a", "c", "b"], exact: true });
  const refuse = (kind: string): never => {
    throw new Error(kind);
  };
  const strict = { checker: assignabilityChecker(project), refuse };
  expect(shapesIdentical(strict, optional, owner)).toBe(false);
  expect(shapesIdentical(strict, side("Owner", ["d", "c", "b", "a"]), owner)).toBe(true);
  expect(shapesIdentical(strict, partial, owner)).toBe(false);
});

test("pair derivation joins direct targets with shared typeof provenance and never matching structure", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    "/shape-copy/derive.ts",
    `
type Out<T> = T extends { _output: infer O } ? O : never;
declare const schema: { _output: { a: string; b: number } };
declare const other: { _output: { a: string; b: number } };
export interface Owner { a: string; b: number; }
export interface Twin { a: string; b: number; }
export type Alias = Owner;
export interface Heir extends Owner {}
export type First = Out<typeof schema>;
export type Second = Out<typeof schema>;
export type Elsewhere = Out<typeof other>;
`,
  );
  const alias = (name: string): TypeAliasDeclaration => file.getTypeAliasOrThrow(name);
  const owner = file.getInterfaceOrThrow("Owner");
  expect(shapeDerivesFrom(alias("Alias"), owner)).toBe(true);
  expect(shapeDerivesFrom(file.getInterfaceOrThrow("Heir"), owner)).toBe(true);
  expect(shapeDerivesFrom(alias("First"), alias("Second"))).toBe(true);
  expect(shapeDerivesFrom(alias("First"), alias("Elsewhere"))).toBe(false);
  expect(shapeDerivesFrom(file.getInterfaceOrThrow("Twin"), owner)).toBe(false);
  expect(shapeDerivesFrom(owner, alias("Alias"))).toBe(false);
});
