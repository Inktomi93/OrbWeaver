// test-hand-shape coverage and authority through the production pass: every direct site is judged or UNKNOWN,
// an UNKNOWN is never a finding, and the committed grant table and budget admit no hand shape.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, ts } from "ts-morph";
import { vi } from "vitest";
import { SHAPE_ASSOCIATION_UNKNOWN } from "../../../../tooling/src/floor/code-facts/shape-association-contract.ts";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { PolicyPassInput, PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as messageKindCoverage } from "../../../../tooling/src/verify/gates/message-kind-policy-coverage.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-hand-shape.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { WAIVER_BUDGET } from "../../../../tooling/src/verify/lib/waiver-budget.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const questionModule = await import("../../../../tooling/src/floor/code-facts/type-observation-questions.ts");
const observeRaw = questionModule.observeRawQuestions;

const OWNER = "packages/contracts/src/chat/owner.ts";
const HELPER = "tests/e2e/support/owner.ts";
const OPERATION = `boundary:Hand=${OWNER}#Owner`;

// The coverage assertions name lines in this source; keep its line order.
const HELPER_SOURCE = `import type { Owner } from "../../../packages/contracts/src/chat/owner";
import { take } from "../../../packages/contracts/src/chat/owner";
interface Hand { readonly value: string }
declare const hand: Hand;
declare const loose: any;
declare const maybe: Hand | undefined;
declare const flag: boolean;
export const seen: Owner = hand;
take(loose);
export const carried: Owner | undefined = maybe;
export const kept: boolean = flag;
`;

const OWNER_SOURCE = `export interface Owner { readonly value: string }
export function take(owner: Owner): void { void owner; }
export function takeRows(rows: readonly Owner[]): void { void rows; }
export function takeNames(names: readonly string[]): void { void names; }
export function takeAll<T extends Owner>(owner: T): void { void owner; }
export type Factory = () => Owner;
export function make(factory: () => Owner): void { void factory; }
export function onRow(callback: (row: Owner) => void): void { void callback; }
`;

function pass(repoRoot: string, overrides: Partial<PolicyPassInput> = {}, helper = HELPER_SOURCE): PolicyPassResult {
  const root = join(repoRoot, ".orb-hand-shape-control");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  });
  project.createSourceFile(join(root, OWNER), OWNER_SOURCE);
  const file = project.createSourceFile(join(root, HELPER), helper);
  expect(project.getPreEmitDiagnostics().filter((diagnostic) => diagnostic.getSourceFile() === file)).toEqual([]);
  return runPolicyPass({
    root,
    project,
    policies: [gate],
    knownPolicies: [gate],
    reviewedGrants: [],
    failOnWarnings: true,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    ...overrides,
  });
}

test("each direct site is judged or reported UNKNOWN, and only the witnessed production boundary is a finding", ({ repoRoot }) => {
  const result = pass(repoRoot);
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file: HELPER, line: 3, token: "Hand", operation: OPERATION }]);
  expect(result.authority.verdict).toMatchObject({ errors: 1, blocking: 1 });
  expect(result.policies[0]?.analysis).toEqual({
    supported: 2,
    unknown: [
      { file: HELPER, line: 9, column: 6, token: "loose", reason: SHAPE_ASSOCIATION_UNKNOWN.erasedValue },
      { file: HELPER, line: 10, column: 43, token: "maybe", reason: SHAPE_ASSOCIATION_UNKNOWN.unionHand },
    ],
  });
});

test("the committed grants and budget admit no hand shape: the real table is silent and a new grant row alarms", ({ repoRoot }) => {
  expect(pass(repoRoot, { reviewedGrants: reviewedGrantsFor([gate]), waiverBudget: WAIVER_BUDGET }).authority.authorityAlarms).toEqual([]);
  const planted: ReviewedGateGrant = { id: `${gate.id}:planted`, policyId: gate.id, subject: HELPER, operation: OPERATION, why: "w", endsWhen: "e" };
  const granted = pass(repoRoot, { reviewedGrants: [planted], waiverBudget: WAIVER_BUDGET });
  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.authorityAlarms).toMatchObject([{ kind: "waiver-budget", policyId: gate.id, budget: 0, count: 1 }]);
});

const PROBE_HEAD = `import type { Factory, Owner } from "../../../packages/contracts/src/chat/owner";
import { make, onRow, take, takeAll, takeNames, takeRows } from "../../../packages/contracts/src/chat/owner";
interface Hand { readonly value: string }
declare const hand: Hand;
declare const loose: any;
`;
const U = SHAPE_ASSOCIATION_UNKNOWN;

// Each probe ends in the sites it judges; `findings` are the flagged hand names and `unknown` the UNKNOWN reasons.
const PROBES: readonly { readonly name: string; readonly body: string; readonly findings: readonly string[]; readonly unknown: readonly string[] }[] = [
  { name: "direct annotation", body: "export const seen: Owner = hand;", findings: ["Hand"], unknown: [] },
  { name: "local alias of a production type", body: "type Page = Owner;\nexport const seen: Page = hand;", findings: ["Hand"], unknown: [] },
  { name: "erased value at a local alias", body: "type Page = Owner;\nexport const seen: Page = loose;", findings: [], unknown: [U.erasedValue] },
  { name: "erased value at a library wrapper", body: "export const seen: Readonly<Owner> = loose;", findings: [], unknown: [U.erasedValue] },
  { name: "hand at a library wrapper", body: "export const seen: Partial<Owner> = hand;", findings: [], unknown: [U.unsupportedBoundary] },
  {
    name: "array of hands at an array boundary",
    body: "declare const rows: Hand[];\nexport const seen: Owner[] = rows;",
    findings: [],
    unknown: [U.opaqueValue],
  },
  { name: "array of hands as an argument", body: "declare const rows: Hand[];\ntakeRows(rows);", findings: [], unknown: [U.opaqueValue] },
  { name: "array of hands at its own boundary", body: "declare const rows: Hand[];\nexport const kept: readonly Hand[] = rows;", findings: [], unknown: [] },
  { name: "array of primitives", body: "declare const names: string[];\ntakeNames(names);", findings: [], unknown: [] },
  {
    name: "promise of a hand",
    body: "declare const pending: Promise<Hand>;\nexport const seen: Promise<Owner> = pending;",
    findings: [],
    unknown: [U.opaqueValue],
  },
  {
    name: "closed library type",
    body: "declare const pattern: RegExp;\nexport const seen: RegExp = pattern;\nexport const erased: RegExp = loose;",
    findings: [],
    unknown: [],
  },
  {
    name: "union carrying an array of hands",
    body: "declare const rows: Hand[] | undefined;\nexport const seen: Owner[] | undefined = rows;",
    findings: [],
    unknown: [U.unionHand],
  },
  {
    name: "intersection with a hand",
    body: "declare const both: Hand & { readonly extra: number };\nexport const seen: Owner = both;",
    findings: [],
    unknown: [U.opaqueValue],
  },
  {
    name: "union carrying an intersection with a hand",
    body: "declare const both: (Hand & { readonly extra: number }) | undefined;\nexport const seen: Owner | undefined = both;",
    findings: [],
    unknown: [U.unionHand],
  },
  {
    name: "generic handwritten interface",
    body: "interface GHand<T> { readonly value: T }\ndeclare const g: GHand<string>;\nexport const seen: Owner = g;",
    findings: ["GHand"],
    unknown: [],
  },
  { name: "type-parameter value", body: "export function f<T extends Hand>(x: T): Owner { return x; }", findings: [], unknown: [U.erasedValue] },
  {
    name: "union alias carrying a hand",
    body: "type MaybeHand = Hand | null;\ndeclare const m: MaybeHand;\nexport const raw: Owner | null = m;",
    findings: [],
    unknown: [U.unionHand],
  },
  {
    name: "union of a hand and its owner",
    body: "declare const m: Hand | Owner;\nexport const seen: Owner = m;\ntake(m);",
    findings: [],
    unknown: [U.unionHand, U.unionHand],
  },
  {
    name: "library alias of a hand",
    body: "declare const r: Readonly<Hand>;\nexport const seen: Readonly<Owner> = r;",
    findings: [],
    unknown: [U.opaqueValue],
  },
  {
    name: "record of hands",
    body: "declare const rec: Record<string, Hand>;\nexport const seen: Record<string, Owner> = rec;",
    findings: [],
    unknown: [U.opaqueValue],
  },
  { name: "map of hands", body: "declare const map: Map<string, Hand>;\nexport const seen: Map<string, Owner> = map;", findings: [], unknown: [U.opaqueValue] },
  {
    name: "nesting within the walk depth",
    body: "declare const deep: string[][][];\nexport const seen: Owner | readonly unknown[] = deep;",
    findings: [],
    unknown: [],
  },
  {
    name: "nesting past the walk depth",
    body: "declare const deeper: string[][][][][];\nexport const seen: Owner | readonly unknown[] = deeper;",
    findings: [],
    unknown: [U.opaqueValue],
  },
  {
    name: "function value at a production function alias",
    body: "declare const fn: () => Hand;\nexport const seen: Factory = fn;",
    findings: [],
    unknown: [U.opaqueValue],
  },
  { name: "function argument at a production function parameter", body: "declare const fn: () => Hand;\nmake(fn);", findings: [], unknown: [U.opaqueValue] },
  { name: "callback at a production callback parameter", body: "onRow((row: Hand) => {\n  void row;\n});", findings: [], unknown: [U.opaqueValue] },
  { name: "callback at a library callback parameter", body: "[hand].forEach((row: Hand) => {\n  void row;\n});", findings: [], unknown: [] },
  { name: "hand at a constrained generic production parameter", body: "takeAll(hand);", findings: [], unknown: [U.genericParameter] },
  {
    name: "stated limit: a test class is no judged hand",
    body: 'class FakeOwner {\n  readonly value = "";\n}\nexport const seen: Owner = new FakeOwner();',
    findings: [],
    unknown: [],
  },
  { name: "erased argument", body: "take(loose);", findings: [], unknown: [U.erasedValue] },
  {
    name: "method call argument at a production parameter",
    body: "class Svc {\n  m(owner: Owner): void {\n    void owner;\n  }\n}\ndeclare const svc: Svc;\nsvc.m(hand);",
    findings: ["Hand"],
    unknown: [],
  },
  {
    name: "constructor argument is counted, never silent",
    body: "class Svc {\n  constructor(owner: Owner) {\n    void owner;\n  }\n}\nexport const svc = new Svc(hand);",
    findings: [],
    unknown: [U.constructedParameter],
  },
  {
    name: "annotated class property initializer",
    body: "export class Holder {\n  readonly owner: Owner = hand;\n}",
    findings: ["Hand"],
    unknown: [],
  },
  { name: "annotated parameter default", body: "export function f(owner: Owner = hand): void {\n  void owner;\n}", findings: ["Hand"], unknown: [] },
  {
    name: "interface extending a hand follows its heritage",
    body: "interface H2 extends Hand {\n  readonly extra: number;\n}\ndeclare const h2: H2;\nexport const seen: Owner = h2;",
    findings: ["H2"],
    unknown: [],
  },
  {
    name: "interface chain over a hand follows its heritage",
    body: "interface H2 extends Hand {\n  readonly extra: number;\n}\ninterface H3 extends H2 {\n  readonly more: number;\n}\ndeclare const h3: H3;\nexport const seen: Owner = h3;",
    findings: ["H3"],
    unknown: [],
  },
  {
    name: "interface extending an alias of a hand follows the alias",
    body: "type HA = Hand;\ninterface H2 extends HA {\n  readonly extra: number;\n}\ndeclare const h2: H2;\nexport const seen: Owner = h2;",
    findings: ["H2"],
    unknown: [],
  },
  {
    name: "interface extending a library wrapper of a hand is counted, never derived",
    body: "interface H2 extends Readonly<Hand> {\n  readonly extra: number;\n}\ndeclare const h2: H2;\nexport const seen: Owner = h2;",
    findings: [],
    unknown: [U.unclassifiedBase],
  },
  {
    name: "interface extending a hand and the production owner stays derived",
    body: "interface Both extends Hand, Owner {\n  readonly extra: number;\n}\ndeclare const both: Both;\nexport const seen: Owner = both;",
    findings: [],
    unknown: [],
  },
  {
    name: "interface extending a library class stays derived",
    body: "interface Failure extends Error {\n  readonly value: string;\n}\ndeclare const failure: Failure;\nexport const seen: Owner = failure;",
    findings: [],
    unknown: [],
  },
  {
    name: "interface extending a library wrapper of the owner stays derived",
    body: "interface Wrapped extends Omit<Owner, never> {\n  readonly extra: number;\n}\ndeclare const wrapped: Wrapped;\nexport const seen: Owner = wrapped;",
    findings: [],
    unknown: [],
  },
  {
    name: "interface extending the production owner stays derived",
    body: "interface Derived extends Owner {\n  readonly extra: number;\n}\ndeclare const derived: Derived;\nexport const seen: Owner = derived;",
    findings: [],
    unknown: [],
  },
  { name: "stated limit: an object literal spread has no declared identity", body: "export const seen: Owner = { ...hand };", findings: [], unknown: [] },
  {
    name: "stated limit: a property-level flow has no declared identity",
    body: "export const seen: { readonly inner: Owner } = { inner: hand };",
    findings: [],
    unknown: [],
  },
];

test(
  "the shape-constituents walk is demanded only by this policy, not by another native-question consumer",
  ({ repoRoot }) => {
    const asked: string[] = [];
    const observe = vi.spyOn(questionModule, "observeRawQuestions").mockImplementation((demand, ...rest) => {
      asked.push(...(demand.questions ?? []).map((question) => question.kind));
      return observeRaw(demand, ...rest);
    });
    try {
      expect(pass(repoRoot).toolErrors).toEqual([]);
      expect(asked).toContain("shape-constituents");
      asked.length = 0;
      expect(verifyPolicyProofs([messageKindCoverage])).toEqual([]);
      expect(asked.length).toBeGreaterThan(0);
      expect(asked).not.toContain("shape-constituents");
    } finally {
      observe.mockRestore();
    }
  },
  scaledBudget(60_000),
);

for (const { name, body, findings, unknown } of PROBES) {
  test(`probe: ${name}`, ({ repoRoot }) => {
    const result = pass(repoRoot, {}, `${PROBE_HEAD}${body}\n`);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings.map((finding) => finding.token)).toEqual(findings);
    expect(result.policies[0]?.analysis?.unknown.map((gap) => gap.reason) ?? []).toEqual(unknown);
  });
}
