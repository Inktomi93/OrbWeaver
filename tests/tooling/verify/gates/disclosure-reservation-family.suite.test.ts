// The standing family floor for the marker-carrying split converted in #1950 group 3 that still runs as gates:
//
//   `query-boundary-reservation`  → `query-boundary-reservation` (ordinary occurrence) +
//                                   `query-boundary-reservation-health` (hard duplicate-key + seam tripwire) —
//                                   family `query-boundary-reservation`.
//
// What lives here is everything a declared row cannot express:
//   §4.2 — the ordinary identity arm for the query-boundary occurrence policy.
//   RETIRED-ARM SUCCESSORS — the legacy malformed and stale marker verdicts are central reconciliation now;
//          the pins drive a reason-less marker and an unbound marker through `runPolicyPass` and assert the
//          exact alarm the engine raises for THIS policy id.
//   §4.5 — every `entire-population` sibling DEFERS a narrowed request.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as qbr } from "../../../../tooling/src/verify/gates/query-boundary-reservation.ts";
import { gate as qbrHealth } from "../../../../tooling/src/verify/gates/query-boundary-reservation-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/disclosure-reservation-family";
const ALL: readonly GatePolicy[] = [qbr, qbrHealth];
const BOUNDARY_HOME = "packages/client/src/components/query-boundary.tsx";
const BOUNDARY_SOURCE = "export const QueryBoundary = (p: { reserveKey?: string }) => p.reserveKey;\n";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  requestedPaths?: readonly string[],
): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: ALL,
    policies,
    root: ROOT,
    project: projectOf(files),
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("the three disclosure/reservation policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

// ─── §4.2 ORDINARY IDENTITY ─────────────────────────────────────────────────────────────────────────────
test("an ordinary waiver binds to the exact policy and the `fallback` position query-boundary-reservation reports", () => {
  const waived = passOf([qbr], {
    "packages/client/src/features/a/marked.tsx":
      "const ROWS = 3;\n// @orb-waive query-boundary-reservation(fallback): mounts once at app boot and never again.\n" +
      'export const G = <QueryBoundary fallback={<SkeletonRows count={ROWS} />}>{"b"}</QueryBoundary>;\n',
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── RETIRED-ARM SUCCESSORS — the legacy marker sweeps are central reconciliation ───────────────────────
test("a reason-less marker is MALFORMED centrally and exempts nothing — the legacy arm-B row's successor", () => {
  const qbrRun = passOf([qbr], {
    "packages/client/src/features/a/bare.tsx":
      'const ROWS = 3;\n// @orb-waive query-boundary-reservation(fallback)\nexport const G = <QueryBoundary fallback={<SkeletonRows count={ROWS} />}>{"b"}</QueryBoundary>;\n',
  });
  expect(qbrRun.authority.effectiveFindings).toHaveLength(1);
  expect(qbrRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: qbr.id }]);
  expect(qbrRun.authority.authorityAlarms[0]?.message).toContain("malformed");
});

test("a marker absolving nothing is STALE centrally — the legacy arm-B/C stale row's successor", () => {
  const qbrRun = passOf([qbr], {
    "packages/client/src/features/a/stale.tsx": "// @orb-waive query-boundary-reservation(fallback): this component unmounted in #000.\nexport const x = 1;\n",
  });
  expect(qbrRun.authority.effectiveFindings).toEqual([]);
  expect(qbrRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: qbr.id }]);
  expect(qbrRun.authority.authorityAlarms[0]?.message).toContain("stale");
});

// ─── §4.5 DEFERRAL AND REFUSAL ──────────────────────────────────────────────────────────────────────────
test("a narrowed request DEFERS the -health tripwire instead of adjudicating a key census its scope cannot see", () => {
  const files = {
    [BOUNDARY_HOME]: BOUNDARY_SOURCE,
    "packages/client/src/features/a/one.tsx": 'export const G = <QueryBoundary fallback={null} reserveKey="chat.one">{"b"}</QueryBoundary>;\n',
    "packages/client/src/features/a/clean.tsx": "export const clean = true;\n",
  };
  for (const policy of [qbrHealth]) {
    const narrowed = passOf([policy], files, ["packages/client/src/features/a/clean.tsx"]);
    expect(narrowed.toolErrors, policy.id).toEqual([]);
    expect(narrowed.policies.find(({ id }) => id === policy.id)?.owner, policy.id).toMatchObject({ status: "not-applicable", population: "complete" });
    expect(narrowed.authority.effectiveFindings, policy.id).toEqual([]);
  }
});
