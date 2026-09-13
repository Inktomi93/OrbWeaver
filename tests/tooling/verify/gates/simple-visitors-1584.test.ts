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
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as assumesSingleReplica } from "../../../../tooling/src/verify/gates/assumes-single-replica.ts";
import { gate as noHardcodedModelProse } from "../../../../tooling/src/verify/gates/no-hardcoded-model-prose.ts";
import { gate as noVanityAlias } from "../../../../tooling/src/verify/gates/no-vanity-alias.ts";
import { gate as publicRouteBodyCap } from "../../../../tooling/src/verify/gates/public-route-body-cap.ts";
import { gate as publicRouteBodyCapHealth } from "../../../../tooling/src/verify/gates/public-route-body-cap-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/simple-visitors-1584";
const BASE = "86ce80b6c74e72f758727b4327dcdddfac0685b3";

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

// ---------------------------------------------------------------------------------------------------
// FROZEN-LEGACY DIFFERENTIAL: replay every ORIGINAL mustFlag/mustPass example from the pre-conversion
// source (86ce80b6c) through both the legacy dispatcher and the final one.
// ---------------------------------------------------------------------------------------------------
function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/server/src/x.ts"]: example.files } : example.files;
}

// Findings compare by FILE + COUNT, not message text: every converted module intentionally appends a
// specific WHAT clause (which shape tripped — a Map, an array, a route method, a dead const) onto its
// legacy message, which the legacy descriptors folded into shared prose or omitted. That is a message
// improvement the anchor-token design deliberately makes room for (guide §6.4 — "when a conversion's
// predicate disagrees with the legacy predicate, the MESSAGE is the thing to fix"), never a narrowed catch;
// FILE+COUNT parity is what proves no site went quiet or changed cardinality.
function legacyFindings(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly string[] {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  expect(result.gates).toHaveLength(1);
  return (result.gates[0]?.findings ?? []).map((finding) => finding.file).toSorted((left, right) => left.localeCompare(right));
}

function finalFindings(gate: GatePolicy, files: Readonly<Record<string, string>>): readonly string[] {
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  return result.authority.effectiveFindings.map((finding) => finding.file).toSorted((left, right) => left.localeCompare(right));
}

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

async function frozenLegacyGate(path: string, scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${path}`], { encoding: "utf8" });
  const target = join(scratch, basename(path));
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(path)}`)) as { readonly gate: GateDescriptor }).gate;
}

// Three rows are EXCLUDED from the blanket replay, none because of a narrowed catch:
//   - no-hardcoded-model-prose's TWO `PROSE-OK`-marker rows (the mustFlag "marker's two-sided arms" row and
//     the mustPass "a WELL-FORMED marker … escapes the unit" row) exercised the PRIVATE marker grammar this
//     conversion retires; a `// PROSE-OK: …` comment is plain non-marker text under the final policy (it
//     resolves through the central `@orb-waive` grammar instead), so replaying them verbatim would compare
//     the OLD suppression mechanism against a policy that no longer implements it. The central engine's own
//     suppression/staleness proof (`ordinary-waiver.test.ts`) is the successor, run once for every ordinary
//     policy — guide §6.2 forbids copying a negative marker arm into a gate for the same reason.
//   - public-route-body-cap's whole-population census row ("fail loud when the canonical route tree yields
//     no mutating/body-reading population") is now `public-route-body-cap-health`'s founding mustFlag row
//     (asserted directly in that module's own proofs, run by `verifyPolicyProofs` above) — it is a HARD,
//     entire-population, file-anchored absence verdict and has no ordinary-policy home to replay into.
function isRetiredIntoSiblingExample(gatePath: string, example: GateExample): boolean {
  const why = example.why ?? "";
  if (gatePath === "tooling/src/verify/gates/no-hardcoded-model-prose.ts" && (why.includes("marker's two-sided arms") || why.includes("WELL-FORMED marker"))) {
    return true;
  }
  return gatePath === "tooling/src/verify/gates/public-route-body-cap.ts" && why.includes("fail loud when the canonical route tree");
}

test("the final policies match the frozen legacy policies on every original proof corpus", async ({ scratch }) => {
  for (const [path, policy] of [
    ["tooling/src/verify/gates/assumes-single-replica.ts", assumesSingleReplica],
    ["tooling/src/verify/gates/no-vanity-alias.ts", noVanityAlias],
    ["tooling/src/verify/gates/public-route-body-cap.ts", publicRouteBodyCap],
    ["tooling/src/verify/gates/no-hardcoded-model-prose.ts", noHardcodedModelProse],
  ] as const) {
    const legacy = await frozenLegacyGate(path, scratch);
    for (const example of [...legacy.mustFlag, ...legacy.mustPass]) {
      if (isRetiredIntoSiblingExample(path, example)) {
        continue;
      }
      const files = legacyFiles(example);
      expect(finalFindings(policy, files), `${policy.id}: ${example.why}`).toEqual(legacyFindings(legacy, files));
    }
  }
});
