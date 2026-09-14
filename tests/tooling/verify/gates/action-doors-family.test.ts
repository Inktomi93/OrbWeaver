// The `action-doors` family test (#1584). The family is `duplicate-action-doors` (reviewed-grant) +
// `duplicate-action-doors-health` (hard) over one shared `actionDoorFact` provider. Everything a PROOF ROW
// can express lives in their own `mustFlag`/`mustPass`/`mustRefuse` rows and runs on the static bar through
// `structure:policy-conformance`. This file carries ONLY what a row structurally cannot:
//
//   §6.4 THE CONVERSION DIFFERENTIAL — the frozen legacy descriptor at `9dca9fca4` (the conversion commit's
//   parent) and the two final policies, replayed over the SAME BYTES: every legacy example, both
//   populations, both finding sets, both tool-error sets, each difference CLASSIFIED.
//
//   §6.4 CATEGORY 5, WHICH THE IN-MEMORY DOOR CANNOT CLAIM — an exemption-mechanism move must prove every
//   formerly hidden site becomes exactly ONE live CONSUMED grant, and `createDifferential`'s `Replay` has no
//   grant channel by construction. The two fixtures the retired `EXEMPT_PROCEDURES` table hid are therefore
//   driven through `finalPass` WITH the central ruling and asserted at one consumed grant / zero effective.
//
//   §2.1 THE POPULATION CONTROLS — an INSIDE file both sides admit and an OUTSIDE file both sides reject, so
//   the set-difference claim cannot pass because both sides admitted nothing.
//
//   §4.3 CENTRAL GRANT IDENTITY — the real `lib/reviewed-grants.ts` rows, in all three directions: the exact
//   identity consumed once, a wrong OPERATION leaving the finding effective and alarming stale, and a
//   THIRD door changing the door set so the two-door ruling licenses nothing. Those three replace the
//   retired baseline's `cite`-set judge and its hand-rolled stale sweep.
//
//   §6.3 REAL-CORPUS LIVENESS — a virtual overlay on the repository's own client, so a family that had
//   silently stopped reaching the live door census cannot read as clean.
import { Project } from "ts-morph";
import { ACTION_DOOR_RULINGS, rulingOperation } from "../../../../tooling/src/_shared/action-door-rulings.ts";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as doors } from "../../../../tooling/src/verify/gates/duplicate-action-doors.ts";
import { gate as doorsHealth } from "../../../../tooling/src/verify/gates/duplicate-action-doors-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { DifferentialClaim, Files } from "../../../support/legacy-differential.ts";
import { createDifferential, differentialViolations, frozenLegacyGate, inMemorySide, label, legacyScenarios } from "../../../support/legacy-differential.ts";
import { assertRealCorpusLivenessArms } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");
/** The conversion commit's PARENT — the last tree carrying the legacy `GateDescriptor`. */
const LEGACY_BASE = "9dca9fca4";
const LEGACY_PATH = "tooling/src/verify/gates/duplicate-action-doors.ts";
/** Where a legacy example with no `scanRoot`-admitted file would be anchored. Every example here has one. */
const FALLBACK = "packages/client/src/features/chat/components/a.tsx";
const SECTION_IDS = "packages/client/src/state/section-ids.ts";
const A = "packages/client/src/features/chat/components/a.tsx";
const B = "packages/client/src/features/chat/components/b.tsx";

const DOORS_GRANTS = REVIEWED_GRANTS.filter((grant) => grant.policyId === doors.id);

const differential = createDifferential("/action-doors-family", (owner, phase, message) => {
  throw new Error(`unclassified action-doors differential tool error: ${owner}/${phase}: ${message}`);
});

/** The compact labels the differential compares in, spelled once so a scenario reads as a claim. */
const LEGACY_DOOR = (file: string): string => `legacy | ${file}:1 | chats::chat.forkChat | one tRPC mutation is invoked from more compone`;
const LEGACY_BLIND = "legacy | tooling/src/verify/gates/duplicate-action-doors.ts:1 | - | BLINDNESS TRIPWIRE — `SECTION_IDS` resolved to";
const FINAL_DOOR = (file: string): string => `duplicate-action-doors | ${file}:1 | - | one tRPC mutation is invoked from more than on`;
const FINAL_BLIND_VOCAB = `duplicate-action-doors-health | ${SECTION_IDS}:1 | - | BLINDNESS TRIPWIRE — \`SECTION_IDS\` resolved to`;
const FINAL_BLIND_SECTIONS = `duplicate-action-doors-health | ${SECTION_IDS}:1 | - | BLINDNESS TRIPWIRE — zero rail-section definit`;

/** The SAME comparison with the message UNTRUNCATED. The harness's default `label` keeps 46 characters, which
 *  is enough to tell the arms apart but stops short of the `Subject: …` tail — and the subject IS the grant
 *  identity this conversion turns on, so a successor proof that cannot name it proves the wrong thing. */
const wide = (seen: Parameters<typeof label>[0]): string => `${seen.policyId ?? "legacy"} | ${seen.file}:${seen.line} | ${seen.token ?? "-"} | ${seen.message}`;

/** One legacy example's declared differential. `claims` is checked against the evidence, never assumed. */
interface Row {
  readonly why: string;
  readonly legacy: readonly string[];
  readonly legacyPopulation: number;
  readonly final: readonly string[];
  readonly finalPopulation: number;
  readonly claims: readonly DifferentialClaim[];
}

const ROWS: readonly Row[] = [
  {
    why: "mustFlag[0] — the #947 imported-spread plane. Both sides catch the pair at the same file and line; only the IDENTITY moved (a legacy discriminator label `chats::chat.forkChat` in the token slot vs the final's `Subject:` in the message, §2.1: a legacy label never ports as a final position). The FINAL population is one larger, and that one file is `state/core-section-ids.ts` — the spread source the legacy `scanRoot` did not admit while its readers walked the whole project anyway",
    legacy: [LEGACY_DOOR(A)],
    legacyPopulation: 4,
    final: [FINAL_DOOR(A)],
    finalPopulation: 5,
    claims: [{ classification: "anchor-move", successor: "Subject: chats::chat.forkChat" }],
  },
  {
    why: "mustFlag[1] — the founding two-door shape, no composition. Same catch, same anchor, identity moved; populations are byte-identical because this example declares no spread source",
    legacy: [LEGACY_DOOR(A)],
    legacyPopulation: 4,
    final: [FINAL_DOOR(A)],
    finalPopulation: 4,
    claims: [{ classification: "anchor-move", successor: "Subject: chats::chat.forkChat" }],
  },
  {
    why: "mustFlag[2] — the blindness tripwire, and the example that carries TWO differences at once. (a) THE SPLIT: the arm moved to the `-health` sibling and re-anchored from the gate's own source file (which no population admits) onto the vocabulary home through the shared subject-anchor rule. (b) THE EXEMPTION-MECHANISM MOVE: the two doors are `settings.updateUserSettingsSection`, which the retired `EXEMPT_PROCEDURES` table dropped out of the census entirely — the final reports them, and the central ruling licenses them (proved with the grant channel below, which this door has none of). The populations match at 3 with DIFFERENT members: the legacy admitted `packages/db/src/schema/index.ts` through its real-tree anchor, the final admits it nowhere and admits `state/section-ids.ts` instead",
    legacy: [LEGACY_BLIND],
    legacyPopulation: 3,
    final: [FINAL_DOOR(A), FINAL_BLIND_VOCAB],
    finalPopulation: 3,
    claims: [{ classification: "split", successor: "BLINDNESS TRIPWIRE" }],
  },
  {
    why: "mustPass[0] — the #947 green half: one door on a resolved composed plane. Both silent; the FINAL population is again one larger for the spread source",
    legacy: [],
    legacyPopulation: 3,
    final: [],
    finalPopulation: 4,
    claims: [{ classification: "vacuous-both-zero", successor: null }],
  },
  {
    why: "mustPass[1] — THE EXEMPTION-MECHANISM MOVE, isolated. The legacy `EXEMPT_PROCEDURES` row kept `settings.updateUserSettingsSection` out of the census, so a real two-door pair passed SILENTLY and a third door on it would have landed silently too. The final reports it raw; the central ruling consumes it (below)",
    legacy: [],
    legacyPopulation: 4,
    final: [FINAL_DOOR(A)],
    finalPopulation: 4,
    claims: [{ classification: "stronger-reader", successor: "Subject: chats::settings.updateUserSettingsSection" }],
  },
  {
    why: "mustPass[2] — the declared limit: two doors on two DIFFERENT planes is not the class. Both sides silent over identical populations",
    legacy: [],
    legacyPopulation: 5,
    final: [],
    finalPopulation: 5,
    claims: [{ classification: "vacuous-both-zero", successor: null }],
  },
  {
    why: "mustPass[3] — the declared limit: the unit is the COMPONENT, so one file wiring the verb twice is one door. Both sides silent over identical populations",
    legacy: [],
    legacyPopulation: 3,
    final: [],
    finalPopulation: 3,
    claims: [{ classification: "vacuous-both-zero", successor: null }],
  },
  {
    why: "mustPass[4] — a settings-section CONTRIBUTION mints no plane. The DOOR verdict is unchanged (both silent on the pair), but the final `-health` sibling now reports the sections tripwire this fixture genuinely satisfies: it declares zero rail-section definitions. The legacy arm was silent here ONLY because it was gated on a real-tree anchor (`packages/db/src/schema/index.ts`) that exists purely so its own conformance examples would not trip it — a fixture fence, not a predicate. The split retires the fence and gives the arm real fixtures instead",
    legacy: [],
    legacyPopulation: 3,
    final: [FINAL_BLIND_SECTIONS],
    finalPopulation: 3,
    claims: [{ classification: "split", successor: "zero rail-section definit" }],
  },
];

test("the family's DECLARED proofs hold, including the reviewed-grant identity witness", { timeout: 120_000 }, () => {
  // The static bar runs these through `structure:policy-conformance`; this is the lane-scoped door onto the
  // same runner, and it is what exercises the §6.2 witness — the `mustFlag` row that must flag with no
  // authority and then be consumed EXACTLY ONCE by one synthetic grant carrying its authored identity.
  expect(verifyPolicyProofs([doors, doorsHealth])).toEqual([]);
});

test("§6.4 — every legacy example replays over the same bytes, and every difference is classified", { timeout: 120_000 }, async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, LEGACY_BASE, LEGACY_PATH);
  expect(legacy.name, "the frozen blob is the LEGACY descriptor, not an already-converted policy").toBe(doors.id);
  const examples = legacyScenarios(legacy, FALLBACK);
  expect(ROWS.length, "every legacy example is declared — a dropped row would otherwise be silent").toBe(examples.length);

  for (const [index, row] of ROWS.entries()) {
    const files = examples[index] as Files;
    const tag = `#${index} ${row.why.slice(0, 60)}`;
    const before = differential.legacyReplay(legacy, files, label);
    const after = differential.finalReplay([doors, doorsHealth], files, label);

    expect(before.findings, `${tag} — LEGACY findings`).toEqual([...row.legacy].toSorted());
    expect(before.population, `${tag} — LEGACY population`).toBe(row.legacyPopulation);
    expect(before.toolErrors, `${tag} — LEGACY tool errors`).toEqual([]);
    expect(after.findings, `${tag} — FINAL findings`).toEqual([...row.final].toSorted());
    expect(after.population, `${tag} — FINAL population`).toBe(row.finalPopulation);
    expect(after.toolErrors, `${tag} — FINAL tool errors`).toEqual([]);
    const beforeWide = differential.legacyReplay(legacy, files, wide);
    const afterWide = differential.finalReplay([doors, doorsHealth], files, wide);
    for (const claim of row.claims) {
      expect(differentialViolations(claim, inMemorySide(beforeWide), inMemorySide(afterWide)), `${tag} — "${claim.classification}"`).toEqual([]);
    }
  }
});

// ── §2.1 THE POPULATION CONTROLS — equality cannot pass because both sides admitted nothing ─────────────

test("§2.1 — an INSIDE file is admitted by both engines and an OUTSIDE file by neither", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, LEGACY_BASE, LEGACY_PATH);
  const inside = "packages/client/src/features/chat/components/inside-control.tsx";
  const outside = "packages/client/src/data/outside-control.ts";
  const files: Files = {
    [SECTION_IDS]: 'export const SECTION_IDS = ["chats"] as const;\n',
    "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
    [inside]: "export const Inside = () => trpc.chat.forkChat.mutationOptions();\n",
    [outside]: "export const Outside = () => trpc.chat.forkChat.mutationOptions();\n",
  };
  // The OUTSIDE control is a real door grammar in a real client directory that neither population admits —
  // `data/` is not `features/` and not `state/`. If it were admitted it would mint a second door on the
  // `chats` plane and BOTH sides would report, which is what makes this a fence rather than a coincidence.
  expect(differential.legacyReplay(legacy, files, label).findings, "the legacy engine sees ONE door and stays below the floor").toEqual([]);
  const after = differential.finalReplay([doors, doorsHealth], files, label);
  expect(after.findings, "the final engine sees ONE door and stays below the floor").toEqual([]);
  // The INSIDE control is in the population and is the door both engines counted; the OUTSIDE one is not.
  expect(after.population, "the final population admits section-ids + the section def + the INSIDE control, never the outside one").toBe(3);
  expect(differential.legacyReplay(legacy, files, label).population, "the legacy scanRoot admits the same three").toBe(3);
});

// ── §6.4 CATEGORY 5 — the formerly hidden sites become exactly ONE live CONSUMED grant ──────────────────

/** The seam fixture the retired `EXEMPT_PROCEDURES` row hid, plus the ruling that now licenses it. */
const SEAM_FILES: Files = {
  [SECTION_IDS]: 'export const SECTION_IDS = ["chats"] as const;\n',
  "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
  [A]: "export const A = () => trpc.settings.updateUserSettingsSection.mutationOptions();\n",
  [B]: "export const B = () => trpc.settings.updateUserSettingsSection.mutationOptions();\n",
};

function seamGrant(overrides: Partial<ReviewedGateGrant> = {}): readonly ReviewedGateGrant[] {
  return [
    {
      id: "duplicate-action-doors:seam-fixture",
      policyId: doors.id,
      subject: "chats::settings.updateUserSettingsSection",
      operation: `duplicate-action-door-set:${A}, ${B}`,
      why: "the fixture twin of the live settings-section seam ruling",
      endsWhen: "the fixture changes",
      ...overrides,
    },
  ];
}

/** One pass over an ISOLATED in-memory project (§6.5), with the grants the arm is about. Its own project
 *  rather than the differential's shared one: a grant run and a differential replay must not be able to see
 *  each other's sources, and `createDifferential` deliberately reuses one workspace across scenarios. */
function runWith(files: Files, grants: readonly ReviewedGateGrant[]): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  const root = "/action-doors-grants";
  for (const [path, source] of Object.entries(files).toSorted(([left], [right]) => left.localeCompare(right))) {
    project.createSourceFile(`${root}/${path}`, source, { overwrite: true });
  }
  return runPolicyPass({
    knownPolicies: [doors, doorsHealth],
    policies: [doors, doorsHealth],
    root,
    project,
    reviewedGrants: [...grants],
    failOnWarnings: false,
  });
}

test("§6.4 category 5 — the site EXEMPT_PROCEDURES hid is reported raw and consumed by exactly one grant", () => {
  // THE BASELINE MUST FLAG WITHOUT A GRANT, or "consumed once" is a claim about nothing.
  const ungranted = runWith(SEAM_FILES, []);
  expect(ungranted.toolErrors, "the ungranted baseline must reach a verdict").toEqual([]);
  expect(
    ungranted.authority.effectiveFindings.map(({ subject }) => subject),
    "raw and effective, because the retired EXEMPT_PROCEDURES row is gone and no ruling has replaced it yet",
  ).toEqual(["chats::settings.updateUserSettingsSection"]);

  const granted = runWith(SEAM_FILES, seamGrant());
  expect(granted.toolErrors, "the granted run must not refuse").toEqual([]);
  expect(granted.authority.effectiveFindings, "zero effective once the exact ruling is present").toEqual([]);
  expect(granted.authority.grantedFindings, "exactly one consumed").toHaveLength(1);
  expect(granted.authority.authorityAlarms, "and no alarm").toEqual([]);
  expect(
    granted.authority.reviewedGrantConsumption.map(({ count }) => count),
    "every consumption count === 1",
  ).toEqual([1]);
});

// ── §4.3 CENTRAL GRANT IDENTITY, in all three directions ───────────────────────────────────────────────

test("the central rulings are the ten this migration minted, and their operations derive from the door sets", () => {
  expect(DOORS_GRANTS.map(({ id }) => id).toSorted()).toEqual(ACTION_DOOR_RULINGS.map(({ id }) => id).toSorted());
  for (const ruling of ACTION_DOOR_RULINGS) {
    const grant = DOORS_GRANTS.find(({ id }) => id === ruling.id);
    expect(grant?.operation, `${ruling.id} — the table's operation is DERIVED from the ruled door set`).toBe(rulingOperation(ruling));
    expect(grant?.subject).toBe(ruling.subject);
    expect(ruling.doors.length, `${ruling.id} — a ruling below the duplication floor rules nothing`).toBeGreaterThanOrEqual(2);
    expect([...ruling.doors].toSorted(), `${ruling.id} — the door set is PATH-SORTED; order is part of the identity`).toEqual([...ruling.doors]);
  }
});

test("a WRONG OPERATION licenses nothing — the finding stays effective and the row alarms stale", () => {
  const result = runWith(SEAM_FILES, seamGrant({ operation: "duplicate-action-door-set:some/other/door.tsx" }));

  expect(result.authority.effectiveFindings).toHaveLength(1);
  expect(result.authority.grantedFindings).toEqual([]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toContain("stale-reviewed-grant");
});

test("a THIRD door changes the ruled SET, so the two-door ruling licenses nothing — the #2101 defect, kept dead", () => {
  const third = "packages/client/src/features/chat/components/c.tsx";
  const result = runWith({ ...SEAM_FILES, [third]: "export const C = () => trpc.settings.updateUserSettingsSection.mutationOptions();\n" }, seamGrant());

  expect(result.authority.effectiveFindings, "the pair reports again at three doors").toHaveLength(1);
  expect(result.authority.effectiveFindings[0]?.operation, "and the operation names all three").toBe(`duplicate-action-door-set:${A}, ${B}, ${third}`);
  expect(result.authority.grantedFindings, "the two-door ruling consumes nothing").toEqual([]);
  expect(
    result.authority.authorityAlarms.map(({ kind }) => kind),
    "and it alarms as a dead ruling",
  ).toContain("stale-reviewed-grant");
});

test("a SWAPPED door is caught on both sides, where a cardinality budget saw two doors and two doors", () => {
  // The #2101 defect in its sharpest form: same count, different doors. A per-door or per-excess-door grant
  // identity re-opens this (the incumbent is chosen lexicographically and moves with the swap); the SET does
  // not. This row is why the operation carries every door.
  const swapped: Files = {
    ...SEAM_FILES,
    [B]: "export const Unrelated = () => 1;\n",
    "packages/client/src/features/chat/components/d.tsx": "export const D = () => trpc.settings.updateUserSettingsSection.mutationOptions();\n",
  };
  const result = runWith(swapped, seamGrant());

  expect(result.authority.effectiveFindings, "the swapped pair reports").toHaveLength(1);
  expect(result.authority.grantedFindings, "the old ruling consumes nothing").toEqual([]);
  expect(
    result.authority.authorityAlarms.map(({ kind }) => kind),
    "and the orphaned ruling alarms",
  ).toContain("stale-reviewed-grant");
});

// ── §6.3 REAL-CORPUS LIVENESS — silent-because-dead cannot pass as silent-because-clean ─────────────────

const CLIENT_GLOBS = [
  "packages/client/src/features/**/*.ts",
  "packages/client/src/features/**/*.tsx",
  "packages/client/src/state/**/*.ts",
  "packages/client/src/state/**/*.tsx",
];

test("both policies reach a verdict on the REAL client corpus, and each reports its own positive control", { timeout: 300_000 }, () => {
  const probeA = "packages/client/src/features/chat/components/pcdd-live-probe-a.tsx";
  const probeB = "packages/client/src/features/chat/components/pcdd-live-probe-b.tsx";
  const fired = assertRealCorpusLivenessArms(REPO_ROOT, [
    {
      policy: doors,
      globs: CLIENT_GLOBS,
      // TWO overlays because one door is not a duplication: the pair must be minted whole. Both paths sort
      // BEFORE every real door of their own new procedure, so the aggregated finding anchors on `…-a.tsx`
      // and the arm's `add` scope can see it.
      overlays: [
        { kind: "add", path: probeA, source: "export const A = () => trpc.chat.pcddLiveProbe.mutationOptions();\n" },
        { kind: "add", path: probeB, source: "export const B = () => trpc.chat.pcddLiveProbe.mutationOptions();\n" },
      ],
      messageIncludes: "Subject: chats::chat.pcddLiveProbe",
    },
    {
      policy: doorsHealth,
      globs: CLIENT_GLOBS,
      // A tripwire fires when its SUBJECT DISAPPEARS, so the control is the inverse: overwrite the
      // vocabulary home with a version that declares no `SECTION_IDS`.
      overlays: [{ kind: "neutralise", path: SECTION_IDS, source: "export const SECTION_IDS_RENAMED = [] as const;\n" }],
      messageIncludes: "`SECTION_IDS` resolved to ZERO members",
    },
  ]);
  expect([...fired.keys()].toSorted(), "both arms ran — a skipped arm runs zero expects and reads green").toEqual([doors.id, doorsHealth.id].toSorted());
});
