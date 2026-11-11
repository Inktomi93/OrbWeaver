import { z } from "zod";
import { isPlainObject } from "#guards";

// A JSON-serializable value. Used to type generic settings KV honestly: a stored setting can be any
// JSON shape, but it is NOT `any` — it cannot be a function, a class instance, undefined, etc. This
// closes the `z.any()` escape hatch while keeping the KV generic. Kept a generic primitive (no domain
// shape) so every layer can lean on it.
//
// TWO KINDS OF JSON VALUE, TWO CHECKS. A value decoded from JSON text (a wire body, a `mode: "json"` column, an
// imported file) is JSON by construction, so it needs a type and at most a shallow shape guard: a deep re-walk
// adds only a stack fault on deep input and refuses `1e400`, which JSON text decodes to `Infinity`. Any other value
// (one read from YAML or `key=value` text, or an object the code built) and a value the server must bound before a
// recursive walk gets {@link boundedJsonObjectSchema}, whose walk is iterative and capped.
//
// SHARED NODES ARE LEGAL, CYCLES ARE NOT. A YAML alias or a built object can reference one node twice; serialised,
// that is plain JSON with the node written out twice, so the bounded walk accepts it and visits it once. A cycle has
// no JSON text at all, so the walk refuses it.

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

/** Why a value fails {@link jsonObjectSchema}: it is not an object (an array, a scalar or null). */
export const JSON_NOT_OBJECT = "json_not_object";

/** A JSON object decoded from JSON text: a wire body field or a stored json column. Shallow by design (see the
 *  header): it checks the top is a plain object and passes the same reference through. */
export const jsonObjectSchema: z.ZodType<JsonObject, Record<string, unknown>> = z.custom<JsonObject>((value) => isPlainObject(value), {
  error: JSON_NOT_OBJECT,
});

// The refusal both the member guard and the bounded walk give a value no JSON text can hold.
const JSON_NOT_JSON = "json_not_json";

/** A member of a decoded JSON object (a stored column's open remainder, say): its kind is checked and its contents
 *  are not walked, for the reason in the header. Refuses `undefined`, a function, a symbol, a bigint and a class
 *  instance with the code `json_not_json`. */
export const jsonMemberSchema: z.ZodType<JsonValue> = z.custom<JsonValue>(
  (value) => value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || containerOf(value) !== null,
  { error: JSON_NOT_JSON },
);

/** How deep {@link boundedJsonObjectSchema} walks before it refuses. A projected tool schema at the JSON Schema lift's
 *  own depth cap spends about two JSON levels per schema level, so this holds it with room to spare. */
export const JSON_MAX_DEPTH = 128;

/** Why a value fails {@link boundedJsonObjectSchema}. */
export const JSON_BOUND_REFUSALS = ["json_max_depth_exceeded", JSON_NOT_JSON, "json_cycle"] as const;
type JsonBoundRefusal = (typeof JSON_BOUND_REFUSALS)[number];

function leafIsJson(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

interface JsonContainer {
  readonly node: object;
  readonly members: readonly unknown[];
}

// A JSON container and its members, or null for a value that is no container.
function containerOf(value: unknown): JsonContainer | null {
  if (Array.isArray(value)) {
    return { node: value, members: value };
  }
  return isPlainObject(value) && Object.getPrototypeOf(value) === Object.prototype ? { node: value, members: Object.values(value) } : null;
}

// A node to open, or a container whose members are all walked and whose height can now be recorded.
interface WalkFrame {
  readonly value: unknown;
  readonly depth: number;
  readonly close: boolean;
}

interface Walk {
  readonly pending: WalkFrame[];
  // How far below each finished container its deepest member sits, so a shared container is walked once and its
  // depth is still judged at every place it appears.
  readonly heights: Map<object, number>;
  // The containers on the path from the root to the frame being opened: meeting one again is a cycle.
  readonly open: Set<object>;
}

function openFrame(walk: Walk, { value, depth }: WalkFrame): JsonBoundRefusal | null {
  if (depth > JSON_MAX_DEPTH) {
    return "json_max_depth_exceeded";
  }
  const container = containerOf(value);
  if (container === null) {
    return leafIsJson(value) ? null : JSON_NOT_JSON;
  }
  const height = walk.heights.get(container.node);
  if (height !== undefined) {
    return depth + height > JSON_MAX_DEPTH ? "json_max_depth_exceeded" : null;
  }
  if (walk.open.has(container.node)) {
    return "json_cycle";
  }
  walk.open.add(container.node);
  walk.pending.push({ value, depth, close: true });
  for (const member of container.members) {
    walk.pending.push({ value: member, depth: depth + 1, close: false });
  }
  return null;
}

function closeFrame(walk: Walk, { value }: WalkFrame): void {
  const container = containerOf(value);
  if (container === null) {
    return;
  }
  let height = 0;
  for (const member of container.members) {
    const child = containerOf(member);
    height = Math.max(height, 1 + (child === null ? 0 : (walk.heights.get(child.node) ?? 0)));
  }
  walk.open.delete(container.node);
  walk.heights.set(container.node, height);
}

// An explicit stack, never recursion, so no input depth reaches the V8 stack limit before the cap refuses it; each
// distinct container is opened once, so the walk is linear in the value's distinct nodes and edges.
function jsonBoundRefusal(root: unknown): JsonBoundRefusal | null {
  const walk: Walk = { pending: [{ value: root, depth: 0, close: false }], heights: new Map(), open: new Set() };
  for (let frame = walk.pending.pop(); frame !== undefined; frame = walk.pending.pop()) {
    if (frame.close) {
      closeFrame(walk, frame);
    } else {
      const refusal = openFrame(walk, frame);
      if (refusal !== null) {
        return refusal;
      }
    }
  }
  return null;
}

/** A JSON object checked in full: every member is JSON (finite numbers, plain objects, no `undefined`), nothing nests
 *  deeper than {@link JSON_MAX_DEPTH}, and no container holds itself. A refusal carries its code from
 *  {@link JSON_BOUND_REFUSALS} as the issue message. The value passes through as the same reference. */
export const boundedJsonObjectSchema = jsonObjectSchema.superRefine((value, ctx) => {
  const refusal = jsonBoundRefusal(value);
  if (refusal !== null) {
    ctx.addIssue({ code: "custom", message: refusal });
  }
});
