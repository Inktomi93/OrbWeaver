// The autosave save-driver circuit breaker (D78). A save
// driver that submits on every store-values change can enter a save→revert→save oscillation when a
// non-idempotent save/echo/projection hop keeps flipping the resolved values (the localStorage-brick
// class: a poisoned draft resurrects, the versioned-config lift or a zod `.catch` rewrites the echo,
// last-writer-wins re-submits, forever). The baseline-gated draft + convergence tests kill the KNOWN
// sources; this breaker is the backstop that turns an UNKNOWN residual oscillation into a visible
// `error` state (retry affordance lights) instead of a silent infinite write loop.
//
// The breaker counts submits that fire with NO intervening real field edit (a user keystroke / array op).
// A legitimately fast typist produces submits WITH edits between them and never trips it; an oscillation
// produces edit-free submits (the values move because a save echo pushed them, not because a human typed).
// Contract: `onEdit()` on every user-originated store change, `shouldTrip()` immediately before each
// driver submit — if it returns true, the driver stops and the session goes to `error`.

/** Tunables — chosen honest for a human editor: 5 edit-free submits inside 10s is not a person typing. */
export interface SaveCircuitBreakerConfig {
  /** Max edit-free submits allowed inside the window before the breaker trips. */
  readonly limit: number;
  /** The sliding window (ms) the `limit` count applies over. */
  readonly windowMs: number;
  /** Injected clock (tests). @defaultValue Date.now */
  readonly now?: () => number;
}

export interface SaveCircuitBreaker {
  /** Record a real user field edit — clears the edit-free run (the anti-oscillation signal). */
  readonly onEdit: () => void;
  /**
   * Call immediately before a driver submit. Records the submit and returns `true` when the count of
   * edit-free submits inside the window has EXCEEDED `limit` — the caller must then stop the driver and
   * surface `error`. Returns `false` on the normal path.
   */
  readonly shouldTrip: () => boolean;
  /** Reset all state (a successful reseed / entity switch starts a fresh session with a clean breaker). */
  readonly reset: () => void;
}

export function createSaveCircuitBreaker(config: SaveCircuitBreakerConfig): SaveCircuitBreaker {
  const now = config.now ?? Date.now;
  // Timestamps of edit-free submits still inside the window. An edit clears it; a submit appends + prunes.
  let editFreeSubmits: number[] = [];

  return {
    onEdit: (): void => {
      editFreeSubmits = [];
    },
    shouldTrip: (): boolean => {
      const t = now();
      editFreeSubmits.push(t);
      const cutoff = t - config.windowMs;
      editFreeSubmits = editFreeSubmits.filter((ts) => ts > cutoff);
      return editFreeSubmits.length > config.limit;
    },
    reset: (): void => {
      editFreeSubmits = [];
    },
  };
}

/** The house default: 5 edit-free submits inside 10s trips (honest for a human editor — see the header). */
export const DEFAULT_SAVE_BREAKER: Pick<SaveCircuitBreakerConfig, "limit" | "windowMs"> = {
  limit: 5,
  windowMs: 10_000,
};
