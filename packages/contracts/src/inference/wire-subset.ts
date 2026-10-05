// @orb/contracts/inference wire-subset — the one keyword-scrub engine behind every wire's JSON-Schema subset (D93).
// Pure and isomorphic. One mode per wire class: which keywords an endpoint's grammar can express, never a vendor.
// The walk is position-aware: under `properties`/`$defs`/`definitions` the keys are field names, never keywords.

import { isPlainObject } from "@orb/kit/guards";
import type { Wire } from "./wires.ts";

/** The wire subsets we speak. One member per wire class, never per vendor: what splits them is which keywords the
 *  endpoint can express, and two vendors with the same answer share a mode. */
export const WIRE_SCHEMA_MODES = ["hosted-common", "anthropic-format", "guided-decoding", "strict-compatible", "gbnf", "gemini-schema"] as const;
export type WireSchemaMode = (typeof WIRE_SCHEMA_MODES)[number];

/** How a planned structured request carries its schema: the endpoint's native carrier (`response_format`,
 *  `output_config.format`, `responseJsonSchema`, the agent-sdk `outputFormat`), one tool the model is forced
 *  onto, or one tool offered under `auto`. The planner in `@orb/inference` is the only reader. */
export const STRUCTURED_VEHICLES = ["response-format", "forced-tool", "offered-tool"] as const;
export type StructuredVehicle = (typeof STRUCTURED_VEHICLES)[number];

/** The mode a provider row that names no `features.structuredMode` gets, per wire. */
export const WIRE_STRUCTURED_MODE_DEFAULT: Readonly<Record<Wire, WireSchemaMode>> = {
  "openai-compat": "hosted-common",
  "anthropic-messages": "anthropic-format",
  "google-generative-ai": "gemini-schema",
  "agent-sdk": "anthropic-format",
  "local-light": "hosted-common",
};

// Bound keywords: a mode that strips one relays it into the node's description, so the model still reads the
// constraint the grammar cannot carry. Declaration order is the note's byte order.
const BOUND_KEYWORDS = [
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minProperties",
  "maxProperties",
  "multipleOf",
  "pattern",
] as const;

const BOUND_KEYWORD_SET: ReadonlySet<string> = new Set<string>(BOUND_KEYWORDS);

/** The range keywords llama.cpp's converter honours on `integer` only; on a `number` node it skips them silently. */
const NUMBER_RANGE_KEYWORDS: ReadonlySet<string> = new Set<string>(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]);

/** `z.number().int()` stamps ±MAX_SAFE_INTEGER on every integer node: stripped like any bound, never noted. */
const ARTIFACT_BOUNDS: Readonly<Record<string, number>> = { minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER };

function constraintNoteOf(stripped: ReadonlyMap<string, unknown>): string | null {
  const pairs: string[] = [];
  for (const keyword of BOUND_KEYWORDS) {
    const value = stripped.get(keyword);
    if ((typeof value === "number" && ARTIFACT_BOUNDS[keyword] !== value) || typeof value === "string") {
      pairs.push(`${keyword}: ${String(value)}`);
    }
  }
  return pairs.length === 0 ? null : `[Constraints: ${pairs.join(", ")}]`;
}

/** The only `minItems` values the Anthropic structured-output subset accepts. */
const CLAMPED_MIN_ITEMS = [0, 1] as const;

// Keep the strongest floor the endpoint can express ("at least one") and relay the author's number as prose.
function clampMinItems(node: Record<string, unknown>, stripped: Map<string, unknown>): void {
  const value = node["minItems"];
  if (typeof value !== "number" || (CLAMPED_MIN_ITEMS as readonly number[]).includes(value)) {
    return;
  }
  stripped.set("minItems", value);
  node["minItems"] = value > 0 ? 1 : 0;
}

// Appends, never replaces: an author's own prose keeps its bytes and position.
function appendConstraintNote(node: Record<string, unknown>, stripped: ReadonlyMap<string, unknown>): void {
  const note = constraintNoteOf(stripped);
  if (note === null) {
    return;
  }
  const existing = node["description"];
  node["description"] = typeof existing === "string" && existing.length > 0 ? `${existing} ${note}` : note;
}

// `z.toJSONSchema` stamps `$schema`, which no vendor documents and the agent-sdk validator rejects. Every wire
// infers its dialect, so dropping these changes no constraint.
const META_KEYWORDS = ["$schema", "$id"] as const;

// Pure annotations, no validation semantics. `description` is never one: it is the model's instructions.
const ANNOTATION_KEYWORDS = ["title", "default", "examples"] as const;

/** Keys whose value is a `{ name → schema }` map: the names are data, never keywords. */
const NAME_MAP_KEYWORDS: ReadonlySet<string> = new Set<string>(["properties", "$defs", "definitions"]);
const DEF_MAP_KEYWORDS: ReadonlySet<string> = new Set<string>(["$defs", "definitions"]);
const ITEM_KEYWORDS: ReadonlySet<string> = new Set<string>(["items", "prefixItems", "contains"]);
const UNION_KEYWORDS = ["anyOf", "oneOf"] as const;

const OBJECT_TYPE = "object";
const NUMBER_TYPE = "number";
const NULL_TYPE = "null";
const REF_KEYWORD = "$ref";
const LOCAL_REF_PREFIX = "#";
const PATTERN_KEYWORD = "pattern";

/** A construct a wire refuses that one keyword name cannot express: the label it reports and the node test. */
interface NodeRefusal {
  readonly label: string;
  readonly test: (node: Readonly<Record<string, unknown>>) => boolean;
}

/** llama.cpp's converter breaks on an object node that also carries a union (its README's known limits). */
const UNION_BESIDE_PROPERTIES: NodeRefusal = {
  label: "anyOf beside properties",
  test: (node) => "properties" in node && UNION_KEYWORDS.some((key) => key in node),
};

/** llama.cpp accepts any string for a `pattern` that is not `^…$` anchored, so the constraint would be lost silently. */
const UNANCHORED_PATTERN: NodeRefusal = {
  label: "unanchored pattern",
  test: (node) => {
    const pattern = node[PATTERN_KEYWORD];
    return typeof pattern === "string" && !(pattern.startsWith("^") && pattern.endsWith("$"));
  },
};

/** Anthropic's subset takes `allOf`, but not beside or over a `$ref`. */
const ALL_OF_WITH_REF: NodeRefusal = {
  label: "allOf with $ref",
  test: (node) => {
    const arms = node["allOf"];
    return Array.isArray(arms) && (REF_KEYWORD in node || arms.some((arm) => isPlainObject(arm) && REF_KEYWORD in arm));
  },
};

/** Anthropic resolves only references inside the schema itself. */
const EXTERNAL_REF: NodeRefusal = {
  label: "external $ref",
  test: (node) => {
    const ref = node[REF_KEYWORD];
    return typeof ref === "string" && !ref.startsWith(LOCAL_REF_PREFIX);
  },
};

/** Anthropic's subset takes `enum` of primitives only. */
const ENUM_OF_COMPLEX: NodeRefusal = {
  label: "enum of objects or arrays",
  test: (node) => {
    const values = node["enum"];
    return Array.isArray(values) && values.some((value) => value !== null && typeof value === "object");
  },
};

/** The string formats Anthropic's subset accepts. */
const ANTHROPIC_FORMATS: ReadonlySet<string> = new Set<string>(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

const UNSUPPORTED_FORMAT: NodeRefusal = {
  label: "unsupported string format",
  test: (node) => typeof node["format"] === "string" && !ANTHROPIC_FORMATS.has(node["format"]),
};

/** Backreferences, lookaround and word boundaries, which Anthropic's regex subset refuses. */
const UNSUPPORTED_REGEX_FEATURE = /\\[1-9bB]|\(\?<?[=!]/u;

const UNSUPPORTED_PATTERN: NodeRefusal = {
  label: "unsupported pattern feature",
  test: (node) => typeof node[PATTERN_KEYWORD] === "string" && UNSUPPORTED_REGEX_FEATURE.test(node[PATTERN_KEYWORD]),
};

/** Anthropic requires every object closed: an `additionalProperties` schema (a map) or `true` is refused. */
const OPEN_OBJECT: NodeRefusal = {
  label: "additionalProperties other than false",
  test: (node) => "additionalProperties" in node && node["additionalProperties"] !== false,
};

const REF_WITH_SIBLINGS: NodeRefusal = {
  label: "$ref with non-reference siblings",
  test: (node) => REF_KEYWORD in node && Object.keys(node).some((key) => !key.startsWith("$")),
};

/** xgrammar refuses a string that mixes `pattern` or `format` with a length bound. */
const PATTERN_WITH_LENGTH: NodeRefusal = {
  label: "pattern or format with a length bound",
  test: (node) => (PATTERN_KEYWORD in node || "format" in node) && ("minLength" in node || "maxLength" in node),
};

/** xgrammar refuses `propertyNames` beside any other property constraint. */
const PROPERTY_NAMES_CONFLICT: NodeRefusal = {
  label: "propertyNames beside property constraints",
  test: (node) =>
    "propertyNames" in node &&
    ("properties" in node || "patternProperties" in node || "unevaluatedProperties" in node || isPlainObject(node["additionalProperties"])),
};

interface WireSubset {
  /** Keywords dropped from the wire copy; a dropped bound is relayed into the node's description. */
  readonly strip: ReadonlySet<string>;
  /** Keywords this wire cannot express at all: reported, never removed, because removing them changes meaning. */
  readonly refuse: ReadonlySet<string>;
  /** Node shapes this wire cannot express, beyond a single keyword. */
  readonly refuseNodes: readonly NodeRefusal[];
  /** Strip the range keywords from `type: number` nodes only (llama.cpp enforces them on integers). */
  readonly stripNumberRanges: boolean;
  /** Pin `additionalProperties: false` on every object node, where the wire requires a closed object. */
  readonly pinClosed: boolean;
  /** The optional-as-nullable reshape: every property becomes required and each optional becomes
   *  `anyOf: [<schema>, {"type":"null"}]`. The reshaped paths ride the plan so the reply drops exactly those nulls. */
  readonly requireAllAsNullable: boolean;
  /** Keep `minItems`, clamped to {@link CLAMPED_MIN_ITEMS}, instead of stripping it. A mode that sets this must
   *  leave `minItems` out of its `strip` set, or the keyword is gone before the clamp sees it. */
  readonly clampMinItems: boolean;
  /** Refuse a `$defs` member that reaches itself through `$ref` (Anthropic: recursive schemas unsupported). */
  readonly refuseRecursion?: true;
  /** Refuse a `$ref` inside a `$defs` member (llama.cpp's converter breaks on a nested reference). */
  readonly refuseNestedRef?: true;
  /** Recursive references can occur only under a non-required property on this carrier. */
  readonly refuseRequiredRecursion?: true;
  /** The vendor's per-request ceilings as documented; a capability row names the mode whose ceilings bind
   *  (`output.structuredLimitsFrom`) and may override them field by field (`output.structuredLimits`). */
  readonly limits?: WireSchemaLimits;
}

/** Ceilings a structured-output grammar states per request, summed across every strict schema the request
 *  carries. Each is optional: a mode states only what its vendor documents. */
export interface WireSchemaLimits {
  readonly maxOptionalProps?: number | undefined;
  readonly maxUnionProps?: number | undefined;
  readonly maxStrictTools?: number | undefined;
  readonly maxObjectProps?: number | undefined;
  readonly maxDepth?: number | undefined;
  readonly maxEnumValues?: number | undefined;
  readonly maxNameChars?: number | undefined;
  /** Total characters of one string enum that has more than {@link LONG_ENUM_VALUES} values. */
  readonly maxLongEnumChars?: number | undefined;
}

/** The value count past which OpenAI strict caps one string enum's total characters. */
export const LONG_ENUM_VALUES = 250;

const ANTHROPIC_STRIPPED_BOUNDS = BOUND_KEYWORDS.filter((keyword) => keyword !== "minItems" && keyword !== PATTERN_KEYWORD);
const HOSTED_STRIPPED_BOUNDS = BOUND_KEYWORDS.filter((keyword) => keyword !== PATTERN_KEYWORD);
const GEMINI_STRIPPED = [
  "minLength",
  "maxLength",
  PATTERN_KEYWORD,
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minProperties",
  "maxProperties",
] as const;

/** The per-mode vocabulary, a mapped Record so a new mode without a row fails `tsc`. Exported so the
 *  strip-versus-clamp coupling is asserted over the table. */
export const WIRE_SUBSETS: Readonly<Record<WireSchemaMode, WireSubset>> = {
  // A proxy whose upstream is not knowable at build time: the strictest common subset, refusing nothing.
  "hosted-common": {
    strip: new Set<string>([...HOSTED_STRIPPED_BOUNDS, ...META_KEYWORDS]),
    refuse: new Set<string>(),
    refuseNodes: [],
    stripNumberRanges: false,
    pinClosed: false,
    requireAllAsNullable: false,
    clampMinItems: false,
  },
  // platform.claude.com structured-outputs: bounds unsupported except `minItems` 0|1; `oneOf`, `allOf` with
  // `$ref` and external `$ref` unsupported; one complexity table for every request with `output_config.format`
  // or `strict: true` tools.
  "anthropic-format": {
    strip: new Set<string>([...ANTHROPIC_STRIPPED_BOUNDS, ...META_KEYWORDS]),
    refuse: new Set<string>(["oneOf"]),
    refuseNodes: [ALL_OF_WITH_REF, EXTERNAL_REF, ENUM_OF_COMPLEX, UNSUPPORTED_FORMAT, UNSUPPORTED_PATTERN, OPEN_OBJECT],
    stripNumberRanges: false,
    pinClosed: true,
    requireAllAsNullable: false,
    clampMinItems: true,
    refuseRecursion: true,
    limits: { maxOptionalProps: 24, maxUnionProps: 16, maxStrictTools: 20 },
  },
  // developers.openai.com structured-outputs: every field required, optionals as a union with null, closed objects;
  // `allOf`, `not`, `if`/`then`/`else`, `dependentRequired`, `dependentSchemas` unsupported. The bound strip is
  // the hosted intersection, because OpenRouter forwards this shape to every family.
  "strict-compatible": {
    strip: new Set<string>([...HOSTED_STRIPPED_BOUNDS, ...META_KEYWORDS]),
    refuse: new Set<string>(["allOf", "not", "if", "then", "else", "dependentRequired", "dependentSchemas"]),
    refuseNodes: [],
    stripNumberRanges: false,
    pinClosed: true,
    requireAllAsNullable: true,
    clampMinItems: false,
    limits: { maxObjectProps: 5000, maxDepth: 10, maxEnumValues: 1000, maxNameChars: 120_000, maxLongEnumChars: 15_000 },
  },
  // vLLM xgrammar compiles the bounds, so they survive; it refuses the array and number features below.
  "guided-decoding": {
    strip: new Set<string>([...ANNOTATION_KEYWORDS, ...META_KEYWORDS]),
    refuse: new Set<string>(["multipleOf", "uniqueItems", "contains", "minContains", "maxContains", "patternProperties"]),
    refuseNodes: [PATTERN_WITH_LENGTH, PROPERTY_NAMES_CONFLICT],
    stripNumberRanges: false,
    pinClosed: true,
    requireAllAsNullable: false,
    clampMinItems: false,
  },
  // llama.cpp's JSON-schema-to-grammar converter, which Ollama and KoboldCpp run too. It skips what it cannot
  // express silently (KoboldCpp then generates unconstrained), so everything it cannot carry is refused here.
  gbnf: {
    strip: new Set<string>([...META_KEYWORDS]),
    refuse: new Set<string>([
      "uniqueItems",
      "contains",
      "minContains",
      "maxContains",
      "not",
      "if",
      "then",
      "else",
      "dependentSchemas",
      "patternProperties",
      "prefixItems",
      "$anchor",
    ]),
    refuseNodes: [UNION_BESIDE_PROPERTIES, UNANCHORED_PATTERN],
    stripNumberRanges: true,
    pinClosed: true,
    requireAllAsNullable: false,
    clampMinItems: false,
    refuseNestedRef: true,
  },
  // Google ignores unsupported constraints and reads oneOf as anyOf; neither preserves validation semantics.
  "gemini-schema": {
    strip: new Set<string>([...GEMINI_STRIPPED, ...META_KEYWORDS]),
    refuse: new Set<string>([
      "allOf",
      "oneOf",
      "not",
      "if",
      "then",
      "else",
      "dependentRequired",
      "dependentSchemas",
      "propertyNames",
      "patternProperties",
      "uniqueItems",
      "contains",
      "minContains",
      "maxContains",
      "unevaluatedProperties",
      "unevaluatedItems",
    ]),
    refuseNodes: [REF_WITH_SIBLINGS],
    stripNumberRanges: false,
    pinClosed: false,
    requireAllAsNullable: false,
    clampMinItems: false,
    refuseRequiredRecursion: true,
  },
};

const NULL_ARM = { type: NULL_TYPE } as const;

/** The schema a local `$ref` (`#/$defs/Name`, `#/definitions/Name`) points at inside `root`, if any. */
function resolveLocalRef(root: Record<string, unknown>, ref: string): Record<string, unknown> | undefined {
  let node: unknown = root;
  for (const segment of ref.slice(`${LOCAL_REF_PREFIX}/`.length).split("/")) {
    node = isPlainObject(node) ? node[segment.replaceAll("~1", "/").replaceAll("~0", "~")] : undefined;
  }
  return isPlainObject(node) ? node : undefined;
}

/** Does a node accept `null` as authored: `type: "null"` or a type array with it, an enum or const of `null`, a
 *  null union arm, an `allOf` whose every arm accepts it, or a local `$ref` to a def that does? `seen` stops a
 *  recursive def. */
function acceptsNull(node: Record<string, unknown>, root: Record<string, unknown>, seen: ReadonlySet<string> = new Set()): boolean {
  const type = node["type"];
  const values = node["enum"];
  if (
    type === NULL_TYPE ||
    (Array.isArray(type) && type.includes(NULL_TYPE)) ||
    (Array.isArray(values) && values.includes(null)) ||
    ("const" in node && node["const"] === null)
  ) {
    return true;
  }
  const accepts = (arm: unknown): boolean => isPlainObject(arm) && acceptsNull(arm, root, seen);
  const ref = node[REF_KEYWORD];
  if (typeof ref === "string" && ref.startsWith(`${LOCAL_REF_PREFIX}/`) && !seen.has(ref)) {
    const target = resolveLocalRef(root, ref);
    if (target !== undefined && acceptsNull(target, root, new Set([...seen, ref]))) {
      return true;
    }
  }
  const all = node["allOf"];
  if (Array.isArray(all) && all.length > 0 && all.every(accepts)) {
    return true;
  }
  return UNION_KEYWORDS.some((key) => {
    const arms = node[key];
    return Array.isArray(arms) && arms.some(accepts);
  });
}

/** One construct a mode cannot carry, with the value path of the node it sits on (`""` = the root). */
export interface WireSchemaRefusal {
  readonly keyword: string;
  readonly path: string;
}

/** The scrub's result. `reshapedPaths` are the value paths an optional property became nullable at (only under a
 *  reshaping mode); `ambiguousPaths` are optional properties that were already nullable, where absent and null
 *  would collide after the reshape. Generic over the input so a projected `WireReady` keeps its brand. */
export interface WireSchemaScrub<S extends Record<string, unknown> = Record<string, unknown>> {
  readonly schema: S;
  readonly refused: readonly WireSchemaRefusal[];
  readonly reshapedPaths: readonly string[];
  readonly ambiguousPaths: readonly string[];
}

interface WalkPosition {
  readonly path: string;
  readonly location: string;
  readonly required: boolean;
  readonly definitionRoot: string | undefined;
}

/** Walk state for one scrub. A path under `$defs` starts with `#/`; those are expanded through each `$ref` use. */
interface Walk {
  readonly subset: WireSubset;
  readonly refused: Map<string, WireSchemaRefusal>;
  readonly reshaped: string[];
  readonly ambiguous: string[];
  /** Required properties the author made nullable: a reshaped path that lands on one of these (two union arms
   *  share a field) cannot tell the author's null from the reshape's, so it is ambiguous too. */
  readonly declaredNull: string[];
  readonly refUses: Map<string, string[]>;
  readonly refLocations: Map<string, WalkPosition[]>;
  /** The authored root, where a local `$ref` resolves when asking whether a property accepts null. */
  readonly root: Record<string, unknown>;
}

const SIMPLE_NAME = /^[A-Za-z_$][\w$-]*$/u;
/** The value-path segment for any element of an array. */
export const ARRAY_ITEMS_SEGMENT = "[*]";
/** The value-path segment for any value of a map (`additionalProperties` as a schema). */
export const MAP_VALUES_SEGMENT = "{*}";

/** Append a property name to a value path: `.name`, or `["name"]` for a name a dotted path cannot hold. */
export function propertyPath(parent: string, name: string): string {
  if (SIMPLE_NAME.test(name)) {
    return parent === "" ? name : `${parent}.${name}`;
  }
  return `${parent}[${JSON.stringify(name)}]`;
}

function refuse(walk: Walk, keyword: string, path: string): void {
  const key = `${keyword}\u0000${path}`;
  if (!walk.refused.has(key)) {
    walk.refused.set(key, { keyword, path });
  }
}

function childPath(key: string, path: string): string {
  if (ITEM_KEYWORDS.has(key)) {
    return `${path}${ARRAY_ITEMS_SEGMENT}`;
  }
  return key === "additionalProperties" ? `${path}${MAP_VALUES_SEGMENT}` : path;
}

function pointerChild(location: string, key: string): string {
  return `${location}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function childPosition(position: WalkPosition, key: string): WalkPosition {
  return { ...position, path: childPath(key, position.path), location: pointerChild(position.location, key) };
}

function strips(subset: WireSubset, key: string, node: Record<string, unknown>): boolean {
  return subset.strip.has(key) || (subset.stripNumberRanges && node["type"] === NUMBER_TYPE && NUMBER_RANGE_KEYWORDS.has(key));
}

// What a node says as a whole: a construct the wire refuses, and a local `$ref` use its defs' paths are placed at.
function noteNode(node: Record<string, unknown>, walk: Walk, position: WalkPosition): void {
  const { path } = position;
  for (const rule of walk.subset.refuseNodes) {
    if (rule.test(node)) {
      refuse(walk, rule.label, path);
    }
  }
  const ref = node[REF_KEYWORD];
  if (typeof ref === "string" && ref.startsWith(LOCAL_REF_PREFIX)) {
    walk.refUses.set(ref, [...(walk.refUses.get(ref) ?? []), path]);
    walk.refLocations.set(ref, [...(walk.refLocations.get(ref) ?? []), position]);
    if (walk.subset.refuseNestedRef === true && path.startsWith(`${LOCAL_REF_PREFIX}/`)) {
      refuse(walk, "$ref inside $defs", path);
    }
  }
}

function insideSchema(location: string, ancestor: string): boolean {
  return location === ancestor || location.startsWith(`${ancestor}/`);
}

// Definition declarations are independent schemas, not dependencies of the object that holds their map.
function referenceSources(use: WalkPosition, refs: Iterable<string>): string[] {
  const containing = [...refs].filter((ref) => insideSchema(use.location, ref) && (use.definitionRoot === undefined || insideSchema(ref, use.definitionRoot)));
  return use.definitionRoot === undefined ? [...new Set([LOCAL_REF_PREFIX, ...containing])] : containing;
}

function refEdges(refUses: ReadonlyMap<string, readonly WalkPosition[]>): ReadonlyMap<string, readonly string[]> {
  const edges = new Map<string, string[]>();
  for (const [target, uses] of refUses) {
    for (const use of uses) {
      for (const source of referenceSources(use, refUses.keys())) {
        edges.set(source, [...(edges.get(source) ?? []), target]);
      }
    }
  }
  return edges;
}

function refReaches(edges: ReadonlyMap<string, readonly string[]>, from: string, goal: string, seen: Set<string>): boolean {
  for (const next of edges.get(from) ?? []) {
    if (next === goal) {
      return true;
    }
    if (!seen.has(next)) {
      seen.add(next);
      if (refReaches(edges, next, goal, seen)) {
        return true;
      }
    }
  }
  return false;
}

function recursiveRefs(refUses: ReadonlyMap<string, readonly WalkPosition[]>): readonly string[] {
  const edges = refEdges(refUses);
  return [...refUses.keys()].filter((ref) => refReaches(edges, ref, ref, new Set()));
}

function requiredRecursiveRefPaths(walk: Walk): readonly string[] {
  const edges = refEdges(walk.refLocations);
  return [...walk.refLocations].flatMap(([target, uses]) =>
    uses
      .filter((use) => use.required && referenceSources(use, walk.refLocations.keys()).some((source) => refReaches(edges, target, source, new Set())))
      .map((use) => use.path),
  );
}

// One node's keyword pass: drop what this wire cannot express, report what it must refuse, recurse into the rest,
// and relay the dropped bounds into the node's description.
function scrubKeywords(node: Record<string, unknown>, walk: Walk, position: WalkPosition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const stripped = new Map<string, unknown>();
  noteNode(node, walk, position);
  for (const [key, value] of Object.entries(node)) {
    if (strips(walk.subset, key, node)) {
      if (BOUND_KEYWORD_SET.has(key)) {
        stripped.set(key, value);
      }
      continue;
    }
    if (walk.subset.refuse.has(key)) {
      refuse(walk, key, position.path);
    }
    out[key] = NAME_MAP_KEYWORDS.has(key)
      ? walkNameMap(value, walk, { position: childPosition(position, key), key, parent: node })
      : walkNode(value, walk, childPosition(position, key));
  }
  if (walk.subset.clampMinItems) {
    clampMinItems(out, stripped);
  }
  appendConstraintNote(out, stripped);
  return out;
}

// The optional-as-nullable reshape for one object node, after its children are scrubbed. `description` is hoisted
// out of the wrapped arm: it is the model's instruction for the field.
function requireAllProperties(node: Record<string, unknown>, walk: Walk, path: string): void {
  const properties = node["properties"];
  if (!isPlainObject(properties)) {
    return;
  }
  const names = Object.keys(properties);
  const required = new Set<string>(Array.isArray(node["required"]) ? node["required"].filter((name): name is string => typeof name === "string") : []);
  for (const name of names) {
    const child = properties[name];
    if (!isPlainObject(child)) {
      continue;
    }
    if (required.has(name)) {
      if (acceptsNull(child, walk.root)) {
        walk.declaredNull.push(propertyPath(path, name));
      }
      continue;
    }
    if (acceptsNull(child, walk.root)) {
      walk.ambiguous.push(propertyPath(path, name));
      continue;
    }
    const { description, ...rest } = child;
    properties[name] = { ...(description === undefined ? {} : { description }), anyOf: [rest, { ...NULL_ARM }] };
    walk.reshaped.push(propertyPath(path, name));
  }
  node["required"] = names;
}

function walkNode(node: unknown, walk: Walk, position: WalkPosition): unknown {
  if (Array.isArray(node)) {
    return node.map((item, index) => walkNode(item, walk, { ...position, location: pointerChild(position.location, String(index)) }));
  }
  if (!isPlainObject(node)) {
    return node;
  }
  const out = scrubKeywords(node, walk, position);
  if (walk.subset.pinClosed && out["type"] === OBJECT_TYPE && out["additionalProperties"] === undefined) {
    out["additionalProperties"] = false;
  }
  if (walk.subset.requireAllAsNullable && out["type"] === OBJECT_TYPE) {
    requireAllProperties(out, walk, position.path);
  }
  return out;
}

// Descend a `{ name → schema }` map: every key is an opaque name, every value a schema. A `$defs` member's paths
// are rooted at its reference string until a `$ref` use places them.
function walkNameMap(
  node: unknown,
  walk: Walk,
  args: { readonly position: WalkPosition; readonly key: string; readonly parent: Record<string, unknown> },
): unknown {
  const { position, key, parent } = args;
  if (!isPlainObject(node)) {
    return walkNode(node, walk, position);
  }
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(node)) {
    const definition = DEF_MAP_KEYWORDS.has(key);
    const location = pointerChild(position.location, name);
    const memberPath = definition ? pointerChild(pointerChild(LOCAL_REF_PREFIX, key), name) : propertyPath(position.path, name);
    const required = key === "properties" ? Array.isArray(parent["required"]) && parent["required"].includes(name) : definition || position.required;
    out[name] = walkNode(schema, walk, { path: memberPath, location, required, definitionRoot: definition ? location : position.definitionRoot });
  }
  return out;
}

function isUnderRef(path: string, ref: string): boolean {
  return path === ref || path.startsWith(`${ref}.`) || path.startsWith(`${ref}[`) || path.startsWith(`${ref}{`);
}

/** Place every path recorded under a `$defs` member at each value path that references it. A def reached again
 *  through its own expansion is a recursive schema: its deeper uses are not expanded (no finite path names them). */
function placeDefPaths(paths: readonly string[], refUses: ReadonlyMap<string, readonly string[]>): string[] {
  const placed: string[] = [];
  for (const path of paths) {
    expandDefPath(path, new Set(), refUses, placed);
  }
  return [...new Set(placed)];
}

function expandDefPath(path: string, seen: ReadonlySet<string>, refUses: ReadonlyMap<string, readonly string[]>, placed: string[]): void {
  if (!path.startsWith(`${LOCAL_REF_PREFIX}/`)) {
    placed.push(path);
    return;
  }
  for (const [ref, uses] of refUses) {
    if (!isUnderRef(path, ref) || seen.has(ref)) {
      continue;
    }
    const rest = path.slice(ref.length);
    for (const use of uses) {
      expandDefPath(rest.startsWith(".") && use === "" ? rest.slice(1) : `${use}${rest}`, new Set([...seen, ref]), refUses, placed);
    }
  }
}

/**
 * Project an already-projected JSON Schema onto one wire's supported keyword subset. Returns a fresh tree: the
 * caller's cached `ResponseFormat.schema` also feeds wires that need the keywords this one drops.
 */
export function scrubWireSchema<S extends Record<string, unknown>>(schema: S, mode: WireSchemaMode): WireSchemaScrub<S> {
  const walk: Walk = {
    subset: WIRE_SUBSETS[mode],
    refused: new Map(),
    reshaped: [],
    ambiguous: [],
    declaredNull: [],
    refUses: new Map(),
    refLocations: new Map(),
    root: schema,
  };
  const scrubbed = walkNode(schema, walk, { path: "", location: LOCAL_REF_PREFIX, required: true, definitionRoot: undefined }) as S;
  if (walk.subset.refuseRecursion === true) {
    for (const ref of recursiveRefs(walk.refLocations)) {
      refuse(walk, "recursive $ref", ref === LOCAL_REF_PREFIX ? "" : ref);
    }
  }
  if (walk.subset.refuseRequiredRecursion === true) {
    for (const path of requiredRecursiveRefPaths(walk)) {
      refuse(walk, "required recursive $ref", path);
    }
  }
  const reshapedPaths = placeDefPaths(walk.reshaped, walk.refUses);
  const declaredNull = new Set(placeDefPaths(walk.declaredNull, walk.refUses));
  const collisions = reshapedPaths.filter((path) => declaredNull.has(path));
  return {
    schema: scrubbed,
    refused: [...walk.refused.values()],
    reshapedPaths,
    ambiguousPaths: [...new Set([...placeDefPaths(walk.ambiguous, walk.refUses), ...collisions])],
  };
}
