import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { indexByField } from "@orb/tooling/floor/code-facts/shape-copy";
import { Project } from "ts-morph";
import {
  bestCopyMatch,
  bestOverlapMatch,
  candidateFields,
  contractFields,
  createFieldAgreement,
} from "../../../../tooling/src/verify/lib/contract-structural-copy.ts";

test("the copy consumers preserve exact, subset, drift and rank decisions on a bounded corpus", () => {
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
      return [name, null, null];
    }
    const own = { decl, fields };
    const copy = bestCopyMatch(own, index, agree);
    const overlap = bestOverlapMatch(own, index, agree);
    return [
      name,
      copy === undefined ? null : [copy.contract.name, copy.shared, copy.agreeing, copy.exact],
      overlap === undefined ? null : [overlap.contract.name, overlap.shared, overlap.agreeing, overlap.exact],
    ];
  });
  expect(answers).toEqual([
    ["Exact", ["Owner", 5, 5, true], ["Owner", 5, 5, false]],
    ["Subset", ["Small", 4, 4, true], ["Owner", 4, 4, false]],
    ["Drift", null, ["Owner", 4, 4, false]],
    ["Retyped", ["Owner", 5, 4, true], ["Owner", 5, 4, false]],
    ["NoMatch", null, null],
    ["TooFew", null, null],
  ]);
});
