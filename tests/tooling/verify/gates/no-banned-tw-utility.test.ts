// Family evidence for `no-banned-tw-utility` (#1656) — the `tailwind-class-token` family's REVIEWED-GRANT
// half, beside `no-arbitrary-tw-values`'s ordinary half in the sibling file.
//
// WHAT ONLY THIS FILE CAN PROVE, because a declared row structurally cannot (GATE-AUTHORING §5: `runPass`
// pins `reviewedGrants: []`, so a module row cannot reach the central table at all):
//   · THE REAL ROWS in `lib/reviewed-grants.ts` consume the REAL live sites — the two transcript-geometry
//     applications this policy was born green against, read off the checkout rather than re-typed.
//   · WRONG IDENTITY: a grant with the right subject and the wrong operation licenses NOTHING.
//   · STALE: a grant whose subject holds no finding is an alarm, not a quiet pass.
//   · NO DOUBLE REPORT with the ordinary sibling: the two policies share one class-token reader and must
//     still judge different subjects, which is the claim this policy's header makes.
import { readFileSync } from "node:fs";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as noArbitrary } from "../../../../tooling/src/verify/gates/no-arbitrary-tw-values.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-banned-tw-utility.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/banned-tw-utility";
/** The two live class applications, both ruled in place (#1145/#1175) and both grant rows. */
const BUBBLE = "packages/client/src/lib/message-bubble-class.ts";
const VARIANTS = "packages/client/src/features/chat/lib/message-row-variants.ts";
const OPERATION = "banned-tw-utility:max-w-prose";

interface Outcome {
  readonly hits: readonly string[];
  readonly granted: number;
  readonly alarms: readonly string[];
}

function drive(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>, grants: readonly ReviewedGateGrant[]): Outcome {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const result = runPolicyPass({ knownPolicies: policies, policies, project, root: ROOT, reviewedGrants: grants, failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return {
    hits: result.authority.effectiveFindings.map((finding) => `${finding.policyId}:${finding.file.replace(`${ROOT}/`, "")}`),
    granted: result.authority.grantedFindings.length,
    alarms: result.authority.authorityAlarms.map((alarm) => `${alarm.kind}:${alarm.policyId}`),
  };
}

/** The two ruled files exactly as the checkout has them — never a re-typed stand-in, so a re-point that
 *  removes the class makes the grant rows stale HERE as well as in the real run. */
function liveSites(): Readonly<Record<string, string>> {
  return {
    [BUBBLE]: readFileSync(new URL(`../../../../${BUBBLE}`, import.meta.url), "utf8"),
    [VARIANTS]: readFileSync(new URL(`../../../../${VARIANTS}`, import.meta.url), "utf8"),
  };
}

const REAL_GRANTS = reviewedGrantsFor([gate]);

test("the policy's own declared proofs hold through the production dispatcher", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the descriptor shape is the thing under test: reviewed-grant, in the shared tailwind family", () => {
  expect([gate.id, gate.family, gate.authority, gate.severity, gate.execution]).toEqual([
    "no-banned-tw-utility",
    "tailwind-class-token",
    "reviewed-grant",
    "error",
    "entire-population",
  ]);
  expect(gate.family, "the ordinary sibling shares it — one class-token reader, two authorities").toBe(noArbitrary.family);
});

test("the REAL central rows consume the REAL live sites: two granted, nothing effective, nothing alarming", () => {
  expect(REAL_GRANTS.map((grant) => grant.id).toSorted()).toEqual(["no-banned-tw-utility:message-bubble-class", "no-banned-tw-utility:message-row-variants"]);
  const outcome = drive([gate], liveSites(), REAL_GRANTS);
  expect(outcome).toEqual({ hits: [], granted: 2, alarms: [] });
});

test("WRONG IDENTITY licenses nothing: the right subject with the wrong operation leaves the finding standing", () => {
  const wrong = REAL_GRANTS.map((grant) => ({ ...grant, operation: "banned-tw-utility:max-w-screen" }));
  const outcome = drive([gate], liveSites(), wrong);
  expect(outcome.granted).toBe(0);
  expect(outcome.hits).toHaveLength(2);
});

test("a STALE grant is an alarm, not a quiet pass", () => {
  const stale: readonly ReviewedGateGrant[] = [
    {
      id: "no-banned-tw-utility:probe",
      policyId: gate.id,
      subject: "packages/client/src/features/x/gone.tsx",
      operation: OPERATION,
      why: "a stale probe row.",
      endsWhen: "this test ends.",
    },
  ];
  const outcome = drive(
    [gate],
    { "packages/client/src/features/x/clean.tsx": 'export const G = <div className="max-w-(--reading-measure-prose)" />;\n' },
    stale,
  );
  expect(outcome.hits).toEqual([]);
  expect(outcome.alarms.length).toBeGreaterThan(0);
});

test("no double report with the ordinary sibling: a ruled utility and an off-token bracket are different subjects", () => {
  const outcome = drive(
    [gate, noArbitrary],
    { "packages/client/src/features/x/both.tsx": 'export const G = <div className="max-w-prose w-[137px]" />;\n' },
    [],
  );
  expect(outcome.alarms).toEqual([]);
  // One finding each, never two on either token: the banned-utility ruling and the arbitrary bracket.
  expect(outcome.hits.toSorted()).toEqual([
    "no-arbitrary-tw-values:packages/client/src/features/x/both.tsx",
    "no-banned-tw-utility:packages/client/src/features/x/both.tsx",
  ]);
});
