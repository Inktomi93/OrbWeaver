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

const PROBE_HEAD = `import type { Owner } from "../../../packages/contracts/src/chat/owner";
import { take, takeNames, takeRows } from "../../../packages/contracts/src/chat/owner";
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
  { name: "erased argument", body: "take(loose);", findings: [], unknown: [U.erasedValue] },
  { name: "object literal spread", body: "export const seen: Owner = { ...hand };", findings: [], unknown: [] },
];

test("the shape-constituents walk is demanded only by this policy, not by another native-question consumer", ({ repoRoot }) => {
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
});

for (const { name, body, findings, unknown } of PROBES) {
  test(`probe: ${name}`, ({ repoRoot }) => {
    const result = pass(repoRoot, {}, `${PROBE_HEAD}${body}\n`);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings.map((finding) => finding.token)).toEqual(findings);
    expect(result.policies[0]?.analysis?.unknown.map((gap) => gap.reason) ?? []).toEqual(unknown);
  });
}
