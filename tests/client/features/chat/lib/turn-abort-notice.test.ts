// Unit: the turn-abort notification mapper (features/chat/lib/turn-abort-notice). The CT QueryClient has
// no MutationCache seam so toast copy is unobservable in a CT (ct-queryclient precedent) — the reason→copy
// and the `aborted`-code→silence decisions are pure and tested HERE. Covers all three TurnAbortReason arms
// AND proves the hook-side suppression is `aborted`-NARROW (a real fault still toasts).

import { TURN_ABORT_REASONS, TURN_ABORTED_OP_CODE } from "@orb/contracts/chat";
import { isSilencedTurnAbort, TURN_STALE_ABORT_COPY, turnAbortNotice } from "../../../../../packages/client/src/features/chat/lib/turn-abort-notice.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// ── turnAbortNotice: reason → user-visible copy (or null) ──────────────────────────────────────────

test("stale → the honest takeover copy (another session claimed the chat; nothing saved)", () => {
  expect(turnAbortNotice("stale")).toBe(TURN_STALE_ABORT_COPY);
  // Honest about BOTH what happened and the resulting state — no lock vocabulary leaks to the user.
  expect(TURN_STALE_ABORT_COPY).toContain("taken over by another session");
  expect(TURN_STALE_ABORT_COPY).toContain("wasn't saved");
});

test("user → null: a deliberate cancel needs no notice (existing silence stays)", () => {
  expect(turnAbortNotice("user")).toBeNull();
});

test("error → null: a real fault already rides the tRPC error boundary (no double-notify)", () => {
  expect(turnAbortNotice("error")).toBeNull();
});

test("every TurnAbortReason is handled (exhaustive — a new reason must decide its notice)", () => {
  for (const reason of TURN_ABORT_REASONS) {
    // No throw from the mapper's assertNever guard — each arm returns string|null.
    expect(() => turnAbortNotice(reason)).not.toThrow();
  }
});

// ── isSilencedTurnAbort: the aborted-code → suppress-generic-toast predicate ────────────────────────

test("the aborted op-code on data.reason silences the generic hook toast", () => {
  const staleReject = {
    data: { code: "BAD_REQUEST", reason: TURN_ABORTED_OP_CODE },
    message: "chat chat_1: turn-lock lost mid-turn (stolen or gone)",
  };
  expect(isSilencedTurnAbort(staleReject)).toBe(true);
});

test("a DIFFERENT domain code does NOT silence — a real fault still toasts (narrow suppression)", () => {
  const otherRefusal = { data: { code: "BAD_REQUEST", reason: "not_turn_owner" }, message: "chat chat_1: cannot abort a turn you do not own" };
  expect(isSilencedTurnAbort(otherRefusal)).toBe(false);
});

test("a codeless / network error does NOT silence (nothing genuine is swallowed)", () => {
  expect(isSilencedTurnAbort({ data: { code: "BAD_REQUEST" }, message: "boom" })).toBe(false);
  expect(isSilencedTurnAbort(new Error("network down"))).toBe(false);
  expect(isSilencedTurnAbort(null)).toBe(false);
  expect(isSilencedTurnAbort(undefined)).toBe(false);
});
