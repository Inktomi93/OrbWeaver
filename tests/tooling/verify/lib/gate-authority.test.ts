import type {
  GateAuthorityBatchInput,
  GateAuthorityBatchResult,
  GateOwnerCompletion,
  GateOwnerResult,
  RawGateFinding,
  SelectedGatePolicy,
} from "../../../../tooling/src/verify/contract/gate-authority.ts";
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

function owner(
  policyId: string,
  findings: readonly RawGateFinding[],
  completion: GateOwnerCompletion = { status: "success", population: "complete" },
): GateOwnerResult {
  return { policyId, populationFiles: findings.map(({ file }) => file), owner: completion, findings };
}

function coordinate(overrides: Partial<GateAuthorityBatchInput> = {}): GateAuthorityBatchResult {
  return coordinateGateAuthority({
    selectedPolicies: POLICIES,
    ownerResults: [
      owner("hard-policy", [finding("hard.ts")]),
      owner("ordinary-policy", [finding("ordinary.ts", { subject: "src/a.ts", operation: "import" })]),
      owner("reviewed-policy", [finding("reviewed.ts", { subject: "src/a.ts", operation: "import" })]),
    ],
    reviewedGrants: [],
    failOnWarnings: false,
    ...overrides,
  });
}

test("each authority uses only its own exception door and findings derive policy metadata", () => {
  const waiverLookups: string[] = [];
  const result = coordinate({
    waiverFor: (candidate) => {
      waiverLookups.push(candidate.policyId);
      return "waiver:ordinary";
    },
    reviewedGrants: [
      { id: "grant:hard", policyId: "hard-policy", subject: "src/a.ts", operation: "import", why: "fixture", endsWhen: "never" },
      {
        id: "grant:ordinary",
        policyId: "ordinary-policy",
        subject: "src/a.ts",
        operation: "import",
        why: "fixture",
        endsWhen: "never",
      },
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

  expect(waiverLookups).toEqual(["ordinary-policy"]);
  expect(result.effectiveFindings).toMatchObject([{ policyId: "hard-policy", severity: "error" }]);
  expect(result.waivedFindings).toMatchObject([{ waiverId: "waiver:ordinary", finding: { policyId: "ordinary-policy", severity: "warning" } }]);
  expect(result.grantedFindings).toMatchObject([{ grantId: "grant:reviewed", finding: { policyId: "reviewed-policy", severity: "error" } }]);
  expect(result.reviewedGrantConsumption).toEqual([
    { id: "grant:hard", count: 0 },
    { id: "grant:ordinary", count: 0 },
    { id: "grant:reviewed", count: 1 },
  ]);
});

test("raw findings cannot spoof policy identity or severity", () => {
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

test("used, stale, unselected, and withheld reviewed grants reconcile independently", () => {
  const grants = [
    { id: "grant:used", policyId: "reviewed-policy", subject: "used", operation: "read", why: "fixture", endsWhen: "used disappears" },
    { id: "grant:stale", policyId: "reviewed-policy", subject: "stale", operation: "read", why: "fixture", endsWhen: "stale disappears" },
    { id: "grant:unselected", policyId: "other-policy", subject: "other", operation: "read", why: "fixture", endsWhen: "other runs" },
    { id: "grant:withheld", policyId: "withheld-policy", subject: "held", operation: "read", why: "fixture", endsWhen: "held runs" },
  ] as const;
  const result = coordinate({
    selectedPolicies: [POLICIES[2] as SelectedGatePolicy, { id: "withheld-policy", authority: "reviewed-grant", severity: "error" }],
    ownerResults: [
      owner("reviewed-policy", [finding("used.ts", { subject: "used", operation: "read" })]),
      owner("withheld-policy", [], { status: "incomplete", population: "incomplete", reason: "partial scan" }),
    ],
    reviewedGrants: grants,
  });

  expect(result.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: "grant:stale", policyId: "reviewed-policy" }]);
  expect(result.authorityAlarms).toHaveLength(1);
  expect(result.withheldPolicyIds).toEqual(["withheld-policy"]);
  expect(result.reviewedGrantConsumption).toEqual([
    { id: "grant:stale", count: 0 },
    { id: "grant:unselected", count: 0 },
    { id: "grant:used", count: 1 },
    { id: "grant:withheld", count: 0 },
  ]);
});

test("ordinary waiver lookup precedes one reconciliation over completed owners", () => {
  const calls: string[] = [];
  const result = coordinate({
    selectedPolicies: [POLICIES[1] as SelectedGatePolicy],
    ownerResults: [owner("ordinary-policy", [finding("b.ts"), finding("a.ts")])],
    waiverFor: (candidate) => {
      calls.push(`lookup:${candidate.file}`);
      return candidate.file === "a.ts" ? "waiver:a" : null;
    },
    reconcileOrdinary: ({ completedPolicyIds, consumption }) => {
      calls.push(`reconcile:${completedPolicyIds.join(",")}:${consumption.get("waiver:a") ?? 0}`);
      return [{ kind: "ordinary-waiver", policyId: "ordinary-policy", waiverId: "waiver:stale", message: "stale waiver" }];
    },
  });

  expect(calls).toEqual(["lookup:a.ts", "lookup:b.ts", "reconcile:ordinary-policy:1"]);
  expect(result.ordinaryConsumption).toEqual([{ id: "waiver:a", count: 1 }]);
  expect(result.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", waiverId: "waiver:stale" }]);
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
    reconcileOrdinary: () => {
      throw new Error("withheld ordinary policy must not reconcile");
    },
  });

  expect(result.toolErrors.map(({ kind }) => kind)).toEqual(["owner-failure", "owner-incomplete"]);
  expect(result.withheldPolicyIds).toEqual(["hard-policy", "ordinary-policy", "reviewed-policy"]);
  expect(result.authorityAlarms).toEqual([]);
});

test("invalid coordinates, not-applicable findings, blank identities, and out-of-contract files tool-error before authority callbacks", () => {
  let lookups = 0;
  const blankReviewed = finding("blank.ts", { subject: " ", operation: "read" });
  const outside = owner("ordinary-policy", [finding("inside.ts")]);
  const result = coordinate({
    selectedPolicies: POLICIES,
    ownerResults: [
      { ...owner("hard-policy", [finding("bad.ts", { line: 0 })]), populationFiles: ["bad.ts"] },
      { ...outside, populationFiles: ["different.ts"] },
      owner("reviewed-policy", [blankReviewed], { status: "not-applicable", population: "complete", reason: "none" }),
    ],
    waiverFor: () => {
      lookups += 1;
      return "waiver:nope";
    },
  });

  expect(lookups).toBe(0);
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

test("blank waiver and reviewed-grant identities are tool errors and cannot suppress", () => {
  const blankWaiver = coordinate({
    selectedPolicies: [POLICIES[1] as SelectedGatePolicy],
    ownerResults: [owner("ordinary-policy", [finding("ordinary.ts")])],
    waiverFor: () => " ",
  });
  expect(blankWaiver.toolErrors).toMatchObject([{ kind: "invalid-waiver-id", policyId: "ordinary-policy" }]);
  expect(blankWaiver.effectiveFindings).toMatchObject([{ policyId: "ordinary-policy" }]);
  expect(blankWaiver.withheldPolicyIds).toEqual(["ordinary-policy"]);

  const blankGrant = coordinate({
    selectedPolicies: [],
    ownerResults: [],
    reviewedGrants: [{ id: " ", policyId: "p", subject: "s", operation: "o", why: "fixture", endsWhen: "end" }],
  });
  expect(blankGrant.toolErrors).toMatchObject([{ kind: "invalid-grant" }]);
  expect(blankGrant.reviewedGrantConsumption).toEqual([]);
});

test("warning promotion changes blocking without rewriting severity", () => {
  const unpromoted = coordinate({
    selectedPolicies: [POLICIES[1] as SelectedGatePolicy],
    ownerResults: [owner("ordinary-policy", [finding("warning.ts")])],
  });
  const promoted = coordinate({
    selectedPolicies: [POLICIES[1] as SelectedGatePolicy],
    ownerResults: [owner("ordinary-policy", [finding("warning.ts")])],
    failOnWarnings: true,
  });

  expect(unpromoted.verdict).toEqual({ errors: 0, warnings: 1, blocking: 0, failOnWarnings: false });
  expect(promoted.verdict).toEqual({ errors: 0, warnings: 1, blocking: 1, failOnWarnings: true });
  expect(promoted.effectiveFindings[0]?.severity).toBe("warning");
});

test("repeated invocations have isolated consumption state and deterministic output", () => {
  const input: Partial<GateAuthorityBatchInput> = {
    selectedPolicies: [POLICIES[1] as SelectedGatePolicy],
    ownerResults: [owner("ordinary-policy", [finding("b.ts"), finding("a.ts")])],
    waiverFor: () => "waiver:repeat",
  };

  const first = coordinate(input);
  const second = coordinate(input);
  expect(first).toEqual(second);
  expect(first.ordinaryConsumption).toEqual([{ id: "waiver:repeat", count: 2 }]);
  expect(first.waivedFindings.map(({ finding: candidate }) => candidate.file)).toEqual(["a.ts", "b.ts"]);
});
