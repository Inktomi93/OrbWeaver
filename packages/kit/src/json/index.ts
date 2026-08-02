import { z } from "zod";

// A JSON-serializable value. Used to type generic settings KV honestly: a stored setting can be any
// JSON shape, but it is NOT `any` — it cannot be a function, a class instance, undefined, etc. This
// closes the `z.any()` escape hatch while keeping the KV generic. Kept a generic primitive (no domain
// shape) so every layer can lean on it.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** The runtime gate for {@link JsonValue}. `z.json()` (zod 4.x) IS this recursive union — the hand-rolled
 *  `z.lazy` + `z.union` that stood here re-spelled it byte-for-byte, so the swap deletes a recursion we were
 *  keeping by hand with zero behavioral delta (probed 2026-08-02 on 4.4.3: identical accept/reject on nested
 *  objects, `NaN`, functions, and `undefined`-valued properties). The `JsonValue` alias is kept deliberately:
 *  it is the type every consumer imports (`settings` KV, the db `$type`, the catalog snapshots) and zod's own
 *  `util.JSONType` is structurally the same shape under a name nothing else in the cake speaks. */
export const jsonValueSchema: z.ZodType<JsonValue> = z.json();
