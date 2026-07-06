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

// Same key re-invalidated within this window = the storm signature. Short enough to IGNORE the
// legitimate spread-out refetches (a `messageCommitted` and its turn's later `turnCompleted` are
// SECONDS apart — two real moments, not a double), tight enough to catch a doubled delivery or a
// mutation re-invalidating a bus-covered key (those land within a few ms of each other).
const DUP_WINDOW_MS = 250;

// `shortId` shape: leave ids this short (or unprefixed) whole; otherwise keep this many trailing chars.
const SHORT_ID_WHOLE_MAX = 12;
const SHORT_ID_TAIL = 5;

let liveSubscriptions = 0;
// key → last-invalidate wall-clock ms. Bounded: the key set is the handful of tRPC query paths, so
// this never grows past a few entries (no eviction needed).
const lastInvalidateAt = new Map<string, number>();

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
}

/**
 * One call per invalidated key (bus OR mutation side — both route through `invalidateFilters`). Warns
 * when the SAME key was invalidated within `DUP_WINDOW_MS`: the storm signature. Purely an alarm.
 */
export function busDupCheck(key: string): void {
  if (!IS_DEV) {
    return;
  }
  const now = clockMs();
  const prev = lastInvalidateAt.get(key);
  lastInvalidateAt.set(key, now);
  if (prev !== undefined && now - prev < DUP_WINDOW_MS) {
    console.warn(
      `%c${logClock()} [bus] %c⚠ duplicate invalidate ${key} ×2 in ${Math.round(now - prev)}ms%c — event delivered twice, or a mutation re-invalidating a bus-covered key?`,
      PREFIX_STYLE,
      WARN_STYLE,
      MUTED_STYLE,
    );
  }
}
