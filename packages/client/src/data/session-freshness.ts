// The SESSION FRESHNESS CLOCK + the visibility probe (staleness-and-session-freshness.md §4.4.1) — the
// sensor that closes the "stale login is silently tolerated" hole.
//
// WHY A SENSOR IS NEEDED AT ALL. D54 pins `staleTime: Infinity` and `refetchOnWindowFocus: false`: the bus
// drives data freshness, so a warm tab issues NO reads unless an invalidation lands — and a DEAD session
// receives no bus events, so no invalidation ever lands. The tab renders correct-looking cached data
// forever, nothing errors, and the QueryCache belt (#23b) never fires because nothing ever asks. A laptop
// that slept through its cookie's expiry wakes up looking perfectly signed in.
//
// THIS IS A SESSION CHECK, NOT A DATA REFETCH — D54 is untouched. It fires `GET /api/auth/me` (public,
// never a 401, no tRPC round trip) and nothing else; no query is refetched, no pin is flipped.
//
// EDGE-TRIGGERED WITH A FLOOR, NEVER POLLING (§3.6). The edge is `visibilitychange → visible`; the floor is
// the server's own 5-minute session-SLIDE throttle (`domain/sessions/tokens/tokens.ts`), which makes the
// probe do double duty: past the floor a slide is due anyway, so the probe both detects death AND refreshes
// the cookie's Max-Age. A hidden tab probes nothing, and a tab flipped twice inside the floor probes once.
//
// A THROWN probe is NOT a dead session. `/api/auth/me` failing to resolve means the server is unreachable
// (the route guard makes the same distinction) — treating that as "signed out" would sign a user out of a
// working app because their wifi blinked. Unreachable is ignored; only a RESOLVED `authenticated: false` is
// a verdict.

import { timeLib } from "#lib";

/** The server's session-slide throttle — see the header for why the probe floor is exactly this. */
const FRESHNESS_FLOOR_MS = 300_000;

/** When the session was last CONFIRMED alive. Seeded at module load: this module is imported during boot,
 *  where the route guard's own `/api/auth/me` has just answered — so a fresh page starts confirmed. */
let lastConfirmedAt = timeLib.now();
let probing = false;

/** Record a confirmed-alive session. Called by every path that has just seen a live auth verdict. */
export function markSessionFresh(at: number = timeLib.now()): void {
  lastConfirmedAt = at;
}

/** How long since the session was last confirmed alive — the lens the probe (and a test) gates on. */
export function sessionFreshnessAgeMs(now: number = timeLib.now()): number {
  return now - lastConfirmedAt;
}

/** Everything the probe touches, injected so the whole rule is unit-testable with a fake clock. */
export interface SessionFreshnessDeps {
  readonly now: () => number;
  /** Is this tab visible RIGHT NOW? A hidden tab never probes. */
  readonly isVisible: () => boolean;
  /** The live session check — resolves `authenticated`. A REJECTION means unreachable, not signed out. */
  readonly probe: () => Promise<boolean>;
  /** The session is confirmed DEAD — hand off to the recovery ladder. */
  readonly onDead: () => void;
  /** Subscribe to the visibility edge; returns the unsubscribe. */
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Start the visibility probe. Returns the teardown. At most one probe is in flight at a time, at most one
 * per floor window, and never while hidden.
 */
export function startSessionFreshness(deps: SessionFreshnessDeps): () => void {
  return deps.subscribe((): void => {
    const now = deps.now();
    if (probing || !deps.isVisible() || now - lastConfirmedAt < FRESHNESS_FLOOR_MS) {
      return;
    }
    probing = true;
    deps.probe().then(
      (authenticated) => {
        probing = false;
        if (authenticated) {
          markSessionFresh(deps.now());
          return;
        }
        deps.onDead();
      },
      () => {
        // Unreachable ≠ signed out (see the header). Leave the clock alone so the NEXT visible edge retries.
        probing = false;
      },
    );
  });
}

/** Test seam — reset the module clock (and any latched in-flight probe) to a known point. */
export function __resetSessionFreshness(at: number = timeLib.now()): void {
  lastConfirmedAt = at;
  probing = false;
}
