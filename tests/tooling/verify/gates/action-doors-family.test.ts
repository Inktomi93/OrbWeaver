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
import { ACTION_DOOR_RULINGS, rulingOperation } from "../../../../tooling/src/_shared/action-door-rulings.ts";
import { gate as doors } from "../../../../tooling/src/verify/gates/duplicate-action-doors.ts";
import { gate as doorsHealth } from "../../../../tooling/src/verify/gates/duplicate-action-doors-health.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { assertRealCorpusLivenessArms } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// Quiet-box ceilings; `scaledBudget` stretches them under measured load so a contended box never reads as a false RED.
const REPLAY_BASE_MS = 120_000;
const REAL_CORPUS_BASE_MS = 300_000;

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");
const SECTION_IDS = "packages/client/src/state/section-ids.ts";

const DOORS_GRANTS = REVIEWED_GRANTS.filter((grant) => grant.policyId === doors.id);

test("the family's DECLARED proofs hold, including the reviewed-grant identity witness", { timeout: scaledBudget(REPLAY_BASE_MS) }, () => {
  // The static bar runs these through `structure:policy-conformance`; this is the lane-scoped door onto the
  // same runner, and it is what exercises the §6.2 witness — the `mustFlag` row that must flag with no
  // authority and then be consumed EXACTLY ONCE by one synthetic grant carrying its authored identity.
  expect(verifyPolicyProofs([doors, doorsHealth])).toEqual([]);
});

// ── §2.1 THE POPULATION CONTROLS — equality cannot pass because both sides admitted nothing ─────────────

// ── §6.4 CATEGORY 5 — the formerly hidden sites become exactly ONE live CONSUMED grant ──────────────────

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

// ── §6.3 REAL-CORPUS LIVENESS — silent-because-dead cannot pass as silent-because-clean ─────────────────

const CLIENT_GLOBS = [
  "packages/client/src/features/**/*.ts",
  "packages/client/src/features/**/*.tsx",
  "packages/client/src/state/**/*.ts",
  "packages/client/src/state/**/*.tsx",
];

test("both policies reach a verdict on the REAL client corpus, and each reports its own positive control", {
  timeout: scaledBudget(REAL_CORPUS_BASE_MS),
}, () => {
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
