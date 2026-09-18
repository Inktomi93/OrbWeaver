// The standing conformance net for the `suppressions` policy — a declared SINGLETON family whose shared
// reader is `lib/suppression-directive.ts` `suppressionSites` (co-consumed by the independent
// `no-blanket-suppression` singleton, which judges the same grammar for the opposite reason).
//
// WHAT ONLY THIS FILE CAN PROVE. `verifyPolicyProofs` runs the module's declared rows, which the static
// conformance stage already does. Three things it CANNOT express, and all three are the load-bearing half of
// the 2026-09-12 authority migration (#2063):
//   · §4.3 GRANT IDENTITY. `runPolicyPass` inside a proof row pins `reviewedGrants: []`, so no declared row
//     can show a grant being consumed. The arms below drive a real grant table: the intended row consumes
//     exactly once, a WRONG OPERATION leaves the finding effective, and a subject nothing produces goes
//     STALE. That last one is the successor to the legacy `staleRatifiedRules` arm, which this conversion
//     deleted from the module because the engine now owns it.
//   · §4.7 PLANTED-BREAK RECEIPTS for the conversion's two INVENTED properties — cross-file aggregation and
//     the scope split. Both are new with the conversion (the legacy ratchet reported per occurrence per
//     file), so each owes a row that dies when the property is cut.
//   · THE OVER-BROAD GUARD, which is the whole reason the policy aggregates at all. A grant matching two
//     findings licenses NEITHER and alarms; that behaviour is pinned centrally in
//     `tests/tooling/verify/lib/gate-authority.test.ts` ("distinct reviewed identities each consume one exact
//     grant"), so it is CITED here rather than re-planted — what this file proves is that this policy's
//     finding granularity cannot produce that state in the first place.
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as suppressions } from "../../../../tooling/src/verify/gates/suppressions.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/suppressions-family";

function passOf(files: Readonly<Record<string, string>>, grants: readonly ReviewedGateGrant[] = []): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [suppressions], policies: [suppressions], root: ROOT, project, reviewedGrants: grants, failOnWarnings: false });
}

function grant(subject: string, operation: string): ReviewedGateGrant {
  return {
    id: `suppressions:${operation}-${subject.replaceAll("/", "-")}`,
    policyId: "suppressions",
    subject,
    operation,
    why: "a family-test fixture row: the arms below are about grant IDENTITY, not about any real repository ruling.",
    endsWhen: "this test stops driving the grant surface.",
  };
}

/** The fixture every grant arm runs on: ONE rule, ONE scope, TWO files — the shape that would be two
 *  findings (and therefore an over-broad, licensing-nothing grant) if the policy reported per occurrence. */
const TWO_SITES = {
  "packages/kit/src/a.ts": "// biome-ignore lint/style/noNonNullAssertion: first\nexport const a = 1;\n",
  "packages/ui/src/b.ts": "// biome-ignore lint/style/noNonNullAssertion: second\nexport const b = 2;\n",
} as const;

test("the policy's own declared proofs hold through the production dispatcher", () => {
  expect(verifyPolicyProofs([suppressions])).toEqual([]);
});

test("the migration's shape is the thing under test: reviewed-grant, error, entire-population, singleton family", () => {
  // The tripwire on every assumption the arms below rest on. Flipping authority would add an inline waiver
  // door this policy deliberately does not have (a `biome-ignore` is FOREIGN syntax, never an Orb waiver);
  // flipping `execution` would let a scoped run stale every grant whose sites sat outside the selection.
  expect([suppressions.id, suppressions.family, suppressions.authority, suppressions.severity, suppressions.execution]).toEqual([
    "suppressions",
    "suppressions",
    "reviewed-grant",
    "error",
    "entire-population",
  ]);
});

test("§4.7 CROSS-FILE AGGREGATION: one rule in one scope across two files is ONE finding naming both sites", () => {
  const { authority } = passOf(TWO_SITES);
  expect(authority.effectiveFindings).toHaveLength(1);
  const [finding] = authority.effectiveFindings;
  expect(finding?.subject).toBe("lint/style/noNonNullAssertion");
  expect(finding?.operation).toBe("source");
  // The site list is what keeps an aggregate finding actionable — the grant is class-wide, the fix is per
  // line. A regression that dropped it would leave a finding nobody can act on and this row would not see it.
  expect(finding?.message).toContain("packages/kit/src/a.ts:1 (biome-ignore), packages/ui/src/b.ts:1 (biome-ignore)");
});

test("§4.3 GRANT IDENTITY: the intended row consumes the class exactly once and licenses it", () => {
  const { authority } = passOf(TWO_SITES, [grant("lint/style/noNonNullAssertion", "source")]);
  expect(authority.effectiveFindings).toEqual([]);
  expect(authority.grantedFindings).toHaveLength(1);
  expect(authority.authorityAlarms).toEqual([]);
  // EXACTLY ONE — the predicate `processReviewed` licenses on. Two would license NOTHING and alarm
  // over-broad, which is the failure mode aggregation exists to make unreachable.
  expect(authority.reviewedGrantConsumption.map((row) => row.count)).toEqual([1]);
});

test("§4.3 WRONG OPERATION: a `tests`-scope row does not license a `source`-scope finding", () => {
  // The #962 premise, enforced: the scope IS the operation, so a ruling in one scope is not a ruling in the
  // other. This is also the arm that would go green if `scopeOf` were collapsed to a constant.
  const { authority } = passOf(TWO_SITES, [grant("lint/style/noNonNullAssertion", "tests")]);
  expect(authority.effectiveFindings).toHaveLength(1);
  expect(authority.grantedFindings).toEqual([]);
  expect(authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["stale-reviewed-grant"]);
});

test("§4.7 SCOPE SPLIT: one rule suppressed in BOTH scopes is two findings with two grant identities", () => {
  const { authority } = passOf({
    "packages/kit/src/a.ts": "// biome-ignore lint/style/useNamingConvention: wire key\nexport const snake_case = 1;\n",
    "tests/kit/a.test.ts": "// biome-ignore lint/style/useNamingConvention: fixture wire key\nexport const other_key = 2;\n",
  });
  expect(authority.effectiveFindings.map((finding) => finding.operation).toSorted()).toEqual(["source", "tests"]);
});

test("THE STALE-RULE SUCCESSOR: a grant whose rule class has no live site alarms, which is what the deleted arm did", () => {
  // The legacy module carried `staleRatifiedRules` — a ratification classifying ZERO live markers in its
  // scope was RED, "the loaded gun the next marker under that rule would inherit". The conversion deleted
  // that code because central reconciliation produces the same verdict from zero consumption, and it also
  // catches the over-broad direction the legacy arm had no word for. This is that claim, driven.
  const { authority } = passOf(TWO_SITES, [grant("lint/style/noNonNullAssertion", "source"), grant("lint/suspicious/noExplicitAny", "source")]);
  expect(authority.effectiveFindings).toEqual([]);
  expect(authority.authorityAlarms.map((alarm) => [alarm.kind, "subject" in alarm ? alarm.subject : null])).toEqual([
    ["stale-reviewed-grant", "lint/suspicious/noExplicitAny"],
  ]);
});

test("THE POPULATION FENCE holds against a real anchor, and the captured foreign runtime is not judged", () => {
  // The fence's falsifier needs an IN-population anchor beside the out-of-population file, or the run comes
  // back a `[population]` tool error rather than a clean pass and proves nothing.
  const { authority, toolErrors } = passOf({
    "packages/kit/src/keep.ts": "export const keep = 1;\n",
    "scripts/probes/st-goldens/sillytavern-runtime/vendor.tsx":
      "// biome-ignore lint/style/useNamingConvention: captured vendor\nexport const snake_case = 1;\n",
  });
  expect(toolErrors).toEqual([]);
  expect(authority.effectiveFindings).toEqual([]);
});

test("every shipped `suppressions` grant is spelled for THIS policy's identity axes, not a file path", () => {
  // The one consumer that diverges from `lib/reviewed-grant-findings.ts`'s file-subject convention (ruled
  // 2026-09-12). A row that drifted back to a path subject would be stale on arrival and alarm on the real
  // tree; this catches it at authoring time, where the message is legible.
  const rows = REVIEWED_GRANTS.filter((row) => row.policyId === "suppressions");
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.filter((row) => row.operation !== "source" && row.operation !== "tests")).toEqual([]);
  expect(rows.filter((row) => row.subject.includes("/src/") || row.subject.endsWith(".ts") || row.subject.endsWith(".tsx"))).toEqual([]);
});
