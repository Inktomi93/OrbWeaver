// The standing conformance net for the `density-tier` family — three final policies over one shared
// `lib/density-tier.ts`: the reviewed-grant occurrence policy, the hard slot-map policy, and the hard
// home-health tripwire.
//
// WHAT ONLY THIS FILE CAN PROVE. `verifyPolicyProofs` runs each module's declared rows, which the static
// conformance stage already does. Four things a declared row CANNOT express, and all four are the
// load-bearing half of the 2026-09-13 authority migration (#1939):
//   · §4.3 GRANT IDENTITY against a REAL grant table. A proof row pins `reviewedGrants: []`, so no declared
//     row can show a grant being consumed, a WRONG OPERATION leaving the finding effective, or a ruled act
//     with no live site going STALE. That last one is the successor to the legacy `A5a` stale-baseline-row
//     arm, which this conversion deleted from the module because the engine now owns it.
//   · §4.7 PLANTED-BREAK RECEIPTS for the conversion's two INVENTED properties — the FILE subject and the
//     ACT operation. Both are new with the conversion (the legacy ratchet held one number per file across
//     three arms), so each owes an arm that dies when the property is cut.
//   · THE OVER-BROAD GUARD. A grant matching two findings licenses NEITHER and alarms; that behaviour is
//     pinned centrally in `tests/tooling/verify/lib/gate-authority.test.ts`, so it is CITED here rather than
//     re-planted — what this file proves is that this family's granularity cannot produce that state.
//   · THE SHIPPED TABLE'S INTEGRITY. The 57 committed rows must be spelled on this policy's identity axes,
//     or they are stale on arrival and only the real tree finds out.
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { POPULATION_ROOTS } from "../../../../tooling/src/verify/contract/population.ts";
import { gate as densityTier } from "../../../../tooling/src/verify/gates/density-tier.ts";
import { gate as slotMap } from "../../../../tooling/src/verify/gates/density-tier-slot-map.ts";
import { UI_SOURCE_ROOT } from "../../../../tooling/src/verify/lib/density-tier.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/density-tier-family";

function passOf(files: Readonly<Record<string, string>>, grants: readonly ReviewedGateGrant[] = []): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const policies: readonly GatePolicy[] = [densityTier];
  return runPolicyPass({ knownPolicies: policies, policies, root: ROOT, project, reviewedGrants: grants, failOnWarnings: false });
}

function grant(subject: string, operation: string): ReviewedGateGrant {
  return {
    id: `density-tier:${operation}-${subject.replaceAll("/", "-")}`,
    policyId: "density-tier",
    subject,
    operation,
    why: "a family-test fixture row: the arms below are about grant IDENTITY, not about any real repository ruling.",
    endsWhen: "this test stops driving the grant surface.",
  };
}

/** ONE file, ONE act, TWO occurrences — the shape that would be two findings (and therefore an over-broad,
 *  licensing-nothing grant) if the policy reported per occurrence rather than per `(file, act)`. */
const TWO_SITES = {
  "packages/client/src/features/a/pair.tsx": 'export const G = <><Text size="micro">a</Text><Text size="label">b</Text></>;\n',
} as const;

/** ONE file, TWO different acts — the guarantee the per-file count ratchet LOST. */
const TWO_ACTS = {
  "packages/client/src/features/a/mixed.tsx":
    'export const G = <div className="rounded-base border border-border bg-card"><Text size="micro">x</Text><span className="rounded-base border border-border bg-muted" /></div>;\n',
} as const;

test("every declared proof row of both policies holds through the production dispatcher", () => {
  expect(verifyPolicyProofs([densityTier, slotMap])).toEqual([]);
});

test("the migration's shape is the thing under test: one reviewed-grant occurrence policy and one hard whole-population sibling", () => {
  // The tripwire on every assumption the arms below rest on. Flipping `density-tier` to `ordinary` would
  // open an inline waiver door the density law deliberately does not have (a density ruling is a REVIEW, not
  // a line-local note); flipping the sibling's `execution` would acquit a mapped-but-dead slot whose emitter
  // sat outside the selection.
  expect([densityTier.id, densityTier.family, densityTier.authority, densityTier.severity, densityTier.execution]).toEqual([
    "density-tier",
    "density-tier",
    "reviewed-grant",
    "error",
    "selected-files",
  ]);
  expect([slotMap.id, slotMap.family, slotMap.authority, slotMap.execution]).toEqual(["density-tier-slot-map", "density-tier", "hard", "entire-population"]);
});

test("§4.7 IN-FILE AGGREGATION: two occurrences of ONE act in ONE file are ONE finding naming both lines", () => {
  const { authority } = passOf(TWO_SITES);
  expect(authority.effectiveFindings).toHaveLength(1);
  const [finding] = authority.effectiveFindings;
  expect([finding?.subject, finding?.operation]).toEqual(["packages/client/src/features/a/pair.tsx", "text-axis:size"]);
  // The line list is what keeps an aggregate finding actionable — the grant is per act, the fix is per site.
  expect(finding?.message).toContain("line(s): 1");
});

test("§4.7 THE ACT IS THE OPERATION: one file performing two different acts is TWO findings, which the per-file budget could not see", () => {
  // THE PLANTED BREAK for the conversion's core invented property. The legacy ratchet held ONE number per
  // file across A1/A2/A3, so a new KIND of violation was absolved by arithmetic whenever an old occurrence
  // left. Collapse `operation` to a constant in lib/density-tier.ts and this arm reports one finding.
  const { authority } = passOf(TWO_ACTS);
  expect(authority.effectiveFindings.map((finding) => finding.operation).toSorted()).toEqual(["box-in-box", "text-axis:size"]);
});

test("§4.7 THE SUBJECT IS THE FILE: the same act in two files is two findings and needs two grants", () => {
  // The other invented property. Were the subject anything coarser than the file, ONE grant would match two
  // findings, license NOTHING and raise `over-broad-reviewed-grant` — the state aggregation exists to make
  // unreachable. Pinned centrally in tests/tooling/verify/lib/gate-authority.test.ts; this arm proves this
  // policy's granularity cannot reach it.
  const { authority } = passOf({
    "packages/client/src/features/a/one.tsx": 'export const A = <Text size="micro">a</Text>;\n',
    "packages/client/src/features/b/two.tsx": 'export const B = <Text size="micro">b</Text>;\n',
  });
  expect(authority.effectiveFindings.map((finding) => finding.subject).toSorted()).toEqual([
    "packages/client/src/features/a/one.tsx",
    "packages/client/src/features/b/two.tsx",
  ]);
});

test("§4.3 GRANT IDENTITY: the intended row consumes the act exactly once and licenses it", () => {
  const { authority } = passOf(TWO_SITES, [grant("packages/client/src/features/a/pair.tsx", "text-axis:size")]);
  expect(authority.effectiveFindings).toEqual([]);
  expect(authority.grantedFindings).toHaveLength(1);
  expect(authority.authorityAlarms).toEqual([]);
  // EXACTLY ONE — the predicate `processReviewed` licenses on. Two would license NOTHING and alarm
  // over-broad, which is the failure mode aggregation exists to make unreachable.
  expect(authority.reviewedGrantConsumption.map((row) => row.count)).toEqual([1]);
});

test("§4.3 WRONG OPERATION: a row ruling the `tone` axis does not license a `size` finding in the same file", () => {
  // THE GUARANTEE THE COUNT RATCHET LOST AND THIS IDENTITY KEEPS, driven: under the per-file budget a file
  // ruled for two axes absolved ANY two occurrences. Here a ruling names its act and nothing else.
  const { authority } = passOf(TWO_SITES, [grant("packages/client/src/features/a/pair.tsx", "text-axis:tone")]);
  expect(authority.effectiveFindings).toHaveLength(1);
  expect(authority.grantedFindings).toEqual([]);
  expect(authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["stale-reviewed-grant"]);
});

test("THE A5a STALE-ROW SUCCESSOR: a grant whose act has no live site alarms, which is what the deleted baseline arm did", () => {
  // The legacy module carried the stale-baseline-row arm — "budgets N finding(s) for X but only M remain —
  // the ratchet only goes down". The conversion deleted that code because central reconciliation produces
  // the same verdict from ZERO consumption, and it also catches the over-broad direction the legacy arm had
  // no word for. This is that claim, driven.
  const { authority } = passOf(TWO_SITES, [
    grant("packages/client/src/features/a/pair.tsx", "text-axis:size"),
    grant("packages/client/src/features/gone/retired.tsx", "box-in-box"),
  ]);
  expect(authority.effectiveFindings).toEqual([]);
  expect(authority.authorityAlarms.map((alarm) => [alarm.kind, "subject" in alarm ? alarm.subject : null])).toEqual([
    ["stale-reviewed-grant", "packages/client/src/features/gone/retired.tsx"],
  ]);
});

test("THE POPULATION FENCE holds against a real anchor: a file outside @client/@ui is not judged", () => {
  // The fence's falsifier needs an IN-population anchor beside the out-of-population file, or the run comes
  // back a `[population]` tool error rather than a clean pass and proves nothing.
  const { authority, toolErrors } = passOf({
    "packages/client/src/keep.ts": "export const keep = 1;\n",
    "packages/contracts/src/outside.tsx": 'export const G = <div className="rounded-card border border-border bg-card" />;\n',
  });
  expect(toolErrors).toEqual([]);
  expect(authority.effectiveFindings).toEqual([]);
});

test("every shipped `density-tier` grant is spelled on this policy's identity axes — a repo path subject and a closed act", () => {
  // A row that drifted to a non-path subject or an act this policy never emits would be stale on arrival and
  // only the real tree would find out. The act vocabulary is closed by construction in lib/density-tier.ts:
  // A1/A2/A4 emit fixed strings and A3 emits one of the four internal type axes.
  const acts = new Set(["elevated-radius", "box-in-box", "surface-tier-write", "text-axis:size", "text-axis:weight", "text-axis:tone", "text-axis:transform"]);
  const rows = REVIEWED_GRANTS.filter((row) => row.policyId === "density-tier");
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.filter((row) => !acts.has(row.operation))).toEqual([]);
  expect(rows.filter((row) => !(row.subject.startsWith("packages/client/src/") || row.subject.startsWith("packages/ui/src/")))).toEqual([]);
  expect(rows.filter((row) => !(row.subject.endsWith(".ts") || row.subject.endsWith(".tsx")))).toEqual([]);
  // Every grant identity is unique: a duplicate `(subject, operation)` pair is refused by the engine as
  // `duplicate-grant-identity`, and catching it here names the row instead of the whole table.
  const identities = rows.map((row) => `${row.subject} ${row.operation}`);
  expect(new Set(identities).size).toBe(identities.length);
});

test("the two retired PATH TABLES are covered grant-for-grant, and the D6 elevated family is complete", () => {
  // The §6.4 exemption-mechanism move, as a committed assertion: every formerly hidden site is exactly one
  // live grant. `ELEVATED_ALLOW` had ELEVEN prefix rows and the tier writer was a hardcoded constant; the
  // successor is TWELVE per-file `elevated-radius` grants (the immersive-card DIRECTORY row covered two
  // files, which is the precision a prefix row did not have) plus ONE `surface-tier-write` grant. A prefix
  // row that lost its successor would leave a real elevated surface red on the next whole run.
  const rows = REVIEWED_GRANTS.filter((row) => row.policyId === "density-tier");
  const elevated = rows.filter((row) => row.operation === "elevated-radius").map((row) => row.subject);
  expect(elevated.toSorted()).toEqual([
    "packages/client/src/features/chat/components/composer-drop-target.tsx",
    "packages/client/src/features/chat/surfaces/command-palette-surface.tsx",
    "packages/client/src/lib/message-bubble-class.ts",
    "packages/ui/src/content/immersive-card/immersive-card.tsx",
    "packages/ui/src/content/immersive-card/variants.ts",
    "packages/ui/src/primitives/card/variants.ts",
    "packages/ui/src/primitives/command/variants.ts",
    "packages/ui/src/primitives/macro-textarea/variants.ts",
    "packages/ui/src/primitives/menu/variants.ts",
    "packages/ui/src/primitives/popover/variants.ts",
    "packages/ui/src/primitives/selection-bar/variants.ts",
    "packages/ui/src/primitives/toast/variants.ts",
  ]);
  expect(rows.filter((row) => row.operation === "surface-tier-write").map((row) => row.subject)).toEqual(["packages/ui/src/layout/surface.tsx"]);
  // Every row owes a non-empty `why` and `endsWhen` — a permission that cannot say what ends it is parked
  // debt wearing a permit, which is exactly what the retired ratchet's `ratified` field promised and what
  // the grant contract now carries.
  expect(rows.filter((row) => row.why.trim() === "" || row.endsWhen.trim() === "")).toEqual([]);
});

test("UI_SOURCE_ROOT is a LITERAL that must equal the declared `@ui` population root", () => {
  // The literal is forced: an export aliasing `POPULATION_ROOTS["@ui"][0]` makes `policy-legacy-imports`
  // fail closed on "aliases another binding whose canonical origin is not proven" and WITHHOLD that policy
  // for the whole corpus (measured at conversion, #2320). So the two-sidedness lives here instead — a root
  // respelling reds in a test naming both sides rather than silently un-fencing the primitive tier, which
  // would make every `data-slot` stamp in packages/ui look rogue and every mapped slot look unemitted.
  expect(UI_SOURCE_ROOT).toBe(POPULATION_ROOTS["@ui"][0]);
});

test("a shipped ELEVATED grant licenses its own file and nothing else — the path-subtraction's successor", () => {
  // The legacy `ELEVATED_ALLOW` subtracted a DIRECTORY, so every file under it was silently permitted. The
  // successor grant names one file: the same bytes one file over in the same primitive directory are a
  // finding. This is the precision half of the strengthening the module header claims, driven rather than
  // asserted in prose.
  const popover = "packages/ui/src/primitives/popover/variants.ts";
  const sibling = "packages/ui/src/primitives/popover/parts.ts";
  const source = 'export const v = tv({ base: "rounded-card border border-border bg-popover" });\n';
  const licensed = passOf({ [popover]: source }, [grant(popover, "elevated-radius")]);
  expect(licensed.authority.effectiveFindings).toEqual([]);
  expect(licensed.authority.reviewedGrantConsumption.map((row) => row.count)).toEqual([1]);
  const neighbour = passOf({ [sibling]: source }, [grant(popover, "elevated-radius")]);
  expect(neighbour.authority.effectiveFindings.map((finding) => finding.subject)).toEqual([sibling]);
  expect(neighbour.authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["stale-reviewed-grant"]);
});
