import { z } from "zod";
import { isPlainObject } from "#guards";

// A JSON-serializable value. Used to type generic settings KV honestly: a stored setting can be any
// JSON shape, but it is NOT `any` — it cannot be a function, a class instance, undefined, etc. This
// closes the `z.any()` escape hatch while keeping the KV generic. Kept a generic primitive (no domain
// shape) so every layer can lean on it.
//
// TWO KINDS OF JSON VALUE, TWO CHECKS. A value decoded from JSON text (a wire body, a `mode: "json"` column, an
// imported file) is JSON by construction, so it needs a type and at most a shallow shape guard: a deep re-walk
// adds only a stack fault on deep input and refuses `1e400`, which JSON text decodes to `Infinity`. A value the
// server must bound before it walks or stores it gets {@link boundedJsonObjectSchema}, whose walk is iterative
// and capped.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** The runtime gate for {@link JsonValue}. `z.json()` (zod 4.x) IS this recursive union — the hand-rolled
 *  `z.lazy` + `z.union` that stood here re-spelled it byte-for-byte, so the swap deletes a recursion we were
 *  keeping by hand with zero behavioral delta (probed on 4.4.3: identical accept/reject on nested
 *  objects, `NaN`, functions, and `undefined`-valued properties). The `JsonValue` alias is kept deliberately:
 *  it is the type every consumer imports (`settings` KV, the db `$type`, the catalog snapshots) and zod's own
 *  `util.JSONType` is structurally the same shape under a name nothing else in the cake speaks. */
export const jsonValueSchema: z.ZodType<JsonValue> = z.json();

/** A JSON object: string keys to {@link JsonValue}s. */
export type JsonObject = Record<string, JsonValue>;

/** The value `text` holds as JSON, or `undefined` when it is not JSON text; no JSON text decodes to
 *  `undefined`.
 *  @throws anything `JSON.parse` throws other than its `SyntaxError`, which only a defect can cause. */
export function parseJsonText(text: string): JsonValue | undefined {
  try {
    // The one place a decoded value is named `JsonValue`: `JSON.parse` builds only strings, numbers (an overflowing
    // literal is `Infinity`, still a number), booleans, null, arrays and plain objects (an own `__proto__` key stays
    // an own key), so the type is true by construction and no walk is needed to state it.
    return JSON.parse(text) as JsonValue;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/** The value when it is a JSON object, as the same reference (no copy, no walk), else `null`. */
export function jsonObjectOf(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

/** A JSON object decoded from JSON text: a wire body field or a stored json column. Shallow by design (see the
 *  header): it checks the top is a plain object and passes the same reference through. */
export const jsonObjectSchema: z.ZodType<JsonObject, Record<string, unknown>> = z.custom<JsonObject>((value) => isPlainObject(value), {
  error: "expected a JSON object",
});

/** How deep {@link boundedJsonObjectSchema} walks before it refuses. */
export const JSON_MAX_DEPTH = 64;

/** Why a value fails {@link boundedJsonObjectSchema}. */
export const JSON_BOUND_REFUSALS = ["json_max_depth_exceeded", "json_not_json"] as const;
type JsonBoundRefusal = (typeof JSON_BOUND_REFUSALS)[number];

interface PendingNode {
  readonly value: unknown;
  readonly depth: number;
}

function leafIsJson(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

// The members of a JSON container, or null for a value that is no container.
function containerMembers(value: unknown): readonly unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  return isPlainObject(value) && Object.getPrototypeOf(value) === Object.prototype ? Object.values(value) : null;
}

// An explicit stack, never recursion, so no input depth reaches the V8 stack limit before the cap refuses it.
function jsonBoundRefusal(root: unknown): JsonBoundRefusal | null {
  const pending: PendingNode[] = [{ value: root, depth: 0 }];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node.depth > JSON_MAX_DEPTH) {
      return "json_max_depth_exceeded";
    }
    const members = containerMembers(node.value);
    if (members === null && !leafIsJson(node.value)) {
      return "json_not_json";
    }
    for (const member of members ?? []) {
      pending.push({ value: member, depth: node.depth + 1 });
    }
  }
  return null;
}

/** A JSON object the server bounds before it walks or keeps it: every member is JSON (finite numbers, plain objects,
 *  no `undefined`) and nothing nests deeper than {@link JSON_MAX_DEPTH}. A refusal carries its code from
 *  {@link JSON_BOUND_REFUSALS} as the issue message. The value passes through as the same reference. */
export const boundedJsonObjectSchema = jsonObjectSchema.superRefine((value, ctx) => {
  const refusal = jsonBoundRefusal(value);
  if (refusal !== null) {
    ctx.addIssue({ code: "custom", message: refusal });
  }
});
