// The standing conformance + differential net for four #1584 conversions (`p-simple-visitors-o` lane):
//
//   assumes-single-replica          — module-scope mutable per-process state classifier (unchanged shape;
//                                      the array-mutator subtree walk inverted into a second visitor).
//   no-vanity-alias                 — import/export alias identity, three arms in one policy (unchanged
//                                      predicate; the whole-file identifier-frequency census inverted into
//                                      an Identifier visitor).
//   public-route-body-cap /
//   public-route-body-cap-health    — SPLIT: the occurrence policy (ordinary) plus a HARD whole-population
//                                      blindness tripwire (the legacy `finalize` census hook), same family,
//                                      shared reader `lib/http-route-body.ts`.
//   no-hardcoded-model-prose        — WIDENED population (`@authored`, not the legacy seam+catalog set) so
//                                      ARM B's import-liveness sweep can see a CLIENT importer; the private
//                                      `PROSE-OK` marker retires into the central `@orb-waive` grammar.
//
// `verifyPolicyProofs` runs each final policy's own proofs through the production runtime; the frozen-legacy
// differential replays every ORIGINAL mustFlag/mustPass example from the pre-conversion source (86ce80b6c,
// the parent commit — all four modules are byte-identical there to their current-`main` legacy content)
// through both the legacy dispatcher and the final one, comparing FILE+COUNT (not message text — see the
// note beside `legacyFindings`). `public-route-body-cap-health` has no legacy standalone descriptor (it is
// a carve-out of the parent's `finalize` hook) so it is proof-only, not differential-replayed, and its
// parent's own census row is excluded from the parent's replay for the same reason (both below,
// `isRetiredIntoSiblingExample`); `no-hardcoded-model-prose`'s marker-mechanics legacy row (the bare/stale
// marker two-sided test) is excluded too — it tested the retired grammar, and guide §6.2 forbids copying a
// negative marker arm into a gate (the central engine's own suppression/staleness proof,
// `ordinary-waiver.test.ts`, is the successor, run once for every ordinary policy).
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as assumesSingleReplica } from "../../../../tooling/src/verify/gates/assumes-single-replica.ts";
import { gate as noHardcodedModelProse } from "../../../../tooling/src/verify/gates/no-hardcoded-model-prose.ts";
import { gate as noVanityAlias } from "../../../../tooling/src/verify/gates/no-vanity-alias.ts";
import { gate as publicRouteBodyCap } from "../../../../tooling/src/verify/gates/public-route-body-cap.ts";
import { gate as publicRouteBodyCapHealth } from "../../../../tooling/src/verify/gates/public-route-body-cap-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/simple-visitors-1584";

const FAMILY: readonly GatePolicy[] = [assumesSingleReplica, noVanityAlias, publicRouteBodyCap, publicRouteBodyCapHealth, noHardcodedModelProse];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

test("the four #1584 conversions pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY — the two-command dead-position control (guide §6.2), driven ONCE for the
// family: all four ordinary arms (public-route-body-cap-health is the only HARD member) report a real,
// paren/newline/solidus-free authored token (a bare declared name, a route method name, an original
// alias name, or the first STATIC word of a prose unit skipping `${…}` interpolation) — the same
// mechanism, so one drive stands for all. Driven on `assumes-single-replica`.
// ---------------------------------------------------------------------------------------------------
test("a correctly-addressed ordinary waiver on assumes-single-replica suppresses the finding", () => {
  const waived = passOf(assumesSingleReplica, {
    "packages/server/src/domain/hub/x.ts":
      "// @orb-waive assumes-single-replica(cache): temporary, tracked in #0000.\nexport const cache = new Map<string, number>();\n",
  });
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver naming a DEAD (mismatched) position on assumes-single-replica alarms and suppresses nothing", () => {
  const mismatched = passOf(assumesSingleReplica, {
    "packages/server/src/domain/hub/x.ts":
      "// @orb-waive assumes-single-replica(nonexistent): names a position this finding does not report.\nexport const cache = new Map<string, number>();\n",
  });
  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms.some((alarm) => alarm.message.includes("dead position"))).toBe(true);
});
