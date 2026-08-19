// domain/chat/memory/recall/recorder — the MEMORY RECALL flight recorder (#250; the `domain/rpg/trace.ts`
// model). A compose-created singleton: a bounded in-memory ring of the per-recall `MemoryRecallSlice`, with
// the injected `MemoryRecallSink` recall writes through (`ChatContext.recordRecall`) and the host-only read
// (`recent`) the `/api/_debug/memory/recalls` route tails.
//
// NO PERSISTENT TABLE — per-turn ephemera (D75: the debug surface is read-only introspection); the oldest
// record drops past `limit`.
//
// ALWAYS WIRED, unlike rpg's `RPG_TRACE=on` opt-in — a DELIBERATE divergence, not an oversight. The rpg
// recorder streams several events per turn and its sink guards each emit so an OFF deploy constructs no event
// object; recall produces ONE small, content-free slice per recall call that is BUILT REGARDLESS (it is the
// assembly trace's memory row), so the ring's whole cost is retaining a bounded number of objects that
// already exist. The complaint this closes ("no easy way to see what memories were fetched and why") is not
// closed by a lens that first requires knowing to restart the deployment with a flag set.
//
// ASSUMES(single-replica): the ring is per-process (the `bus.ts` / rpg-recorder precedent). The recorder
// stamps `seq` (a monotonic counter) + `at` (via the injected clock), so recall stays clock-free for them.

import type { MemoryRecallFilter, MemoryRecallRecord, MemoryRecallRecorder } from "../types.ts";

/** The default ring depth — a long session's worth of recalls (one or two per turn); the oldest drops past it. */
const DEFAULT_LIMIT = 256;

/** Build the per-process recall recorder (ONE, wired at the composition root). */
export function createMemoryRecallRecorder(deps: { readonly now: () => number; readonly limit?: number }): MemoryRecallRecorder {
  const limit = deps.limit ?? DEFAULT_LIMIT;
  const ring: MemoryRecallRecord[] = [];
  let seq = 0;

  return {
    sink: (record): void => {
      seq += 1;
      ring.push({ seq, at: deps.now(), ...record });
      if (ring.length > limit) {
        ring.shift();
      }
    },
    recent: (filter?: MemoryRecallFilter): readonly MemoryRecallRecord[] => {
      const matched = filter?.chatId === undefined ? ring : ring.filter((r) => r.chatId === filter.chatId);
      const cap = filter?.limit ?? limit;
      return cap >= matched.length ? [...matched] : matched.slice(matched.length - cap);
    },
  };
}
