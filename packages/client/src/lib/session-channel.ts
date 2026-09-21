// The cross-tab SESSION channel (staleness-and-session-freshness.md §4.3) — the ONE BroadcastChannel in the
// client, and the ONE Web-Locks single-flight. It exists because a session is a per-BROWSER fact while a
// socket is a per-TAB one (D118): when a cookie dies, every open tab learns about it independently and, with
// no coordination, every one of them runs its own recovery — N probes, N modals, N hard redirects for one
// dead session. One tab leads; the siblings follow its verdict.
//
// THREE LAWS, all of them the reason this is a module and not an inline `new BroadcastChannel`:
//   • ZERO NEW CONNECTIONS. BroadcastChannel and Web Locks are same-origin browser primitives — they cost no
//     socket, so D118's "one multiplexed SSE per tab" and the ~6-per-origin browser budget are untouched.
//     A cross-tab sync built on a second EventSource would have spent the budget the chat stream needs.
//   • SERVER TRUTH NEVER RIDES THIS CHANNEL (§13's one-router law). The payloads below carry SESSION
//     LIFECYCLE and a durable-local WRITE POKE — never a row, never a query payload. A data payload here
//     would fork the invalidation seam into a second, unaudited router.
//   • ONE HOME. `new BroadcastChannel` outside this file is gate-RED (`session-channel-boundary`) — the
//     client twin of the rogue-EventEmitter rule. A second channel is a second protocol nobody versions.
//
// SINGLE-FLIGHT IS `ifAvailable`, NOT A QUEUE. `navigator.locks.request(..., { ifAvailable: true })` hands
// the callback `null` instead of queueing when another tab holds the lock — which is exactly the semantic
// wanted: a follower must NOT re-run the ladder when the leader finishes (the session is already recovered
// or already dead), it must observe the broadcast verdict. A queueing lock would turn N tabs into N
// sequential recoveries, which is the stampede with extra steps.
//
// DEGRADES, NEVER THROWS. `BroadcastChannel`/`navigator.locks` are absent in node (the unit lanes) and in a
// non-secure context. Both accessors resolve at CALL time (never at module load) so a test can stub them,
// and both fall back to a same-tab-only path: the channel becomes a no-op, and single-flight falls back to a
// module-level latch that still prevents an intra-tab stampede.

import type { Handle } from "@orb/kit/ids";

/** The channel name — one per origin. */
const CHANNEL_NAME = "orb:session";
/** The Web Locks name the recovery ladder serializes on. */
const RECOVERY_LOCK = "orb:session-recovery";

/**
 * Everything the channel carries. SESSION LIFECYCLE plus ONE durable-local poke — no server truth (see the
 * header). `session-recovered` names the HANDLE, not a userId: the recovery ladder's identity read is
 * `/api/auth/me` (the only pre-tRPC one — `sessions.me` 401s on exactly the state being recovered from) and
 * it reports `handle`. The userId-scoped half of the design lives where a userId actually exists: the
 * durable-local rebind, off `sessions.me` (§4.2.1).
 */
export type SessionMessage =
  | { readonly kind: "signed-out" }
  | { readonly kind: "session-recovering" }
  | { readonly kind: "session-recovered"; readonly handle: string | null }
  | { readonly kind: "durable-local-written"; readonly storeName: string };

/** Messages this tab is allowed to put on the channel. A recovered handle originates in the authenticated
 *  `/api/auth/me` response, so the outbound edge keeps its `Handle` proof. The channel parser deliberately
 *  erases that proof again: an origin-wide bus cannot authenticate the bytes another tab posted. */
type SessionPostMessage =
  | { readonly kind: "signed-out" }
  | { readonly kind: "session-recovering" }
  | { readonly kind: "session-recovered"; readonly handle: Handle | null }
  | { readonly kind: "durable-local-written"; readonly storeName: string };

/** One acquired-or-not Web Lock request. Mirrors the slice of the Web Locks API this module calls. */
interface LockManagerLike {
  request: (name: string, options: { readonly ifAvailable: true }, callback: (lock: unknown) => Promise<void>) => Promise<void>;
}

let channel: BroadcastChannel | null = null;
/** Have we already tried (and possibly failed) to open the channel? Distinguishes "unopened" from "absent". */
let channelResolved = false;
const listeners = new Set<(message: SessionMessage) => void>();
/** The same-tab fallback latch for boxes with no Web Locks — still kills the intra-tab stampede. */
let localLeaderBusy = false;

function lockManager(): LockManagerLike | undefined {
  return (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
}

/** A `SessionMessage` or nothing — a channel is a public origin-wide bus, so an unknown payload is ignored
 *  rather than trusted (a browser extension or a stale tab from a previous deploy can post anything). */
function asSessionMessage(data: unknown): SessionMessage | null {
  const kind = (data as { kind?: unknown } | null | undefined)?.kind;
  if (kind === "signed-out" || kind === "session-recovering") {
    return { kind };
  }
  if (kind === "session-recovered") {
    const handle = (data as { handle?: unknown }).handle;
    // Parsing the transport shape proves only "string". The next authenticated session read is what can
    // restore the Handle brand; accepting the sibling's assertion here would smuggle any string into it.
    return { kind, handle: typeof handle === "string" ? handle : null };
  }
  if (kind === "durable-local-written" && typeof (data as { storeName?: unknown }).storeName === "string") {
    return { kind, storeName: (data as { storeName: string }).storeName };
  }
  return null;
}

/** The lazily-opened channel, or null where the primitive does not exist (node lanes, non-secure contexts).
 *  The construction is UNQUALIFIED on purpose — `new BroadcastChannel(...)` is the exact shape the
 *  `session-channel-boundary` gate fences, so the one sanctioned site is spelled the way the gate reads. */
function openChannel(): BroadcastChannel | null {
  if (channelResolved) {
    return channel;
  }
  channelResolved = true;
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  const opened = new BroadcastChannel(CHANNEL_NAME);
  // node's BroadcastChannel is a libuv handle that keeps the loop alive; the browser's has no `unref`.
  // One optional call keeps a node lane (a unit suite that reaches this door) from hanging on exit.
  (opened as { unref?: () => void }).unref?.();
  opened.addEventListener("message", (event: MessageEvent): void => {
    const message = asSessionMessage(event.data);
    if (message === null) {
      return;
    }
    for (const listener of [...listeners]) {
      listener(message);
    }
  });
  channel = opened;
  return channel;
}

/** Broadcast to every OTHER tab on this origin. A no-op where the primitive is absent. */
export function postSessionMessage(message: SessionPostMessage): void {
  openChannel()?.postMessage(message);
}

/** Listen for sibling-tab session messages. Returns the unsubscribe. */
export function onSessionMessage(listener: (message: SessionMessage) => void): () => void {
  openChannel();
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

/** Did THIS tab run the work, or did it follow a sibling that already held the lock? */
export type SingleFlightOutcome = "ran" | "followed";

/**
 * Run `work` as the ONE tab doing it, origin-wide. Returns `"followed"` — without running anything — when
 * another tab already holds the recovery lock; the caller then waits for that tab's broadcast verdict
 * instead of duplicating the ladder. Where Web Locks is unavailable the guarantee narrows to this tab.
 */
export async function runSessionRecoverySingleFlight(work: () => Promise<void>): Promise<SingleFlightOutcome> {
  const locks = lockManager();
  if (locks === undefined) {
    if (localLeaderBusy) {
      return "followed";
    }
    localLeaderBusy = true;
    try {
      await work();
    } finally {
      localLeaderBusy = false;
    }
    return "ran";
  }
  let outcome: SingleFlightOutcome = "followed";
  await locks.request(RECOVERY_LOCK, { ifAvailable: true }, async (lock) => {
    if (lock === null) {
      return; // a sibling tab is mid-ladder — follow its verdict, never re-run it
    }
    outcome = "ran";
    await work();
  });
  return outcome;
}
