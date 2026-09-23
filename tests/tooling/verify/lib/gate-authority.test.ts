import { Project } from "ts-morph";
import type {
  GateAuthorityBatchInput,
  GateAuthorityBatchResult,
  GateOwnerCompletion,
  GateOwnerResult,
  RawGateFinding,
  SelectedGatePolicy,
} from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { OrdinaryWaiverSource } from "../../../../tooling/src/verify/contract/ordinary-waiver-source.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICIES: readonly SelectedGatePolicy[] = [
  { id: "hard-policy", authority: "hard", severity: "error" },
  { id: "ordinary-policy", authority: "ordinary", severity: "warning" },
  { id: "reviewed-policy", authority: "reviewed-grant", severity: "error" },
];

function finding(file: string, overrides: Partial<RawGateFinding> = {}): RawGateFinding {
  return { file, line: 1, column: 1, message: `finding in ${file}`, ...overrides };
}

function ordinaryFinding(file: string, overrides: Partial<RawGateFinding> = {}): RawGateFinding {
  return finding(file, { token: "ordinary", ...overrides });
}

function ordinarySources(files: Readonly<Record<string, string>>): readonly OrdinaryWaiverSource[] {
  const project = new Project({ useInMemoryFileSystem: true });
  return Object.entries(files).map(([path, source]) => ({ kind: "typescript" as const, path, sourceFile: project.createSourceFile(`/repo/${path}`, source) }));
}

function owner(
  policyId: string,
  findings: readonly RawGateFinding[],
  completion: GateOwnerCompletion = { status: "success", population: "complete" },
): GateOwnerResult {
  return { policyId, populationFiles: findings.map(({ file }) => file), coverage: "whole", owner: completion, findings };
}

function coordinate(overrides: Partial<GateAuthorityBatchInput> = {}): GateAuthorityBatchResult {
  const input: GateAuthorityBatchInput = {
    knownPolicies: POLICIES,
    selectedPolicies: POLICIES,
    ownerResults: [
      owner("hard-policy", [finding("hard.ts")]),
      owner("ordinary-policy", [ordinaryFinding("ordinary.ts", { subject: "src/a.ts", operation: "import" })]),
      owner("reviewed-policy", [finding("reviewed.ts", { subject: "src/a.ts", operation: "import" })]),
    ],
    reviewedGrants: [],
    failOnWarnings: false,
    ...overrides,
    ordinaryWaiverSources: overrides.ordinaryWaiverSources ?? ordinarySources({ "ordinary.ts": "ordinary\n" }),
  };
  return coordinateGateAuthority(input);
}

test("each authority uses only its own exception door and findings derive policy metadata", () => {
  const result = coordinate({
    ownerResults: [
      owner("hard-policy", [finding("hard.ts")]),
      owner("ordinary-policy", [ordinaryFinding("ordinary.ts", { line: 2 })]),
      owner("reviewed-policy", [finding("reviewed.ts", { subject: "src/a.ts", operation: "import" })]),
    ],
    ordinaryWaiverSources: ordinarySources({ "ordinary.ts": "// @orb-waive ordinary-policy(ordinary): fixture\nordinary\n" }),
    reviewedGrants: [
      {
        id: "grant:reviewed",
        policyId: "reviewed-policy",
        subject: "src/a.ts",
        operation: "import",
        why: "fixture",
        endsWhen: "the import moves",
      },
    ],
  });

  expect(result.effectiveFindings).toMatchObject([{ policyId: "hard-policy", severity: "error" }]);
  expect(result.waivedFindings).toMatchObject([
    { waiverId: "ordinary.ts:1:1", finding: { policyId: "ordinary-policy", severity: "warning", token: "ordinary" } },
  ]);
  expect(result.grantedFindings).toMatchObject([{ grantId: "grant:reviewed", finding: { policyId: "reviewed-policy", severity: "error" } }]);
  expect(result.reviewedGrantConsumption).toEqual([{ id: "grant:reviewed", count: 1 }]);
});

test("an owner result without a known coverage is refused before any grant is judged", () => {
  const grant = {
    id: "grant:unknown-coverage",
    policyId: "reviewed-policy",
    subject: "src/gone.ts",
    operation: "read",
    why: "fixture",
    endsWhen: "fixture ends",
  };
  const live = finding("reviewed.ts", { subject: "src/live.ts", operation: "read" });
  const coverage: string = "partial";
  // @orb-waive no-test-fabrication(GateOwnerResult): the runtime boundary must refuse a coverage outside GATE_OWNER_COVERAGES
  const unknownCoverage = { ...owner("reviewed-policy", [live]), coverage } as GateOwnerResult;
  const refused = coordinate({ selectedPolicies: [POLICIES[2] as SelectedGatePolicy], ownerResults: [unknownCoverage], reviewedGrants: [grant] });

  expect(refused.toolErrors).toMatchObject([{ kind: "invalid-owner-result", policyId: "reviewed-policy" }]);
  expect(refused.withheldPolicyIds).toEqual(["reviewed-policy"]);
  expect(refused.authorityAlarms).toEqual([]);
  expect(refused.unjudgedReviewedGrants).toEqual([]);

  const subset = coordinate({
    selectedPolicies: [POLICIES[2] as SelectedGatePolicy],
    ownerResults: [{ ...owner("reviewed-policy", [live]), coverage: "subset" }],
    reviewedGrants: [grant],
  });
  expect(subset.toolErrors).toEqual([]);
  expect(subset.authorityAlarms).toEqual([]);
  expect(subset.unjudgedReviewedGrants).toEqual([{ policyId: "reviewed-policy", grantId: grant.id }]);
});

test("raw findings cannot spoof policy identity or severity", () => {
  // @orb-waive no-test-fabrication(RawGateFinding): partial fixture — only the fields the authority resolver exercises; no factory exists
  const spoofed = { ...finding("spoof.ts"), policyId: "other", severity: "warning" } as RawGateFinding;
  const result = coordinate({
    selectedPolicies: [POLICIES[0] as SelectedGatePolicy],
    ownerResults: [owner("hard-policy", [spoofed])],
  });

  expect(result.effectiveFindings).toEqual([]);
  expect(result.toolErrors).toMatchObject([{ kind: "finding-spoofed-policy", policyId: "hard-policy", findingIndex: 0 }]);
  expect(result.withheldPolicyIds).toEqual(["hard-policy"]);
});

test("reviewed grants match the exact policy, subject, and operation", () => {
  const result = coordinate({
    selectedPolicies: [POLICIES[2] as SelectedGatePolicy],
    ownerResults: [
      owner("reviewed-policy", [
        finding("a.ts", { subject: "src/a.ts", operation: "read" }),
        finding("b.ts", { subject: "src/a.ts", operation: "write" }),
        finding("c.ts", { subject: "src/b.ts", operation: "read" }),
      ]),
    ],
    reviewedGrants: [
      {
        id: "grant:exact",
        policyId: "reviewed-policy",
        subject: "src/a.ts",
        operation: "read",
        why: "fixture",
        endsWhen: "the read disappears",
      },
    ],
  });

  expect(result.grantedFindings).toHaveLength(1);
  expect(result.effectiveFindings.map(({ file }) => file)).toEqual(["b.ts", "c.ts"]);
  expect(result.reviewedGrantConsumption).toEqual([{ id: "grant:exact", count: 1 }]);
});

test("a reviewed grant fails closed when one exact identity matches duplicate findings", () => {
  const duplicate = finding("duplicate.ts", { subject: "src/a.ts", operation: "read" });
  const result = coordinate({
    selectedPolicies: [POLICIES[2] as SelectedGatePolicy],
    ownerResults: [{ ...owner("reviewed-policy", [duplicate, duplicate]), populationFiles: ["duplicate.ts"] }],
    reviewedGrants: [
      {
        id: "grant:duplicate",
        policyId: "reviewed-policy",
        subject: "src/a.ts",
        operation: "read",
        why: "fixture",
        endsWhen: "the duplicate disappears",
      },
    ],
  });

  expect(result.grantedFindings).toEqual([]);
  expect(result.effectiveFindings).toHaveLength(2);
  expect(result.reviewedGrantConsumption).toEqual([{ id: "grant:duplicate", count: 2 }]);
  expect(result.authorityAlarms).toMatchObject([
    { kind: "over-broad-reviewed-grant", policyId: "reviewed-policy", grantId: "grant:duplicate", subject: "src/a.ts", operation: "read", count: 2 },
  ]);
  expect(result.verdict).toMatchObject({ errors: 3, blocking: 3 });
});

test("distinct reviewed identities each consume one exact grant", () => {
  const result = coordinate({
    selectedPolicies: [POLICIES[2] as SelectedGatePolicy],
    ownerResults: [
      owner("reviewed-policy", [finding("a.ts", { subject: "src/a.ts", operation: "read" }), finding("b.ts", { subject: "src/b.ts", operation: "read" })]),
    ],
    reviewedGrants: [
      { id: "grant:a", policyId: "reviewed-policy", subject: "src/a.ts", operation: "read", why: "fixture a", endsWhen: "a disappears" },
      { id: "grant:b", policyId: "reviewed-policy", subject: "src/b.ts", operation: "read", why: "fixture b", endsWhen: "b disappears" },
    ],
  });

  expect(result.effectiveFindings).toEqual([]);
  expect(result.grantedFindings.map(({ grantId }) => grantId)).toEqual(["grant:a", "grant:b"]);
  expect(result.authorityAlarms).toEqual([]);
  expect(result.reviewedGrantConsumption).toEqual([
    { id: "grant:a", count: 1 },
    { id: "grant:b", count: 1 },
  ]);
});

test("failed reviewed owners withhold over-broad and stale reconciliation", () => {
  const result = coordinate({
    selectedPolicies: [POLICIES[2] as SelectedGatePolicy],
    ownerResults: [
      owner("reviewed-policy", [finding("a.ts", { subject: "src/a.ts", operation: "read" }), finding("b.ts", { subject: "src/a.ts", operation: "read" })], {
        status: "failure",
        population: "incomplete",
        reason: "owner threw",
      }),
    ],
    reviewedGrants: [{ id: "grant:held", policyId: "reviewed-policy", subject: "src/a.ts", operation: "read", why: "fixture", endsWhen: "owner completes" }],
  });

  expect(result.authorityAlarms).toEqual([]);
  expect(result.grantedFindings).toEqual([]);
  expect(result.reviewedGrantConsumption).toEqual([{ id: "grant:held", count: 0 }]);
  expect(result.withheldPolicyIds).toEqual(["reviewed-policy"]);
});

test("used, stale, unselected, and withheld reviewed grants reconcile independently", () => {
  const grants = [
    { id: "grant:used", policyId: "reviewed-policy", subject: "used", operation: "read", why: "fixture", endsWhen: "used disappears" },
    { id: "grant:stale", policyId: "reviewed-policy", subject: "stale", operation: "read", why: "fixture", endsWhen: "stale disappears" },
    { id: "grant:unselected", policyId: "other-policy", subject: "other", operation: "read", why: "fixture", endsWhen: "other runs" },
    { id: "grant:withheld", policyId: "withheld-policy", subject: "held", operation: "read", why: "fixture", endsWhen: "held runs" },
  ] as const;
  const result = coordinate({
    knownPolicies: [
      ...POLICIES,
      { id: "other-policy", authority: "reviewed-grant", severity: "error" },
      { id: "withheld-policy", authority: "reviewed-grant", severity: "error" },
    ],
    selectedPolicies: [POLICIES[2] as SelectedGatePolicy, { id: "withheld-policy", authority: "reviewed-grant", severity: "error" }],
    ownerResults: [
      owner("reviewed-policy", [finding("used.ts", { subject: "used", operation: "read" })]),
      owner("withheld-policy", [], { status: "incomplete", population: "incomplete", reason: "partial scan" }),
    ],
    reviewedGrants: grants,
  });

  expect(result.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: "grant:stale", policyId: "reviewed-policy" }]);
  expect(result.authorityAlarms).toHaveLength(1);
  expect(result.verdict).toMatchObject({ errors: 1, blocking: 1 });
  expect(result.withheldPolicyIds).toEqual(["withheld-policy"]);
  expect(result.reviewedGrantConsumption).toEqual([
    { id: "grant:stale", count: 0 },
    { id: "grant:unselected", count: 0 },
    { id: "grant:used", count: 1 },
    { id: "grant:withheld", count: 0 },
  ]);
});

test("missing, duplicate, and unselected owner results are typed tool errors", () => {
  const result = coordinate({
    selectedPolicies: [POLICIES[0] as SelectedGatePolicy, POLICIES[1] as SelectedGatePolicy],
    ownerResults: [owner("hard-policy", [finding("a.ts")]), owner("hard-policy", [finding("b.ts")]), owner("other", [finding("c.ts")])],
  });

  expect(result.toolErrors.map(({ kind }) => kind)).toEqual(["duplicate-owner-result", "missing-owner-result", "unselected-owner-result"]);
  expect(result.withheldPolicyIds).toEqual(["hard-policy", "ordinary-policy"]);
});

test("failure, incomplete, and not-applicable owners withhold authority liveness", () => {
  const result = coordinate({
    selectedPolicies: POLICIES,
    ownerResults: [
      owner("hard-policy", [], { status: "failure", population: "incomplete", reason: "threw" }),
      owner("ordinary-policy", [], { status: "incomplete", population: "incomplete", reason: "partial" }),
      owner("reviewed-policy", [], { status: "not-applicable", population: "complete", reason: "no population" }),
    ],
    reviewedGrants: [{ id: "grant:held", policyId: "reviewed-policy", subject: "a", operation: "read", why: "fixture", endsWhen: "policy applies" }],
  });

  expect(result.toolErrors.map(({ kind }) => kind)).toEqual(["owner-failure", "owner-incomplete"]);
  expect(result.withheldPolicyIds).toEqual(["hard-policy", "ordinary-policy", "reviewed-policy"]);
  expect(result.authorityAlarms).toEqual([]);
});

test("invalid coordinates, not-applicable findings, blank identities, and out-of-contract files tool-error before authority matching", () => {
  const blankReviewed = finding("blank.ts", { subject: " ", operation: "read" });
  const outside = owner("ordinary-policy", [finding("inside.ts")]);
  const result = coordinate({
    selectedPolicies: POLICIES,
    ownerResults: [
      { ...owner("hard-policy", [finding("bad.ts", { line: 0 })]), populationFiles: ["bad.ts"] },
      { ...outside, populationFiles: ["different.ts"] },
      owner("reviewed-policy", [blankReviewed], { status: "not-applicable", population: "complete", reason: "none" }),
    ],
  });

  expect(result.toolErrors.map(({ kind }) => kind)).toEqual([
    "invalid-finding-coordinate",
    "finding-outside-population",
    "not-applicable-with-findings",
    "invalid-reviewed-grant-identity",
  ]);
  expect(result.withheldPolicyIds).toEqual(["hard-policy", "ordinary-policy", "reviewed-policy"]);
});

test("duplicate policy and grant configurations fail closed", () => {
  const duplicatePolicy = coordinate({ selectedPolicies: [POLICIES[0] as SelectedGatePolicy, POLICIES[0] as SelectedGatePolicy], ownerResults: [] });
  expect(duplicatePolicy.toolErrors.map(({ kind }) => kind)).toEqual(["duplicate-policy"]);

  const duplicateGrants = coordinate({
    knownPolicies: [
      { id: "p", authority: "reviewed-grant", severity: "error" },
      { id: "q", authority: "reviewed-grant", severity: "error" },
    ],
    selectedPolicies: [],
    ownerResults: [],
    reviewedGrants: [
      { id: "same", policyId: "p", subject: "s", operation: "o", why: "one", endsWhen: "one ends" },
      { id: "same", policyId: "q", subject: "t", operation: "u", why: "two", endsWhen: "two ends" },
      { id: "third", policyId: "p", subject: "s", operation: "o", why: "three", endsWhen: "three ends" },
    ],
  });
  expect(duplicateGrants.toolErrors.map(({ kind }) => kind)).toEqual(["duplicate-grant-id", "duplicate-grant-identity"]);
});

test("a duplicate known roster is a typed batch error instead of an engine throw", () => {
  const duplicate = POLICIES[0] as SelectedGatePolicy;

  expect(() => coordinate({ knownPolicies: [duplicate, duplicate], selectedPolicies: [], ownerResults: [] })).not.toThrow();
  const result = coordinate({ knownPolicies: [duplicate, duplicate], selectedPolicies: [], ownerResults: [] });
  expect(result.toolErrors).toMatchObject([{ kind: "duplicate-policy", policyId: duplicate.id }]);
});

test("blank reviewed-grant identities are tool errors and cannot suppress", () => {
  const blankGrant = coordinate({
    selectedPolicies: [],
    ownerResults: [],
    reviewedGrants: [{ id: " ", policyId: "p", subject: "s", operation: "o", why: "fixture", endsWhen: "end" }],
  });
  expect(blankGrant.toolErrors).toMatchObject([{ kind: "invalid-grant" }]);
  expect(blankGrant.reviewedGrantConsumption).toEqual([]);
});

test("the full known roster rejects a reviewed grant for an unknown policy", () => {
  const result = coordinate({
    selectedPolicies: [],
    ownerResults: [],
    reviewedGrants: [{ id: "unknown", policyId: "missing", subject: "s", operation: "o", why: "fixture", endsWhen: "never" }],
  });

  expect(result.toolErrors).toMatchObject([{ kind: "invalid-grant", policyId: "missing", grantId: "unknown" }]);
  expect(result.reviewedGrantConsumption).toEqual([]);
});

test("identity validation rejects C0 and DEL without delimiter collisions", () => {
  const collision = coordinate({
    selectedPolicies: [],
    ownerResults: [],
    reviewedGrants: [
      { id: "first", policyId: "a", subject: "b\u0000c", operation: "d", why: "fixture", endsWhen: "end" },
      { id: "second", policyId: "a\u0000b", subject: "c", operation: "d", why: "fixture", endsWhen: "end" },
    ],
  });
  expect(collision.toolErrors.map(({ kind }) => kind)).toEqual(["invalid-grant", "invalid-grant"]);
  expect(collision.toolErrors).not.toMatchObject([{ kind: "duplicate-grant-identity" }]);

  const controlCharacters = [...Array.from({ length: 0x20 }, (_, codePoint) => String.fromCharCode(codePoint)), "\u007f"];
  for (const control of controlCharacters) {
    const invalidPolicy = coordinate({
      selectedPolicies: [{ id: `policy${control}`, authority: "hard", severity: "error" }],
      ownerResults: [],
    });
    expect(invalidPolicy.toolErrors.map(({ kind }) => kind)).toEqual(["invalid-policy"]);

    const invalidGrant = coordinate({
      selectedPolicies: [],
      ownerResults: [],
      reviewedGrants: [{ id: "grant", policyId: "policy", subject: `subject${control}`, operation: "read", why: "fixture", endsWhen: "end" }],
    });
    expect(invalidGrant.toolErrors.map(({ kind }) => kind)).toEqual(["invalid-grant"]);

    const invalidPath = coordinate({
      selectedPolicies: [POLICIES[0] as SelectedGatePolicy],
      ownerResults: [{ ...owner("hard-policy", [finding(`bad${control}.ts`)]), populationFiles: [`bad${control}.ts`] }],
    });
    expect(invalidPath.toolErrors.map(({ kind }) => kind)).toEqual(["invalid-population"]);
  }
});

test("successful empty populations withhold ordinary and reviewed reconciliation", () => {
  const result = coordinate({
    selectedPolicies: [POLICIES[1] as SelectedGatePolicy, POLICIES[2] as SelectedGatePolicy],
    ownerResults: [owner("ordinary-policy", []), owner("reviewed-policy", [])],
    reviewedGrants: [{ id: "grant:held", policyId: "reviewed-policy", subject: "s", operation: "o", why: "fixture", endsWhen: "population returns" }],
  });

  expect(result.toolErrors.map(({ kind }) => kind)).toEqual(["invalid-population", "invalid-population"]);
  expect(result.withheldPolicyIds).toEqual(["ordinary-policy", "reviewed-policy"]);
  expect(result.authorityAlarms).toEqual([]);
});

test("grants targeting selected hard or ordinary policies tool-error without opening a suppression door", () => {
  const result = coordinate({
    selectedPolicies: [POLICIES[0] as SelectedGatePolicy, POLICIES[1] as SelectedGatePolicy],
    ownerResults: [owner("hard-policy", [finding("hard.ts")]), owner("ordinary-policy", [ordinaryFinding("ordinary.ts")])],
    reviewedGrants: [
      { id: "grant:hard", policyId: "hard-policy", subject: "s", operation: "o", why: "fixture", endsWhen: "never" },
      { id: "grant:ordinary", policyId: "ordinary-policy", subject: "s", operation: "o", why: "fixture", endsWhen: "never" },
    ],
  });

  expect(result.toolErrors.map(({ kind }) => kind)).toEqual(["invalid-grant-authority", "invalid-grant-authority"]);
  expect(result.withheldPolicyIds).toEqual(["hard-policy", "ordinary-policy"]);
  expect(result.effectiveFindings.map(({ policyId }) => policyId)).toEqual(["hard-policy", "ordinary-policy"]);
  expect(result.grantedFindings).toEqual([]);
});

test("non-success completion reasons must be nonblank identities", () => {
  const result = coordinate({
    selectedPolicies: POLICIES,
    ownerResults: [
      owner("hard-policy", [], { status: "failure", population: "incomplete", reason: "" }),
      owner("ordinary-policy", [], { status: "incomplete", population: "incomplete", reason: " " }),
      owner("reviewed-policy", [], { status: "not-applicable", population: "complete", reason: "\u007f" }),
    ],
  });

  expect(result.toolErrors.map(({ kind }) => kind)).toEqual(["invalid-owner-result", "invalid-owner-result", "invalid-owner-result"]);
  expect(result.withheldPolicyIds).toEqual(["hard-policy", "ordinary-policy", "reviewed-policy"]);
});

test("warning promotion changes blocking without rewriting severity", () => {
  const unpromoted = coordinate({
    selectedPolicies: [POLICIES[1] as SelectedGatePolicy],
    ownerResults: [owner("ordinary-policy", [ordinaryFinding("warning.ts")])],
    ordinaryWaiverSources: ordinarySources({ "warning.ts": "ordinary\n" }),
  });
  const promoted = coordinate({
    selectedPolicies: [POLICIES[1] as SelectedGatePolicy],
    ownerResults: [owner("ordinary-policy", [ordinaryFinding("warning.ts")])],
    ordinaryWaiverSources: ordinarySources({ "warning.ts": "ordinary\n" }),
    failOnWarnings: true,
  });

  expect(unpromoted.verdict).toEqual({ errors: 0, warnings: 1, blocking: 0, failOnWarnings: false });
  expect(promoted.verdict).toEqual({ errors: 0, warnings: 1, blocking: 1, failOnWarnings: true });
  expect(promoted.effectiveFindings[0]?.severity).toBe("warning");
});

test("a hard warning stays effective and unwaived while promotion alone changes blocking", () => {
  const hardWarning = { id: "hard-warning", authority: "hard", severity: "warning" } as const;
  const run = (failOnWarnings: boolean): GateAuthorityBatchResult =>
    coordinate({
      knownPolicies: [hardWarning],
      selectedPolicies: [hardWarning],
      ownerResults: [owner(hardWarning.id, [finding("missing-test.ts")])],
      ordinaryWaiverSources: ordinarySources({ "missing-test.ts": "export const missing = true;\n" }),
      failOnWarnings,
    });

  const unpromoted = run(false);
  const promoted = run(true);
  expect(unpromoted.effectiveFindings).toMatchObject([{ policyId: hardWarning.id, severity: "warning" }]);
  expect(unpromoted.waivedFindings).toEqual([]);
  expect(unpromoted.authorityAlarms).toEqual([]);
  expect(unpromoted.verdict).toEqual({ errors: 0, warnings: 1, blocking: 0, failOnWarnings: false });
  expect(promoted.effectiveFindings).toEqual(unpromoted.effectiveFindings);
  expect(promoted.verdict).toEqual({ errors: 0, warnings: 1, blocking: 1, failOnWarnings: true });
});
