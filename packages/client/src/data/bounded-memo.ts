// The two primitives every per-tab MEMO in `data/` is built from. A memo here is module-level state that
// outlives every component using it, so the two ways one rots are structural rather than incidental:
//
//   1. IT GROWS. Each distinct key is a fresh entry and nothing ever asks it to stop, so a long-lived tab
//      accretes for its whole life. `rememberBounded` caps it with LRU eviction.
//   2. IT REMEMBERS AN ANSWER THAT WAS NEVER TRUE. A memo keyed on a REQUEST caches the settled promise,
//      failure included — so one offline blip becomes a permanent empty answer for those exact bytes.
//      `forgetIfCurrent` is how the failure path takes itself back out.
//
// Its two callers today are the frame-mint memos (`use-card-frame.ts`, `use-plugin-frame.ts`), which are the
// same idiom written twice; this module is why they are not the same CODE written twice. It is pure and
// React-free so a non-hook module can reach it without importing a hook module.
//
// NOT EVERY module-level map wants this. `bus/room-registry.ts`'s `liveEdgesByRoom` is deliberately unbounded
// and deliberately never pruned (its own comment states the ruling): its entries are the answer to "may this
// room's cache predate now", which stays true for the whole page load, so an eviction there would silently
// suppress a heal rather than save memory worth saving.

/**
 * Insert `value` under `key` in a bounded LRU map: an existing key is re-inserted at the tail (a touch), and
 * once the map holds `cap` entries the OLDEST evicts before a new key lands — so the map can never grow past
 * `cap`. Mutates `map` in place (Map preserves insertion order, which IS the LRU order here).
 */
export function rememberBounded<K, V>(map: Map<K, V>, key: K, value: V, cap: number): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= cap) {
    const oldest = map.keys().next();
    if (oldest.done !== true) {
      map.delete(oldest.value);
    }
  }
  map.set(key, value);
}

/**
 * Drop `key` from `map` — but ONLY while it still holds `value`.
 *
 * The identity guard is the whole point, not a formality: a memo entry is removed by an ASYNC settlement, and
 * by the time that settlement runs some later caller may already have replaced the entry with a fresh attempt
 * for the same key. Deleting unconditionally would throw away that in-flight attempt and every caller waiting
 * on it, and the next reader would start a THIRD one.
 */
export function forgetIfCurrent<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (map.get(key) === value) {
    map.delete(key);
  }
}
