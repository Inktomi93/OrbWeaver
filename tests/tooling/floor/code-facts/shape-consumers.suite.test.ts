// Matched controls for shape-reader consumers: discovery modes, provenance, and existing gate judgments.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind } from "ts-morph";
import { assignabilityChecker, respellHitsFor, shapesUnder } from "../../../../tooling/src/ast/lib/respell-shapes.ts";
import { gate as baseUiData } from "../../../../tooling/src/verify/gates/baseui-derives-not-respells.ts";
import { gate as baseUiHandlers } from "../../../../tooling/src/verify/gates/baseui-derives-not-respells-health.ts";
import { gate as derives } from "../../../../tooling/src/verify/gates/contract-derives-not-respells.ts";
import { gate as copies } from "../../../../tooling/src/verify/gates/contract-structural-copy.ts";
import { gate as domainInterfaces } from "../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as packageInterfaces } from "../../../../tooling/src/verify/gates/no-inline-package-interface.ts";
import { gate as inlineTypes } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as wireInterfaces } from "../../../../tooling/src/verify/gates/no-inline-wire-interface.ts";
import { gate as fabrication } from "../../../../tooling/src/verify/gates/no-test-fabrication.ts";
import { gate as handShapes } from "../../../../tooling/src/verify/gates/test-hand-shape.ts";
import { gate as zodIssues } from "../../../../tooling/src/verify/gates/zod-error-issues-home.ts";
import { gate as zodSpellings } from "../../../../tooling/src/verify/gates/zod-modern-spellings.ts";
import { candidateFields, contractFields } from "../../../../tooling/src/verify/lib/contract-structural-copy.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("respell and copy retain distinct intersection and class field populations", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    "/repo/packages/contracts/src/chat/shapes.ts",
    `
interface Parent { inherited: string; }
export class Row implements Parent {
  inherited = "base";
  a = "a";
  b = 1;
  static ignored = true;
  method(): void {}
  constructor(public c: boolean) {}
}
export type Joined = { a: string; b: number } & { c: boolean; d: string };
export type Own = { a: string; b: number; c: boolean; d: string; derived: Parent["inherited"]; run: () => void; method(): void };
`,
  );
  expect(shapesUnder(project, "/packages/contracts/src/chat/").map(({ name, fields }) => [name, fields.map((field) => field.name)])).toEqual([
    ["Row", ["inherited", "a", "b", "c"]],
    ["Own", ["a", "b", "c", "d", "derived", "run", "method"]],
  ]);
  expect([...(contractFields(file.getTypeAliasOrThrow("Joined")) ?? [])]).toEqual(["a", "b", "c", "d"]);
  const literal = file.getTypeAliasOrThrow("Own").getTypeNodeOrThrow().asKindOrThrow(SyntaxKind.TypeLiteral);
  expect([...(candidateFields(literal) ?? [])]).toEqual(["a", "b", "c", "d"]);
});

test("respell distinguishes alias provenance from a same-named or nested divergent type", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(
    "/repo/packages/contracts/src/chat/shapes.ts",
    `
export interface Owner { a: string; b: number; meta: { tags: string[] }; }
export interface Coincidental { a: string; b: number; meta: { tags: string[] }; }
`,
  );
  project.createSourceFile(
    "/repo/packages/server/src/domain/chat/contract/shapes.ts",
    `
import type { Owner } from "../../../../../contracts/src/chat/shapes.ts";
export type Derived = Owner;
export interface Copy { a: string; b: number; meta: { tags: string[] }; }
export interface Divergent { a: string; b: number; meta: { tags: number[] }; }
`,
  );
  expect(respellHitsFor(project, assignabilityChecker(project), "chat").map(({ text }) => text)).toEqual([
    "Derived  ≡  @orb/contracts/chat::Coincidental",
    "Copy  ≡  @orb/contracts/chat::Owner",
    "Copy  ≡  @orb/contracts/chat::Coincidental",
  ]);
});

test(
  "migrated shape policy consumers retain their catch, near-miss and refusal rows",
  () => {
    expect(
      verifyPolicyProofs([
        copies,
        derives,
        handShapes,
        fabrication,
        inlineTypes,
        domainInterfaces,
        packageInterfaces,
        wireInterfaces,
        baseUiData,
        baseUiHandlers,
        zodSpellings,
        zodIssues,
      ]),
    ).toEqual([]);
  },
  scaledBudget(120_000),
);
