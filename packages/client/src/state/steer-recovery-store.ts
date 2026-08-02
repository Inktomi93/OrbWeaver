// The guided-steer recovery ring — the last N steer texts the wand FIRED this session, most-recent-first.
// D57 rules the input-recovery capability strictly CLIENT state (never a backend/DB home), and the source
// (guided-generations) treats input preservation as sacred (its scripts restore in `finally` + keep a
// 10-deep cycling history). This is the session-scoped half of that: a non-persisted gated store (losing
// it on a hard reload is fine — it's a same-session convenience, not durable data), fed on every fire and
// read by the wand's "recent steers" affordance. The restore-on-ERROR half lives at the fire call site
// (use-guided-actions.ts) — this ring is the "I fired something earlier, put it back" recall.

import { createGatedStore } from "./create-gated-store";

/** How many fired steers the ring remembers (the source keeps 10; match it — a modest recall list). */
export const STEER_RECOVERY_CAP = 10;

interface SteerRecoveryState {
  /** The fired steer texts, most-recent-first, de-duped, capped at {@link STEER_RECOVERY_CAP}. */
  readonly steers: readonly string[];
}

const useSteerRecoveryStore = createGatedStore<SteerRecoveryState>("steer-recovery", (): SteerRecoveryState => ({ steers: [] }));

/** Record a fired steer at the front of the ring (de-duped so re-firing the same text doesn't pile up,
 *  capped). An empty/blank steer is never recorded — there's nothing to recover. */
export function pushFiredSteer(text: string): void {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return;
  }
  const { steers } = useSteerRecoveryStore.getState();
  const next = [trimmed, ...steers.filter((s) => s !== trimmed)].slice(0, STEER_RECOVERY_CAP);
  useSteerRecoveryStore.setState({ steers: next }, false, "steer-recovery/push");
}

/** A stable empty tuple — keeps the selector from minting a fresh array for the common empty case. */
const EMPTY: readonly string[] = [];

/** Reactive: the recent fired steers (most-recent-first; `[]` when none). */
export function useRecentSteers(): readonly string[] {
  return useSteerRecoveryStore((s) => (s.steers.length === 0 ? EMPTY : s.steers));
}

/** Non-reactive snapshot — for the store's own tests + reads outside a render. */
export function __readRecentSteersForTest(): readonly string[] {
  return useSteerRecoveryStore.getState().steers;
}

/** Reset the ring — test-only hygiene (a module singleton must not leak state across tests). */
export function __resetRecentSteers(): void {
  useSteerRecoveryStore.setState({ steers: [] }, false, "steer-recovery/clear");
}
