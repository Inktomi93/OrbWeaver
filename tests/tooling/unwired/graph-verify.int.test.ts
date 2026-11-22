// verify asks find-references about a member bucket's findings: only a product read of the finding's own symbol refutes
// it, so a literal's write, though find-references lists it, leaves the finding confirmed, and so does a narrowed read
// of a union's sibling arm, which find-references joins to every arm.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { SyntaxKind } from "@typescript/native/ast";
import { FRESH_BUILD, verifyGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, WORLD } from "./_planted.ts";

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

// A run from a dump verifies against the tree it opens now. Snap's read refutes a finding the same as a product read
// (state.ts holds the ruling), and another tool's read leaves its finding confirmed; the chain trace names each read's
// syntax up to its file.
test("a snap read refutes a write-only finding, another tool's read does not, and the chain trace shows each read", { timeout: 120_000 }, async ({
  plantedTree,
  scratch,
}) => {
  const snapProbe = "tooling/src/snap/probe.ts";
  const auditProbe = "tooling/src/audit/probe.ts";
  const root = await plantedTree(
    graphTree({
      [FILE]: ["export interface Shown { readonly seen: string; readonly other: string }", 'export const shown: Shown = { seen: "s", other: "o" };'].join("\n"),
      "tsconfig.world-browser.json": JSON.stringify({ extends: `./${WORLD}`, include: [snapProbe, auditProbe] }),
      [snapProbe]: "export const seen = 0;",
      [auditProbe]: "export const other = 0;",
    }),
  );
  const Chain = [
    SyntaxKind.Identifier,
    SyntaxKind.PropertyAccessExpression,
    SyntaxKind.VariableDeclaration,
    SyntaxKind.VariableDeclarationList,
    SyntaxKind.VariableStatement,
    SyntaxKind.SourceFile,
  ]
    .map((kind) => SyntaxKind[kind])
    .join("<");
  const dump = join(scratch, "graph.dump");
  const check = { bucket: "member-write-only", sample: null } as const;
  const before = await verifyGraph(root, check, () => undefined, { ...FRESH_BUILD, dump });
  expect(before.verification.entries.map(({ label, verdict }) => [label, verdict])).toEqual([
    [`${FILE}:Shown.seen`, "confirmed"],
    [`${FILE}:Shown.other`, "confirmed"],
  ]);
  writeFileSync(join(root, snapProbe), `import { shown } from "../../../${FILE}";\nexport const seen = shown.seen;`);
  writeFileSync(join(root, auditProbe), `import { shown } from "../../../${FILE}";\nexport const other = shown.other;`);
  const after = await verifyGraph(root, check, () => undefined, { ...FRESH_BUILD, from: dump, traces: [{ kind: "verify-chain" }] });
  expect(after.verification.entries.map(({ label, verdict, reads, chains }) => [label, verdict, reads, chains])).toEqual([
    [`${FILE}:Shown.seen`, "refuted", [`${snapProbe}:2`], [Chain]],
    [`${FILE}:Shown.other`, "confirmed", [], []],
  ]);
});
