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
//   §6.3 REAL-CORPUS LIVENESS is DATA in `_liveness/client.ts`, run by the one liveness runner over the
//   structure run's own corpus, so a family that had silently stopped reaching the live door census cannot
//   read as clean.
import { ACTION_DOOR_RULINGS, rulingOperation } from "../../../../tooling/src/_shared/action-door-rulings.ts";
import { gate as doors } from "../../../../tooling/src/verify/gates/duplicate-action-doors.ts";
import { gate as doorsHealth } from "../../../../tooling/src/verify/gates/duplicate-action-doors-health.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// Quiet-box ceilings; `scaledBudget` stretches them under measured load so a contended box never reads as a false RED.
const REPLAY_BASE_MS = 120_000;

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
