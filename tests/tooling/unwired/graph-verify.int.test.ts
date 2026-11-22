// verify asks find-references about a member bucket's findings: only a product read of the finding's own symbol refutes
// it, so a literal's write, though find-references lists it, leaves the finding confirmed, and so does a narrowed read
// of a union's sibling arm, which find-references joins to every arm.
import { expect, test } from "@orb/testkit/tooling";
import { verifyGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/verify.ts`;

test("a write find-references lists confirms a write-only finding; it is no read", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface A { readonly x: string; readonly a: string }",
        'export const made: A = { x: "1", a: "1" };',
        "export const xOf = (value: A): string => value.x;",
      ].join("\n"),
    }),
  );
  const { verification } = await verifyGraph(root, { bucket: "member-write-only", sample: null }, () => undefined);
  expect(verification.entries.map(({ label, verdict, refs }) => [label, verdict, refs])).toEqual([[`${FILE}:A.a`, "confirmed", 1]]);
});

test("a read of a narrowed sibling arm's same-named member is no read of the flagged arm", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        'export type Part = { readonly kind: "a"; readonly summary: string } | { readonly kind: "b"; readonly summary: string };',
        'export const parts: readonly Part[] = [{ kind: "a", summary: "x" }, { kind: "b", summary: "y" }];',
        'export const shown = (part: Part): string => (part.kind === "b" ? part.summary : "");',
      ].join("\n"),
    }),
  );
  const { verification } = await verifyGraph(root, { bucket: "member-write-only", sample: null }, () => undefined);
  expect(verification.entries.map(({ label, verdict }) => [label, verdict])).toEqual([[`${FILE}:Part.summary`, "confirmed"]]);
});
