import { z } from "zod";

// A JSON-serializable value. Used to type generic settings KV honestly: a stored setting can be any
// JSON shape, but it is NOT `any` — it cannot be a function, a class instance, undefined, etc. This
// closes the `z.any()` escape hatch while keeping the KV generic. Kept a generic primitive (no domain
// shape) so every layer can lean on it.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** The runtime gate for {@link JsonValue}. `z.json()` (zod 4.x) IS this recursive union — the hand-rolled
 *  `z.lazy` + `z.union` that stood here re-spelled it byte-for-byte, so the swap deletes a recursion we were
 *  keeping by hand with zero behavioral delta (probed on 4.4.3: identical accept/reject on nested
 *  objects, `NaN`, functions, and `undefined`-valued properties). The `JsonValue` alias is kept deliberately:
 *  it is the type every consumer imports (`settings` KV, the db `$type`, the catalog snapshots) and zod's own
 *  `util.JSONType` is structurally the same shape under a name nothing else in the cake speaks. */
export const jsonValueSchema: z.ZodType<JsonValue> = z.json();

/** A JSON object: string keys to {@link JsonValue}s. The type for a stored or passed-through blob whose keys are
 *  free but whose values must survive `JSON.stringify` unchanged. */
export type JsonObject = Record<string, JsonValue>;

/** The runtime gate for {@link JsonObject}. */
export const jsonObjectSchema: z.ZodType<JsonObject, Record<string, unknown>> = z.record(z.string(), jsonValueSchema);

/** The value `text` holds as JSON, or `undefined` when it is not JSON text; no JSON text decodes to
 *  `undefined`. Callers narrow the `unknown` result with a schema or a guard.
 *  @throws anything `JSON.parse` throws other than its `SyntaxError`, which only a defect can cause. */
export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}
