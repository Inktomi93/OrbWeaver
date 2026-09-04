// Small structural type-guards shared across layers. Narrowing helpers that let callers drop
// `as Record<string, unknown>` casts in favor of a real runtime check.

/**
 * True for a non-null, non-array object. Narrows `unknown` to `Record<string, unknown>` so a value
 * coming off `JSON.parse` / a stored blob can be treated as an object map without a cast.
 *
 * THE LOOSE CHECK IS THE CONTRACT, not an oversight (#1360 item 7, re-derived on the tree). The name
 * promises "plain", so the obvious tightening is a prototype test
 * (`Object.getPrototypeOf(v) === Object.prototype || null`), which would also exclude `Date`, `Map` and
 * class instances. **That would break a live caller**: `@orb/db`'s `db-errors.ts` walks an ERROR's `cause` chain through this guard
 * (`isPlainObject(current) && "cause" in current`), and an `Error` is a class instance. The external
 * review's premise that no call site feeds it one is refuted.
 *
 * So read this as "is this value INDEXABLE BY STRING KEY" — every one of its ~120 call sites asks
 * exactly that (a parsed blob, a persisted store slice, a wrapped error). A caller that needs
 * "specifically a JSON object literal" needs a DIFFERENT predicate, not a narrowing of this one, and
 * must state which it wants.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
