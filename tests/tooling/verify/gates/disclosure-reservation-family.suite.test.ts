// The standing family floor for the two marker-carrying splits converted in #1950 group 3:
//
//   `sub-floor-disclosure`        → `sub-floor-disclosure` (ordinary occurrence) + `sub-floor-disclosure-health`
//                                   (hard vocabulary tripwire) — family `sub-floor-disclosure`.
//   `query-boundary-reservation`  → `query-boundary-reservation` (ordinary occurrence) +
//                                   `query-boundary-reservation-health` (hard duplicate-key + seam tripwire) —
//                                   family `query-boundary-reservation`.
//
// Both legacy descriptors owned a PRIVATE two-sided marker grammar (`@sub-floor-ok`, `@first-boot-only`) with
// a malformed / stale / over-exempting sweep of their own. Those grammars retire into the central `@orb-waive`
// engine, so what lives here is everything a declared row cannot express:
//   §4.2 — the ordinary identity arm for BOTH occurrence policies, in the carrier shapes the LIVE sites use:
//          a `{/* … */}` JSX comment immediately before the element, and a `//` in the leading trivia of a
//          multi-line self-closing element whose `size` sits lines below the marker.
//   THE REAL-SITE BINDING PIN — the two translated product files are read OFF DISK and run through the final
//          occurrence policy: 0 effective, 2 waived, 0 alarms. A shape-alike cannot prove a real marker binds.
//   RETIRED-ARM SUCCESSORS — the legacy malformed and stale marker verdicts are central reconciliation now;
//          the pins drive a reason-less marker and an unbound marker through `runPolicyPass` and assert the
//          exact alarm the engine raises for THIS policy id (not a copy of the engine's negative arms: the
//          full family is `knownPolicies`, so no unknown-policy short-circuit is reachable).
//   §4.5 — every `entire-population` sibling DEFERS a narrowed request, and the sub-floor tripwire whose
//          population is exactly its home REFUSES at the population phase when the home is absent.
//   §4.6 — the two split differentials against the frozen legacy descriptors (`4e1bdb87e`, `370243fe7`):
//          every legacy example replayed through the frozen `runPass` and the UNION of the final pair,
//          differences CLASSIFIED: (1) the retired grammar is INERT text — a legacy-marked site is a finding
//          now, and legacy marker verdicts (malformed/stale) vanish, so the comparison runs the legacy over
//          the fixture with the retired markers BLANKED and the final over the fixture as written;
//          (2) POSITION — `text`→`"text"` (+1 column, quotes), the duplicate key reported on its literal
//          rather than the attribute start (+`reserveKey=`.length columns, quoted); (3) TRIPWIRE ANCHOR —
//          the gate module's own path → the vocabulary/boundary home. Legacy-side coverage of every arm
//          asserted per example.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as qbr } from "../../../../tooling/src/verify/gates/query-boundary-reservation.ts";
import { gate as qbrHealth } from "../../../../tooling/src/verify/gates/query-boundary-reservation-health.ts";
import { gate as subFloor } from "../../../../tooling/src/verify/gates/sub-floor-disclosure.ts";
import { gate as subFloorHealth } from "../../../../tooling/src/verify/gates/sub-floor-disclosure-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/disclosure-reservation-family";
const SUB_FLOOR_FAMILY: readonly GatePolicy[] = [subFloor, subFloorHealth];
const QBR_FAMILY: readonly GatePolicy[] = [qbr, qbrHealth];
const ALL: readonly GatePolicy[] = [...SUB_FLOOR_FAMILY, ...QBR_FAMILY];
const VARIANTS_HOME = "packages/ui/src/primitives/collapsible/variants.ts";
const VARIANTS_SOURCE = 'export const collapsibleVariants = { size: { text: {}, control: { trigger: "min-h-control-sm" } } };\n';
const BOUNDARY_HOME = "packages/client/src/components/query-boundary.tsx";
const BOUNDARY_SOURCE = "export const QueryBoundary = (p: { reserveKey?: string }) => p.reserveKey;\n";
/** The two product files whose `@sub-floor-ok` markers were translated in place. */
const LIVE_SITES = [
  "packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx",
  "packages/client/src/features/rpg/components/rpg-beat-row.tsx",
] as const;

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

test("all four disclosure/reservation policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

// ─── §4.2 ORDINARY IDENTITY — the live carrier shapes ───────────────────────────────────────────────────
test("a JSX block-comment carrier immediately before the trigger binds sub-floor-disclosure's quoted-literal position (the turn-tool-calls shape)", () => {
  const waived = passOf([subFloor], {
    "packages/client/src/features/a/jsx-carrier.tsx":
      "export const G = (\n  <Collapsible>\n    {/* explanatory prose before the marker is not a significant sibling */}\n" +
      '    {/* @orb-waive sub-floor-disclosure("text"): sits mid-paragraph in running prose. */}\n' +
      '    <CollapsibleTrigger className="w-full" size="text" data-target-floor="sub-floor-ok">\n      more\n    </CollapsibleTrigger>\n  </Collapsible>\n);\n',
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

test("a line comment on the enclosing return statement binds a trigger inside a sibling-flanked JSX expression (the rpg-beat-row shape)", () => {
  const files = {
    "packages/client/src/features/a/statement-carrier.tsx":
      "export function G(open: boolean) {\n" +
      '  // @orb-waive sub-floor-disclosure("text"): the box is the rendered Button\'s own.\n' +
      "  return (\n    <Line>\n      {lead}\n      {open ? null : (\n" +
      '        <CollapsibleTrigger\n          chevron={false}\n          size="text"\n          render={<button type="button" />}\n        />\n      )}\n      {trailing}\n    </Line>\n  );\n}\n',
  };
  const waived = passOf([subFloor], files);
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);

  // THE PLACEMENT THAT DOES NOT BIND, pinned so nobody moves the real marker back: the same marker in the
  // element's own leading trivia sits inside `{open ? null : (…)}` between two authored siblings, and the
  // central engine judges a comment inside such an expression AMBIGUOUS — it suppresses nothing, loudly.
  const inside = passOf([subFloor], {
    "packages/client/src/features/a/inside-expression.tsx":
      "export function G(open: boolean) {\n  return (\n    <Line>\n      {lead}\n      {open ? null : (\n" +
      '        // @orb-waive sub-floor-disclosure("text"): the box is the rendered Button\'s own.\n' +
      '        <CollapsibleTrigger\n          chevron={false}\n          size="text"\n          render={<button type="button" />}\n        />\n      )}\n      {trailing}\n    </Line>\n  );\n}\n',
  });
  expect(inside.authority.effectiveFindings).toHaveLength(1);
  expect(inside.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: subFloor.id }]);
  expect(inside.authority.authorityAlarms[0]?.message).toContain("ambiguous comment trivia");
});

test("an ordinary waiver binds to the exact policy and the `fallback` position query-boundary-reservation reports", () => {
  const waived = passOf([qbr], {
    "packages/client/src/features/a/marked.tsx":
      "// @orb-waive query-boundary-reservation(fallback): mounts once at app boot and never again.\n" +
      'export const G = <QueryBoundary fallback={<SkeletonRows count={3} />}>{"b"}</QueryBoundary>;\n',
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── THE REAL-SITE BINDING PIN ──────────────────────────────────────────────────────────────────────────
test("both translated product markers bind on the real files: 0 effective, 2 waived, 0 alarms", ({ repoRoot }) => {
  const files = Object.fromEntries(LIVE_SITES.map((site) => [site, readFileSync(join(repoRoot, site), "utf8")]));
  const result = passOf([subFloor], files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings.map(({ finding }) => finding.file).toSorted()).toEqual([...LIVE_SITES].toSorted());
});

// ─── RETIRED-ARM SUCCESSORS — the legacy marker sweeps are central reconciliation ───────────────────────
test("a reason-less marker is MALFORMED centrally and exempts nothing — the legacy arm-B row's successor, for both policies", () => {
  const subFloorRun = passOf([subFloor], {
    "packages/client/src/features/a/bare.tsx":
      '// @orb-waive sub-floor-disclosure("text")\nexport const G = <CollapsibleTrigger size="text">Advanced</CollapsibleTrigger>;\n',
  });
  expect(subFloorRun.authority.effectiveFindings).toHaveLength(1);
  expect(subFloorRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: subFloor.id }]);
  expect(subFloorRun.authority.authorityAlarms[0]?.message).toContain("malformed");

  const qbrRun = passOf([qbr], {
    "packages/client/src/features/a/bare.tsx":
      '// @orb-waive query-boundary-reservation(fallback)\nexport const G = <QueryBoundary fallback={<SkeletonRows count={3} />}>{"b"}</QueryBoundary>;\n',
  });
  expect(qbrRun.authority.effectiveFindings).toHaveLength(1);
  expect(qbrRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: qbr.id }]);
  expect(qbrRun.authority.authorityAlarms[0]?.message).toContain("malformed");
});

test("a marker absolving nothing is STALE centrally — the legacy arm-B/C stale row's successor, for both policies", () => {
  const subFloorRun = passOf([subFloor], {
    "packages/client/src/features/a/stale.tsx": '// @orb-waive sub-floor-disclosure("text"): this row took the control default in #884.\nexport const x = 1;\n',
  });
  expect(subFloorRun.authority.effectiveFindings).toEqual([]);
  expect(subFloorRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: subFloor.id }]);
  expect(subFloorRun.authority.authorityAlarms[0]?.message).toContain("stale");

  const qbrRun = passOf([qbr], {
    "packages/client/src/features/a/stale.tsx": "// @orb-waive query-boundary-reservation(fallback): this component unmounted in #000.\nexport const x = 1;\n",
  });
  expect(qbrRun.authority.effectiveFindings).toEqual([]);
  expect(qbrRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: qbr.id }]);
  expect(qbrRun.authority.authorityAlarms[0]?.message).toContain("stale");
});

// ─── §4.5 DEFERRAL AND REFUSAL ──────────────────────────────────────────────────────────────────────────
test("a narrowed request DEFERS both -health tripwires instead of adjudicating a home or a key census its scope cannot see", () => {
  const files = {
    [VARIANTS_HOME]: VARIANTS_SOURCE,
    [BOUNDARY_HOME]: BOUNDARY_SOURCE,
    "packages/client/src/features/a/one.tsx": 'export const G = <QueryBoundary fallback={null} reserveKey="chat.one">{"b"}</QueryBoundary>;\n',
    "packages/client/src/features/a/clean.tsx": "export const clean = true;\n",
  };
  for (const policy of [subFloorHealth, qbrHealth]) {
    const narrowed = passOf([policy], files, ["packages/client/src/features/a/clean.tsx"]);
    expect(narrowed.toolErrors, policy.id).toEqual([]);
    expect(narrowed.policies.find(({ id }) => id === policy.id)?.owner, policy.id).toMatchObject({ status: "not-applicable", population: "complete" });
    expect(narrowed.authority.effectiveFindings, policy.id).toEqual([]);
  }
});

test("the sub-floor tripwire REFUSES at the population phase when its home — its whole population — is absent", () => {
  const absent = passOf([subFloorHealth], { "packages/ui/src/primitives/collapsible/collapsible.tsx": "export const Collapsible = null;\n" });
  expect(absent.toolErrors).toMatchObject([{ policyId: subFloorHealth.id, phase: "population" }]);
  expect(absent.authority.withheldPolicyIds).toEqual([subFloorHealth.id]);
  expect(absent.authority.effectiveFindings).toEqual([]);
});
