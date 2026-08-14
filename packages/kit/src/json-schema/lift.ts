// @orb/kit/json-schema — the JSON-Schema → zod LIFT (D79 / plugin-design PL-B), pure + isomorphic, the
// INVERSE direction of `projectJsonSchema`. A plugin GUEST (untrusted external author) supplies a raw JSON
// Schema for its tool args and cannot author zod; the ONE tool registry is zod-first, so the guest schema is
// lifted into zod here and the wire `parameters` is DERIVED back through the SAME `projectJsonSchema` (one
// source of truth, no second wire representation — the D79 rule + the "derive don't re-declare" law).
//
// TRUST BOUNDARY — CONSERVATIVE-OR-REFUSE (PL-B binding rider): the supported subset lifts EXACTLY; ANY
// unsupported construct is a TYPED refusal naming the construct (`JsonSchemaLiftError`), NEVER a silent strip
// or a loosened lift. A guest schema is untrusted input and a silently-dropped constraint over-permits tool
// args — refusal beats looseness everywhere. The lift can only ever emit plain zod (no `.transform()`, no
// brands), so the lifted schema stays projection-clean by construction (the D48 tool-schema law).
//
// The supported subset is ONE exported const (`LIFTABLE_JSON_SCHEMA`) the refusal error cites; the golden
// round-trip (lift → projectJsonSchema ≡ input, per supported construct) is the engine's proof.

import { z } from "zod";
import { isPlainObject } from "#guards";

/** The ONE annotation keyword the lift ACCEPTS-AND-IGNOREs on any node: the refinery's render-hint
 *  channel (`docs/design/refinery-schema-renderer.md` §4.2). Hints are DISPLAY metadata a stored schema
 *  carries for the client renderer — they must never reach zod (so `projectJsonSchema` can never emit
 *  them onto a wire) and must never make a hinted schema refuse. Golden proof beside the lift tests:
 *  `lift(hinted) ≡ lift(stripOrbUi(hinted))`. Validating hint CONTENT is the refinery save belt's job
 *  (a consumer concern), never kit's. Exactly this key — any other `x-*` keyword still refuses. */
export const RENDER_HINT_KEY = "x-orb-ui";

/** The JSON-Schema subset the lift supports, by node kind. The refusal error cites this so a rejected guest
 *  knows exactly what to author within. Deliberately narrow — widen only with a matching golden round-trip. */
export const LIFTABLE_JSON_SCHEMA = {
  /** `type` values that lift. `"null"` is NOT here — nullability (type-arrays / `nullable`) is refused in v1
   *  (a guest models an omittable arg by leaving it out of `required`, not by a null union). */
  types: ["object", "array", "string", "number", "integer", "boolean"],
  /** Keywords honored on ANY node. */
  common: ["type", "description", "enum", "const"],
  /** The COMPOSITE keyword: a `type`-less node that is a UNION of member schemas, each lifted exactly
   *  (`z.union`). It is exactly what `projectJsonSchema` emits for a zod union, so it round-trips. It stands
   *  ALONE (any sibling but `description` is refused) and needs ≥2 members — a 1-member `anyOf` is degenerate
   *  and the projection never emits one, so conservative-or-refuse rejects it rather than guessing. */
  union: ["anyOf"],
  /** Per-type constraint keywords honored. */
  object: ["properties", "required", "additionalProperties"],
  string: ["minLength", "maxLength", "pattern"],
  number: ["minimum", "maximum"],
  array: ["items", "minItems", "maxItems"],
} as const;

/** A guest JSON Schema carried an unsupported construct (a keyword/type outside {@link LIFTABLE_JSON_SCHEMA}).
 *  The registration REFUSES it (activation-fatal for a plugin tool) — never a silent strip. `construct` names
 *  the offending keyword/type; `path` locates it (`#/properties/foo`). */
export class JsonSchemaLiftError extends Error {
  public readonly construct: string;
  public readonly path: string;
  constructor(construct: string, path: string, options?: { readonly cause?: unknown }) {
    super(
      `unsupported JSON Schema construct "${construct}" at ${path} — the liftable subset is object/array/string/number/integer/boolean (plus a type-less \`anyOf\` union) with the documented per-type keywords (LIFTABLE_JSON_SCHEMA)`,
      options,
    );
    this.construct = construct;
    this.path = path;
    this.name = this.constructor.name;
  }
}

/** Max nesting depth the lift recurses before refusing (INFO-3 hardening / conservative-or-refuse). A guest is
 *  untrusted input; an unbounded recursion on a deeply-nested `properties`/`items` chain would blow the host V8
 *  stack (a RangeError). Real tool schemas in the {@link LIFTABLE_JSON_SCHEMA} subset are shallow (2–3 levels);
 *  32 is generous headroom while sitting far below any stack limit, so an over-deep schema becomes a TYPED
 *  refusal (`construct: "max-depth-exceeded"`) BEFORE the stack blows, never an implicit RangeError. */
export const MAX_LIFT_DEPTH = 32;

const STRING_TYPE = "string";
const NUMBER_TYPE = "number";
const INTEGER_TYPE = "integer";
const BOOLEAN_TYPE = "boolean";
const OBJECT_TYPE = "object";
const ARRAY_TYPE = "array";

/** Per-type constraint keywords, keyed by `type` (`integer` shares `number`'s). */
const PER_TYPE_KEYS: Readonly<Record<string, readonly string[]>> = {
  [OBJECT_TYPE]: LIFTABLE_JSON_SCHEMA.object,
  [STRING_TYPE]: LIFTABLE_JSON_SCHEMA.string,
  [NUMBER_TYPE]: LIFTABLE_JSON_SCHEMA.number,
  [INTEGER_TYPE]: LIFTABLE_JSON_SCHEMA.number,
  [ARRAY_TYPE]: LIFTABLE_JSON_SCHEMA.array,
};

/** The keywords legal on a node of the given `type` (common ∪ per-type ∪ the ignored hint key). A key
 *  outside this set is refused. */
function allowedKeysFor(type: string): ReadonlySet<string> {
  return new Set<string>([...LIFTABLE_JSON_SCHEMA.common, ...(PER_TYPE_KEYS[type] ?? []), RENDER_HINT_KEY]);
}

/** Refuse the FIRST key on `node` outside the allowed set for its type (deterministic — object key order). */
function rejectUnsupportedKeys(node: Record<string, unknown>, type: string, path: string): void {
  const allowed = allowedKeysFor(type);
  for (const key of Object.keys(node)) {
    if (!allowed.has(key)) {
      throw new JsonSchemaLiftError(key, path);
    }
  }
}

function liftString(node: Record<string, unknown>, path: string): z.ZodType {
  let schema = z.string();
  if (typeof node["minLength"] === "number") {
    schema = schema.min(node["minLength"]);
  }
  if (typeof node["maxLength"] === "number") {
    schema = schema.max(node["maxLength"]);
  }
  if (typeof node["pattern"] === "string") {
    const compiled = compilePattern(node["pattern"]);
    if (compiled === null) {
      throw new JsonSchemaLiftError("pattern (invalid regex)", path);
    }
    schema = schema.regex(compiled);
  }
  return schema;
}

/** Compile a guest `pattern` to a RegExp, or `null` when it is malformed (the caller turns null into a typed
 *  refusal — a guest regex is untrusted input, never a thrown SyntaxError). */
function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "u");
  } catch {
    return null;
  }
}

function liftNumber(node: Record<string, unknown>, isInt: boolean): z.ZodType {
  let schema = isInt ? z.number().int() : z.number();
  if (typeof node["minimum"] === "number") {
    schema = schema.min(node["minimum"]);
  }
  if (typeof node["maximum"] === "number") {
    schema = schema.max(node["maximum"]);
  }
  return schema;
}

function liftEnum(values: readonly unknown[], path: string): z.ZodType {
  if (values.length === 0) {
    throw new JsonSchemaLiftError("enum (empty)", path);
  }
  // Only string enums lift to z.enum; a mixed/number enum is refused (conservative — no lossy literal union).
  if (!values.every((v) => typeof v === "string")) {
    throw new JsonSchemaLiftError("enum (non-string members)", path);
  }
  return z.enum(values as [string, ...string[]]);
}

function liftConst(value: unknown, path: string): z.ZodType {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return z.literal(value);
  }
  throw new JsonSchemaLiftError("const (non-primitive)", path);
}

/** The only keys legal beside `anyOf` — the union node carries no `type` and no per-type constraints
 *  (plus the ignored hint key, legal on ANY node). */
const UNION_KEYS: ReadonlySet<string> = new Set<string>([...LIFTABLE_JSON_SCHEMA.union, "description", RENDER_HINT_KEY]);

/** Lift a `type`-less `anyOf` node into `z.union`. Each member is lifted through the SAME recursion (so an
 *  unsupported construct inside a member still refuses), and a sibling keyword is refused rather than ignored. */
function liftUnion(node: Record<string, unknown>, path: string, depth: number): z.ZodType {
  for (const key of Object.keys(node)) {
    if (!UNION_KEYS.has(key)) {
      throw new JsonSchemaLiftError(key, path);
    }
  }
  const members = node["anyOf"];
  if (!Array.isArray(members) || members.length < 2) {
    throw new JsonSchemaLiftError("anyOf (fewer than two members)", path);
  }
  const lifted = members.map((member, index) => {
    const memberPath = `${path}/anyOf/${index}`;
    if (!isPlainObject(member)) {
      throw new JsonSchemaLiftError("anyOf (non-object member)", memberPath);
    }
    return liftNode(member, memberPath, depth + 1);
  });
  return z.union(lifted);
}

function liftArray(node: Record<string, unknown>, path: string, depth: number): z.ZodType {
  const items = node["items"];
  if (items === undefined) {
    throw new JsonSchemaLiftError("array (missing items)", path);
  }
  if (!isPlainObject(items)) {
    // A tuple schema (items: []) is refused — only a single homogeneous item schema lifts.
    throw new JsonSchemaLiftError("items (tuple/array form)", path);
  }
  let schema = z.array(liftNode(items, `${path}/items`, depth + 1));
  if (typeof node["minItems"] === "number") {
    schema = schema.min(node["minItems"]);
  }
  if (typeof node["maxItems"] === "number") {
    schema = schema.max(node["maxItems"]);
  }
  return schema;
}

function liftObject(node: Record<string, unknown>, path: string, depth: number): z.ZodType {
  const properties = node["properties"] ?? {};
  if (!isPlainObject(properties)) {
    throw new JsonSchemaLiftError("properties (not an object)", path);
  }
  const required = node["required"];
  if (required !== undefined && !(Array.isArray(required) && required.every((r) => typeof r === "string"))) {
    throw new JsonSchemaLiftError("required (not a string array)", path);
  }
  const requiredSet = new Set<string>(Array.isArray(required) ? (required as string[]) : []);

  const shape: Record<string, z.ZodType> = {};
  for (const [key, propNode] of Object.entries(properties)) {
    if (!isPlainObject(propNode)) {
      throw new JsonSchemaLiftError("property (not an object schema)", `${path}/properties/${key}`);
    }
    const lifted = liftNode(propNode, `${path}/properties/${key}`, depth + 1);
    shape[key] = requiredSet.has(key) ? lifted : lifted.optional();
  }

  // `additionalProperties` — the registry pins objects closed (projectJsonSchema forces false); accept only
  // the closed form (absent or `false`). `true`/a schema is refused (an open bag over-permits guest args).
  const additional = node["additionalProperties"];
  if (additional !== undefined && additional !== false) {
    throw new JsonSchemaLiftError("additionalProperties (open/schema form)", path);
  }
  return z.object(shape);
}

/** Lift one JSON Schema node into zod. A node with no `type` but an `anyOf`/`enum`/`const` lifts by those;
 *  otherwise a missing/unknown `type` is refused. */
function liftNode(node: Record<string, unknown>, path: string, depth: number): z.ZodType {
  // Refuse an over-deep guest schema with a TYPED error BEFORE the recursion blows the host V8 stack (INFO-3).
  if (depth > MAX_LIFT_DEPTH) {
    throw new JsonSchemaLiftError("max-depth-exceeded", path);
  }
  // `anyOf` is checked FIRST and stands alone: a node carrying it plus a `type`/constraint is ambiguous, and
  // refusing beats silently honoring one half of it.
  if ("anyOf" in node) {
    return liftUnion(node, path, depth);
  }
  if ("const" in node) {
    // const stands alone; reject any sibling constraint to avoid a silent-ignored keyword.
    rejectUnsupportedKeys(node, "", path);
    return liftConst(node["const"], path);
  }
  if ("enum" in node && node["type"] === undefined) {
    rejectUnsupportedKeys(node, STRING_TYPE, path);
    return liftEnum(node["enum"] as readonly unknown[], path);
  }

  const type = node["type"];
  if (typeof type !== "string") {
    throw new JsonSchemaLiftError(type === undefined ? "type (missing)" : "type (non-string / union)", path);
  }
  if (!LIFTABLE_JSON_SCHEMA.types.includes(type as (typeof LIFTABLE_JSON_SCHEMA.types)[number])) {
    throw new JsonSchemaLiftError(`type "${type}"`, path);
  }
  rejectUnsupportedKeys(node, type, path);

  // A typed node may still pin an enum (e.g. type:"string" + enum:[…]) — the enum wins (narrower).
  if ("enum" in node) {
    if (type !== STRING_TYPE) {
      throw new JsonSchemaLiftError("enum (non-string type)", path);
    }
    return liftEnum(node["enum"] as readonly unknown[], path);
  }

  switch (type) {
    case STRING_TYPE:
      return liftString(node, path);
    case NUMBER_TYPE:
      return liftNumber(node, false);
    case INTEGER_TYPE:
      return liftNumber(node, true);
    case BOOLEAN_TYPE:
      return z.boolean();
    case ARRAY_TYPE:
      return liftArray(node, path, depth);
    case OBJECT_TYPE:
      return liftObject(node, path, depth);
    default:
      throw new JsonSchemaLiftError(`type "${type}"`, path);
  }
}

/** Lift an untrusted guest tool-arg JSON Schema into a zod OBJECT schema (tool args are always an object — the
 *  registry's MCP projection requires it, tool-use `register`). Throws {@link JsonSchemaLiftError} naming the
 *  first unsupported construct. The result is plain zod (projection-clean — no transforms/brands). */
export function liftJsonSchema(schema: Record<string, unknown>): z.ZodObject {
  if (schema["type"] !== OBJECT_TYPE) {
    throw new JsonSchemaLiftError("root (tool args must be a JSON Schema object)", "#");
  }
  rejectUnsupportedKeys(schema, OBJECT_TYPE, "#");
  return liftObject(schema, "#", 0) as z.ZodObject;
}
