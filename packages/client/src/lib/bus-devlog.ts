// The `[bus]` console channel — the chat-bus's own dev log, the missing peer to `[trpc]`. SSE
// subscriptions bypass the tRPC loggerLink by design, so without this the bus is invisible: the
// console shows downstream refetches with zero attribution to the event that drove them. This channel
// restores cause: subscription lifecycle + a live count, each canon event → the keys it invalidated,
// and a duplicate-invalidate alarm (the storm signature).
//
// THE CONSOLE OUTPUT IS IS_DEV-GATED; THE EVIDENCE BOOKKEEPING IS NOT (#1847). The live count and the
// 64-entry ring are what `window.__orb.bus()` reads, and they are two integers and a bounded array —
// cheap enough to keep honest, and keeping them unconditional is what lets the component-test bundle
// (built in Vite PRODUCTION mode, where IS_DEV is false) drive these REAL doors instead of a pair of
// `__…ForTest` plants that re-implemented the same arithmetic beside them. The ring stays inert in a
// shipped app for the ordinary reason: `invalidation.ts` only calls `busInvalidate` under IS_DEV.

import type { ChatId } from "@orb/kit/ids";
import { CONSOLE_STYLES } from "./console-styles.ts";
import { IS_DEV } from "./dev-flag.ts";
import { logClock } from "./log-clock.ts";

// A normal turn legitimately hits each chatReads key twice (messageCommitted + turnCompleted both
// refetch) — the alarm only fires above that baseline (3+× is the real storm signature).
const DUP_WINDOW_MS = 250;
const DUP_ALARM_MIN = 3;

// `shortId` shape: leave ids this short (or unprefixed) whole; otherwise keep this many trailing chars.
const SHORT_ID_WHOLE_MAX = 12;
const SHORT_ID_TAIL = 5;

let liveSubscriptions = 0;
// key → the current burst (count + when it started). Bounded: the key set is the handful of tRPC
// query paths, so this never grows past a few entries.
const invalidateBursts = new Map<string, { count: number; firstAt: number }>();

// A bounded ring of recent canon events so window.__orb.bus() can read the history instead of
// scraping the console.
const BUS_RING_CAP = 64;
export interface BusEventRecord {
  readonly at: number;
  readonly type: string;
  /** The room the event belongs to, or the `"user"` sentinel for the per-user (room-less) bus plane. */
  readonly chatId: ChatId | "user";
  readonly keys: readonly string[];
}
const busEventLog: BusEventRecord[] = [];

/** The recent canon-event ring (newest last) — agent/test introspection via `window.__orb.bus()`. */
export function busEventRing(): readonly BusEventRecord[] {
  return busEventLog;
}

/** Clear checkpoint evidence without touching `liveSubscriptions`: active sockets are runtime state,
 * not evidence, and resetting that count would hide a double-subscription defect. */
export function resetBusEventRing(): void {
  busEventLog.length = 0;
}

/** Drop every open duplicate-invalidate burst window.
 *
 *  THE ALARM BELOW IS A CLAIM ABOUT ONE APP TIMELINE — "this key was invalidated 3× inside 250ms, so the
 *  same read is being refetched by a doubled delivery or by a mutation re-invalidating a bus-covered key".
 *  The window is wall-clock and the burst map is module state, so it is only honest while every wave it
 *  counts came from the SAME stream of events. A `bus-events` checkpoint reset taken mid-burst would
 *  attribute pre-checkpoint waves to the window after it, so that reset clears the windows with the ring.
 *  It never changes the alarm's model: a genuine 3× burst inside one window still fires. */
export function resetBusDupBursts(): void {
  invalidateBursts.clear();
}

/** The live subscription count (a value climbing past 1 for one open chat = a double-subscription). */
export function busLiveCount(): number {
  return liveSubscriptions;
}

function clockMs(): number {
  return performance.timeOrigin + performance.now();
}

function shortId(id: string): string {
  const cut = id.indexOf("_");
  return cut === -1 || id.length <= SHORT_ID_WHOLE_MAX ? id : `${id.slice(0, cut + 1)}…${id.slice(-SHORT_ID_TAIL)}`;
}

/** A subscription attached. `replay` ⇒ seeded with a replay cursor — the one path that can re-deliver
 *  early events, so it's called out explicitly. */
export function busSubscribe(chatId: ChatId, replay: boolean): void {
  liveSubscriptions += 1;
  if (!IS_DEV) {
    return;
  }
  console.info(
    `%c${logClock()} [bus] %c⊹ subscribe   ${shortId(chatId)}%c  replay=${replay ? "0" : "—"} · live=${liveSubscriptions}`,
    CONSOLE_STYLES.prefix,
    CONSOLE_STYLES.path,
    CONSOLE_STYLES.muted,
  );
}

/** The paired detach — decrements the live count (floored at 0; a late cleanup can't drive it negative). */
export function busUnsubscribe(chatId: ChatId): void {
  liveSubscriptions = Math.max(0, liveSubscriptions - 1);
  if (!IS_DEV) {
    return;
  }
  console.info(
    `%c${logClock()} [bus] %c⊝ unsubscribe ${shortId(chatId)}%c  · live=${liveSubscriptions}`,
    CONSOLE_STYLES.prefix,
    CONSOLE_STYLES.path,
    CONSOLE_STYLES.muted,
  );
}

/** A canon event dispatched through the invalidation seam → the query keys it refetched. Empty ⇒
 *  `(none)`. Pure-transient events never call `invalidate`, so they never reach here. */
export function busInvalidate(type: string, chatId: ChatId | "user", keys: readonly string[]): void {
  busEventLog.push({ at: clockMs(), type, chatId, keys });
  if (busEventLog.length > BUS_RING_CAP) {
    busEventLog.shift();
  }
  if (!IS_DEV) {
    return;
  }
  const arrow = keys.length === 0 ? "→ (none)" : `→ ${keys.join(", ")}`;
  console.info(`%c${logClock()} [bus] %c◆ ${type} ${shortId(chatId)}%c ${arrow}`, CONSOLE_STYLES.prefix, CONSOLE_STYLES.event, CONSOLE_STYLES.muted);
}

/** One call per invalidated key. Counts same-key invalidations inside a burst window and logs once
 *  when the count crosses `DUP_ALARM_MIN`. Uses `console.info`, not `console.warn` (which drags a
 *  full StrictMode stack trace into the console on every hit). */
export function busDupCheck(key: string): void {
  if (!IS_DEV) {
    return;
  }
  const now = clockMs();
  const burst = invalidateBursts.get(key);
  if (burst === undefined || now - burst.firstAt >= DUP_WINDOW_MS) {
    invalidateBursts.set(key, { count: 1, firstAt: now });
    return;
  }
  burst.count += 1;
  // Log exactly once per burst, at the crossing, so a 5× storm is one line, not three.
  if (burst.count === DUP_ALARM_MIN) {
    console.info(
      `%c${logClock()} [bus] %c⚠ ${key} invalidated ${burst.count}× in ${Math.round(now - burst.firstAt)}ms%c — above the commit+complete baseline (doubled delivery, or a mutation re-invalidating a bus-covered key)`,
      CONSOLE_STYLES.prefix,
      CONSOLE_STYLES.warning,
      CONSOLE_STYLES.muted,
    );
  }
}
