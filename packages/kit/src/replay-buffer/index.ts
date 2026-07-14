// Keyed replay ring with a short TTL — the late-subscriber seam shared by the chat bus and the
// workloads progress bus.
//
// Both buses have the same lifecycle gap: an event emitter only delivers events emitted AFTER a
// listener attaches, and a subscription always has a ramp-up window between the verb that starts
// server-side work and the subscription actually listening. Each bus keeps a per-key ring of recent
// events; the subscription handler snapshots it after attaching its listener and before entering the
// live loop. Events may overlap between replay and live delivery — consumers' handlers are
// idempotent by contract, so duplicates are harmless.
//
// The emitter, the emit guards, and WHAT gets buffered (chat excludes high-volume deltas; workloads
// keeps progress) stay bus-owned; only the ring mechanism lives here.
//
// PURE: no I/O, no timers. The clock is injected (`now`, defaulting to `Date.now`) so the TTL/sweep
// logic is deterministically testable without faking globals — the sweep is timestamp-gated on the
// record path rather than driven by a `setInterval`, so there is no timer to leak.

interface BufferedEvent<E> {
  readonly event: E;
  readonly atMs: number;
}

export interface ReplayBuffer<K, E> {
  /** Append `event` to `key`'s ring (pruning expired entries first). */
  readonly record: (key: K, event: E) => void;
  /** The still-live events for `key`, in emit order (pruned to the TTL window). */
  readonly snapshot: (key: K) => E[];
  /** Number of keys currently retained — the leak-observability metric the sweep is judged by
   *  (tests + diagnostics; not consulted on any hot path). */
  readonly size: () => number;
}

const DEFAULT_REPLAY_TTL_MS = 5000;

/**
 * Build a replay buffer keyed by `K`. Memory: at a handful of events per active operation × a short
 * TTL the worst case is dozens of entries; a key's ring is deleted outright once every entry has
 * expired, so idle keys don't accumulate. Cleared on process restart (subscribers re-attach and
 * re-snapshot). `now` is the injectable clock (default `Date.now`).
 */
export function createReplayBuffer<K, E>(
  ttlMs: number = DEFAULT_REPLAY_TTL_MS,
  now: () => number = Date.now,
): ReplayBuffer<K, E> {
  const rings = new Map<K, BufferedEvent<E>[]>();

  // ── Global stale sweep ──
  // Per-key pruning (below) only runs when SOMETHING touches that key again — after a terminal
  // event nothing ever does, so without a global sweep the final ≤TTL of events for every key ever
  // used is retained for the process lifetime (slow leak). Timestamp-gated sweep on the record path
  // instead of a timer: no interval to leak in tests, and a full walk once per TTL window is cheap
  // at these sizes.
  let lastSweepAtMs = 0;

  function sweep(nowMs: number): void {
    if (nowMs - lastSweepAtMs < ttlMs) {
      return;
    }
    lastSweepAtMs = nowMs;
    const cutoff = nowMs - ttlMs;
    for (const [key, buf] of rings) {
      const last = buf.at(-1);
      // A ring whose NEWEST entry is stale is entirely stale — drop the key. Partially-stale rings
      // are left for the per-key prune (they belong to live activity that will touch them again
      // imminently).
      if (last === undefined || last.atMs < cutoff) {
        rings.delete(key);
      }
    }
  }

  function prune(key: K, nowMs: number): BufferedEvent<E>[] {
    const cutoff = nowMs - ttlMs;
    const buf = rings.get(key);
    if (buf === undefined) {
      return [];
    }
    // Walk from the front (oldest); the buffer is kept in emit order, so the first entry NOT older
    // than the cutoff is also the lower bound for everything kept.
    let idx = 0;
    while (idx < buf.length) {
      const entry = buf[idx];
      if (entry === undefined || entry.atMs >= cutoff) {
        break;
      }
      idx += 1;
    }
    if (idx === buf.length) {
      rings.delete(key);
      return [];
    }
    if (idx > 0) {
      const trimmed = buf.slice(idx);
      rings.set(key, trimmed);
      return trimmed;
    }
    return buf;
  }

  return {
    record(key: K, event: E): void {
      const nowMs = now();
      sweep(nowMs);
      const buf = prune(key, nowMs);
      buf.push({ event, atMs: nowMs });
      // prune() already stored the ring whenever it kept/trimmed an existing one (idx===0 returns
      // the live ref we just push()ed into; idx>0 did its own rings.set). The ONLY case where the
      // ring isn't already mapped to `buf` is when prune returned a fresh empty array (key was
      // absent or fully expired) — set just that case rather than blindly re-storing the same ref.
      if (rings.get(key) !== buf) {
        rings.set(key, buf);
      }
    },
    snapshot(key: K): E[] {
      return prune(key, now()).map((e) => e.event);
    },
    size(): number {
      return rings.size;
    },
  };
}
