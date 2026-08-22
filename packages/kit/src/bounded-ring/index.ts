// The bounded ring — ONE circular buffer engine for the process-local troubleshooting recorders.
//
// Four rings on this tree were the same mechanic re-spelled: the log line ring and the request ring
// (foundation/observability/logger.ts — two byte-identical private classes in one file), and the wire
// request + wire outcome rings (foundation/observability/debug/wire-capture.ts — the same arithmetic
// hand-rolled over module-scope `ring`/`head`/`size` triples). Every one of them is: preallocate `capacity`
// slots, overwrite the oldest on push, read NEWEST-FIRST, never grow. One engine, every call site →
// identical eviction (Core-0 §2, the engine-vs-data rule).
//
// PURE + ISOMORPHIC: no `node:*`, no clock, no I/O, no domain — the retention POLICY (what is worth
// recording, when the sink is wired at all) stays with each recorder; only the mechanism lives here.
//
// A `push` past `capacity` OVERWRITES the oldest slot in place: the buffer is allocated once at
// construction and never resized, so a long-lived process cannot grow one. That is deliberate and it is
// what makes these safe to leave wired in a dev process for hours.
//
// NOT CONVERGED, and why (#414 — re-derived on the tree 2026-08-22, not inherited from the survey):
//   • `domain/rpg/trace.ts` (the RPG flight recorder) has its OWN ring and it is NOT this shape: a plain
//     `push`/`shift` array read OLDEST-FIRST with a tail slice, then FILTERED by chatId/turnId. Moving it
//     here would either flip `/api/_debug/rpg/traces`'s record order or force an oldest-first door onto
//     this engine for one caller. It is a real third consumer — with a read contract of its own.
//   • The client trio (`bus-devlog`, `motion-stats`) are the same push/shift idiom in the browser. They are
//     a client-lane change (a different package, different suites) and buy nothing here today.
// Both stay as they are DELIBERATELY; neither is an oversight, and neither blocks this engine's two
// server consumers.

/** A fixed-capacity circular buffer. Reads are NEWEST-FIRST — every consumer of these rings is a
 *  troubleshooting tail ("what just happened"), never a chronological log. */
export interface BoundedRing<T> {
  /** Append one value, evicting the oldest when the ring is full. */
  readonly push: (value: T) => void;
  /** Iterate retained values NEWEST-FIRST, lazily — the door for a filtered read that stops as soon as it
   *  has enough matches (the wire-capture posture: filter by chat/backend, break at `limit`). */
  readonly newestFirst: () => Generator<T>;
  /** Retained values NEWEST-FIRST, capped at `limit` (default: everything retained). */
  readonly recent: (limit?: number) => T[];
  /** How many values are retained right now (≤ capacity). */
  readonly size: () => number;
  /** Drop everything — test isolation, so a prior run's records never bleed into the next assertion. */
  readonly clear: () => void;
}

/** Build a ring retaining the most recent `capacity` values. `capacity` must be a positive integer — a
 *  zero/negative ring would silently retain nothing, which reads exactly like a recorder nobody wired. */
export function createBoundedRing<T>(capacity: number): BoundedRing<T> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`bounded-ring capacity must be a positive integer, got ${capacity}`);
  }
  let buf = new Array<T | undefined>(capacity);
  let head = 0;
  let size = 0;

  function* newestFirst(): Generator<T> {
    for (let i = 1; i <= size; i += 1) {
      const value = buf[(head - i + capacity) % capacity];
      if (value !== undefined) {
        yield value;
      }
    }
  }

  return {
    push: (value: T): void => {
      buf[head] = value;
      head = (head + 1) % capacity;
      size = Math.min(size + 1, capacity);
    },
    newestFirst,
    recent: (limit?: number): T[] => {
      const cap = limit ?? size;
      const out: T[] = [];
      for (const value of newestFirst()) {
        if (out.length >= cap) {
          break;
        }
        out.push(value);
      }
      return out;
    },
    size: (): number => size,
    clear: (): void => {
      buf = new Array<T | undefined>(capacity);
      head = 0;
      size = 0;
    },
  };
}
