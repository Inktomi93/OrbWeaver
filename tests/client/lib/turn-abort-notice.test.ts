// Unit: the turn-abort notification mapper (features/chat/lib/turn-abort-notice). The CT QueryClient has
// no MutationCache seam so toast copy is unobservable in a CT (ct-queryclient precedent) — the reason→copy
// and the `aborted`-code→silence decisions are pure and tested HERE. Covers all three TurnAbortReason arms
// AND proves the hook-side suppression is `aborted`-NARROW (a real fault still toasts).

import { TURN_ABORT_REASONS, TURN_ABORTED_OP_CODE, TURN_LOCKED_OP_CODE } from "@orb/contracts/chat";
import {
  isSilencedTurnAbort,
  TURN_LOCKED_COPY,
  TURN_STALE_ABORT_COPY,
  turnAbortNotice,
  turnMutationToast,
} from "../../../packages/client/src/lib/turn-abort-notice.ts";
import { expect, test } from "../../support/fixtures.ts";

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

// ── turnMutationToast: the ONE toast decision every turn-starting mutation passes ────────────────────
// The CONTENTION arm is the defect this closes (measured 2026-08-14): a swipe refused because another turn
// held the room got the caller's GENERIC fallback ("Couldn't generate that swipe."), which names neither the
// cause nor the fact that nothing was written nor what to do — while the surface showed no ghost and the old
// text sat there for the whole other turn (74/75 samples).

const LOCKED_REJECT = {
  data: { code: "BAD_REQUEST", reason: TURN_LOCKED_OP_CODE },
  message: "a turn is already in flight for this chat",
};

test("locked → the honest contention copy, NOT the caller's generic fallback", () => {
  expect(turnMutationToast(LOCKED_REJECT, "Couldn't generate that swipe.")).toBe(TURN_LOCKED_COPY);
  // Says what is true: another turn is running here, nothing changed, and when to retry.
  expect(TURN_LOCKED_COPY).toContain("still generating");
  expect(TURN_LOCKED_COPY).toContain("nothing was changed");
  // User language — the per-chat LOCK is an implementation fact the reader must never be handed.
  expect(TURN_LOCKED_COPY).not.toContain("lock");
});

test("aborted → null (the bus notice owns the stale surface — no double-toast)", () => {
  const staleReject = { data: { code: "BAD_REQUEST", reason: TURN_ABORTED_OP_CODE }, message: "turn-lock lost mid-turn" };
  expect(turnMutationToast(staleReject, "Couldn't send your message.")).toBeNull();
});

test("any other failure keeps the caller's verb-specific fallback (a real fault still toasts)", () => {
  expect(turnMutationToast({ data: { code: "BAD_REQUEST", reason: "not_turn_owner" } }, "Couldn't send your message.")).toBe("Couldn't send your message.");
  expect(turnMutationToast(new Error("network down"), "Couldn't continue the reply.")).toBe("Couldn't continue the reply.");
  expect(turnMutationToast(null, "Couldn't generate a reply.")).toBe("Couldn't generate a reply.");
});
