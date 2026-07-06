// The `[bus]` console channel (UI-Arch §2.1 lib/: cross-cutting display util) — the chat-bus's own
// dev log, the missing peer to `[trpc]`. SSE subscriptions bypass the tRPC loggerLink BY DESIGN
// (trpc-devlog.ts: per-delta spam would bury the console), so without this the bus is INVISIBLE — the
// console shows the downstream refetches with zero attribution to the event that drove them, which is
// exactly why a doubled delivery reads as an unexplained query storm. This channel restores cause:
//   • subscription lifecycle + a LIVE COUNT — a `live` that climbs past 1 for one open chat is a
//     double-subscription caught in the act (the count reflects THIS hook's subscription window, the
//     layer we own — the seam's dup alarm below is the independent cross-check on actual deliveries);
//   • each canon event → the exact query keys it invalidated (the attribution `[trpc]` cannot give,
//     since it never sees the stream at all);
//   • a DUPLICATE-invalidate alarm — the same key refetched inside a tight window is the storm
//     SIGNATURE (a doubled bus delivery, or a mutation re-invalidating a key the bus already covers).
//     The seam calls `invalidateQueries` once per reduced event, so a same-key double here IS a
//     double-delivery / a redundant mutation-side invalidate — flagged so the next storm is a
//     one-line read, not a hand count across a wall of `← query` lines.
// IS_DEV-gated (dev-flag.ts — the sanctioned runtime-instrumentation discriminant); inert in prod,
// where `import.meta.env.DEV` folds to false and these bodies drop out. Barreled like render-profiler
// (prod-inert, statically imported), NOT dynamic-imported like the tracer.

import { IS_DEV } from "./dev-flag";
import { logClock } from "./log-clock";

// %c DevTools console styles (not UI theme tokens — the token gates scope to feature/ui TSX).
const PREFIX_STYLE = "color:#888;font-weight:bold";
const EVENT_STYLE = "color:#0a7;font-weight:bold";
const LIFECYCLE_STYLE = "color:#06c";
const WARN_STYLE = "color:#c60;font-weight:bold";
const MUTED_STYLE = "color:#888";

// The dup alarm's burst window. A normal turn legitimately hits each `chatReads` key TWICE — the
// terminal `messageCommitted` and the `turnCompleted` ~ms after it BOTH refetch (two distinct real
// events, not a double delivery). So the alarm counts within this window and only fires ABOVE that
// baseline (DUP_ALARM_MIN): a key hammered 3+× is the real storm signature — a doubled delivery, a
// mutation re-invalidating a bus-covered key, or a new-chat replay tax stacking up.
const DUP_WINDOW_MS = 250;
const DUP_ALARM_MIN = 3;

// `shortId` shape: leave ids this short (or unprefixed) whole; otherwise keep this many trailing chars.
const SHORT_ID_WHOLE_MAX = 12;
const SHORT_ID_TAIL = 5;

let liveSubscriptions = 0;
// key → the current burst (count + when it started). Bounded: the key set is the handful of tRPC
// query paths, so this never grows past a few entries (no eviction needed).
const invalidateBursts = new Map<string, { count: number; firstAt: number }>();

// A bounded ring of the recent canon events (the same ones logged to `[bus]`), so an agent/test can
// READ the chat-bus history via `window.__orb.bus()` (agent-bridge.ts) instead of scraping the console
// — the browser-side peer to the server observability. Dev-only (only `busInvalidate` writes it, and
// that early-returns in prod), capped so it never grows unbounded on a long session.
const BUS_RING_CAP = 64;
export interface BusEventRecord {
  readonly at: number;
  readonly type: string;
  readonly chatId: string;
  readonly keys: readonly string[];
}
const busEventLog: BusEventRecord[] = [];

/** The recent canon-event ring (newest last) — agent/test introspection via `window.__orb.bus()`. */
export function busEventRing(): readonly BusEventRecord[] {
  return busEventLog;
}

/** The live subscription count (a value climbing past 1 for one open chat = a double-subscription). */
export function busLiveCount(): number {
  return liveSubscriptions;
}

function clockMs(): number {
  return performance.timeOrigin + performance.now();
}

/** `chat_01kwv…rcy6z7` → `chat_…cy6z7`: the id-family tag + tail — enough to eyeball-match one chat's
 *  lines across the log without the full 26-char ulid on every row. */
function shortId(id: string): string {
  const cut = id.indexOf("_");
  return cut === -1 || id.length <= SHORT_ID_WHOLE_MAX
    ? id
    : `${id.slice(0, cut + 1)}…${id.slice(-SHORT_ID_TAIL)}`;
}

/**
 * A subscription attached. `replay` ⇒ seeded with a replay cursor (a just-created chat's first turn,
 * use-chat-bus.ts) — the one path that can re-deliver early events, so it's called out explicitly.
 */
export function busSubscribe(chatId: string, replay: boolean): void {
  if (!IS_DEV) {
    return;
  }
  liveSubscriptions += 1;
  console.info(
    `%c${logClock()} [bus] %c⊹ subscribe   ${shortId(chatId)}%c  replay=${replay ? "0" : "—"} · live=${liveSubscriptions}`,
    PREFIX_STYLE,
    LIFECYCLE_STYLE,
    MUTED_STYLE,
  );
}

/** The paired detach — decrements the live count (floored at 0; a late cleanup can't drive it negative). */
export function busUnsubscribe(chatId: string): void {
  if (!IS_DEV) {
    return;
  }
  liveSubscriptions = Math.max(0, liveSubscriptions - 1);
  console.info(
    `%c${logClock()} [bus] %c⊝ unsubscribe ${shortId(chatId)}%c  · live=${liveSubscriptions}`,
    PREFIX_STYLE,
    LIFECYCLE_STYLE,
    MUTED_STYLE,
  );
}

/**
 * A canon event dispatched through the invalidation seam → the query keys it refetched. Empty ⇒
 * `(none)` (the sanctioned no-refetch canon events, e.g. `worldInfoActivated`, which reach the seam
 * but map to `[]`). Pure-transient events — `delta`/`turnStarted`/`reasoningStreamDone`/`warning` —
 * never call `invalidate`, so they never reach here: no per-delta spam by construction.
 */
export function busInvalidate(type: string, chatId: string, keys: readonly string[]): void {
  if (!IS_DEV) {
    return;
  }
  const arrow = keys.length === 0 ? "→ (none)" : `→ ${keys.join(", ")}`;
  console.info(
    `%c${logClock()} [bus] %c◆ ${type} ${shortId(chatId)}%c ${arrow}`,
    PREFIX_STYLE,
    EVENT_STYLE,
    MUTED_STYLE,
  );
  busEventLog.push({ at: clockMs(), type, chatId, keys });
  if (busEventLog.length > BUS_RING_CAP) {
    busEventLog.shift();
  }
}

/**
 * One call per invalidated key (bus OR mutation side — both route through `invalidateFilters`). Counts
 * same-key invalidations inside a burst window and logs ONCE when the count crosses `DUP_ALARM_MIN`
 * (above the commit+complete baseline) — the storm signature. Uses `console.info` (styled), NOT
 * `console.warn`: warn drags a full StrictMode stack trace into the console on every hit — the exact
 * spam this channel exists to avoid.
 */
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
  // Log exactly once per burst — at the crossing — so a 5× storm is one line, not three. `console.info`
  // (not `warn`) so Chrome doesn't staple a StrictMode stack trace under every line.
  if (burst.count === DUP_ALARM_MIN) {
    console.info(
      `%c${logClock()} [bus] %c⚠ ${key} invalidated ${burst.count}× in ${Math.round(now - burst.firstAt)}ms%c — above the commit+complete baseline (doubled delivery, or a mutation re-invalidating a bus-covered key)`,
      PREFIX_STYLE,
      WARN_STYLE,
      MUTED_STYLE,
    );
  }
}
