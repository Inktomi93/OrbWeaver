// A structured-output request checked against a grammar's stated ceilings, counted on what reaches the wire: each
// schema after `scrubWireSchema`, summed across the request, because the ceilings are per request and the reshape
// moves weight between them (`strict-compatible` turns every optional into a nullable union).

import type { StructuredVehicle, WireSchemaLimits, WireSchemaMode } from "./wire-subset.ts";
import { LONG_ENUM_VALUES, scrubWireSchema, WIRE_SUBSETS } from "./wire-subset.ts";

/** A grammar ceiling's kind, in the order {@link countWireSchemas} reports them. */
export const WIRE_SCHEMA_CEILINGS = [
  "optional-props",
  "union-props",
  "strict-tools",
  "object-props",
  "depth",
  "enum-values",
  "name-chars",
  "long-enum-chars",
] as const;
export type WireSchemaCeiling = (typeof WIRE_SCHEMA_CEILINGS)[number];

/** Every way a structured request can fail its plan, as data. */
export const WIRE_SCHEMA_VIOLATION_KINDS = [
  ...WIRE_SCHEMA_CEILINGS,
  "refused-keyword",
  "root-not-object",
  "ambiguous-null",
  "no-vehicle",
  "vendor-refused",
] as const;

/** Where in a plan a violation came from: the candidate format's index and the vehicle it was tried on. */
interface ViolationOrigin {
  readonly mode: WireSchemaMode;
  readonly shape?: number | undefined;
  readonly vehicle?: StructuredVehicle | undefined;
}

interface CeilingViolation extends ViolationOrigin {
  readonly kind: WireSchemaCeiling;
  readonly count: number;
  readonly limit: number;
}

interface RefusedKeywordViolation extends ViolationOrigin {
  readonly kind: "refused-keyword";
  readonly keyword: string;
  readonly path: string;
}

interface PathViolation extends ViolationOrigin {
  readonly kind: "root-not-object" | "ambiguous-null";
  readonly path: string;
}

/** Why a structured or tool request has no permitted carrier on this turn. */
const NO_VEHICLE_CAUSES = [
  "unsupported",
  "assistant-prefill",
  "tools-without-native",
  "tools-with-prefill",
  "tools-unsupported",
  "tools-with-reasoning",
] as const;
type NoVehicleCause = (typeof NO_VEHICLE_CAUSES)[number];

const NO_VEHICLE_REASON: Readonly<Record<NoVehicleCause, string>> = {
  "tools-unsupported": "this model's selected API route does not support tool calls",
  "tools-with-reasoning": "tool calls on this API route require reasoning effort none; choose none or a route that supports tools with reasoning",
  unsupported: "this model takes neither structured output nor tool calls",
  "assistant-prefill":
    "structured output cannot be used on a turn that ends with a prefilled assistant message, and this model has no tool calls to carry it instead",
  "tools-without-native":
    "this model has no native structured output, and a turn that offers its own tools cannot also carry the structured answer as a tool call",
  "tools-with-prefill":
    "structured output cannot be used on a turn that ends with a prefilled assistant message, and a turn that offers its own tools cannot carry the structured answer as a tool call instead",
};

interface NoVehicleViolation extends ViolationOrigin {
  readonly kind: "no-vehicle";
  readonly cause: NoVehicleCause;
}

/** A vendor refused the schema without naming a count: `rule` is the matched refusal's name, never its body. */
interface VendorRefusedViolation extends ViolationOrigin {
  readonly kind: "vendor-refused";
  readonly rule: string;
}

/** One reason a structured request cannot go out as asked. */
export type WireSchemaViolation = CeilingViolation | RefusedKeywordViolation | PathViolation | NoVehicleViolation | VendorRefusedViolation;

/** One violation as an operator-facing phrase. */
export function describeWireSchemaViolation(violation: WireSchemaViolation): string {
  switch (violation.kind) {
    case "refused-keyword":
      return `${violation.keyword} at ${violation.path === "" ? "the root" : violation.path} is not expressible under ${violation.mode}`;
    case "root-not-object":
      return `the root is not an object, which ${violation.mode} requires`;
    case "ambiguous-null":
      return `${violation.path} is both optional and nullable, so absent and null would collide under ${violation.mode}`;
    case "no-vehicle":
      return NO_VEHICLE_REASON[violation.cause];
    case "vendor-refused":
      return `the provider refused the schema (${violation.rule})`;
    case "optional-props":
    case "union-props":
    case "strict-tools":
    case "object-props":
    case "depth":
    case "enum-values":
    case "name-chars":
    case "long-enum-chars":
      return `${violation.kind} ${violation.count} over the limit of ${violation.limit} (${violation.mode})`;
  }
}

export interface WireSchemaCheck {
  readonly fits: boolean;
  readonly violations: readonly WireSchemaViolation[];
  /** Each schema as the mode puts it on the wire, in input order. */
  readonly wire: readonly Record<string, unknown>[];
}

/** The two facts a schema check reads off a connection: its grammar vocabulary and the ceilings that bind it. The
 *  planner in `@orb/inference` derives the full target from a resolved connection. */
export interface StructuredSchemaTarget {
  readonly mode: WireSchemaMode;
  readonly limits: WireSchemaLimits | undefined;
}

/** The target a check uses with no connection in hand: the hosted vocabulary under every documented vendor
 *  ceiling, so a schema that fits it fits any hosted route. */
export const HOSTED_INTERSECTION_TARGET: StructuredSchemaTarget = {
  mode: "hosted-common",
  limits: { ...WIRE_SUBSETS["strict-compatible"].limits, ...WIRE_SUBSETS["anthropic-format"].limits },
};

/** The ceilings that bind a model: the named mode's documented defaults with the capability's own overrides merged
 *  over them field by field. `undefined` when neither states one. */
export function effectiveStructuredLimits(limitsFrom: WireSchemaMode | undefined, overrides: WireSchemaLimits | undefined): WireSchemaLimits | undefined {
  const base = limitsFrom === undefined ? undefined : WIRE_SUBSETS[limitsFrom].limits;
  return base === undefined && overrides === undefined ? undefined : { ...base, ...overrides };
}

interface SchemaWeight {
  optionalProps: number;
  unionProps: number;
  objectProps: number;
  depth: number;
  enumValues: number;
  nameChars: number;
  /** The longest string enum past {@link LONG_ENUM_VALUES} values, in total characters. */
  longEnumChars: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnion(param: Record<string, unknown>): boolean {
  return Array.isArray(param["anyOf"]) || Array.isArray(param["oneOf"]) || Array.isArray(param["type"]);
}

const DEF_KEYS = ["$defs", "definitions"] as const;
const NAME_MAP_KEYS: ReadonlySet<string> = new Set<string>(["properties", ...DEF_KEYS]);

// One node's own weight; its children are the walk's.
function weighNode(node: Record<string, unknown>, weight: SchemaWeight): void {
  const properties = node["properties"];
  if (isRecord(properties)) {
    const required = new Set(Array.isArray(node["required"]) ? node["required"] : []);
    for (const [key, param] of Object.entries(properties)) {
      weight.objectProps += 1;
      weight.nameChars += key.length;
      weight.optionalProps += required.has(key) ? 0 : 1;
      weight.unionProps += isRecord(param) && isUnion(param) ? 1 : 0;
    }
  }
  weighNames(node, weight);
}

// The grammar-name weight a node carries beside its properties: enum members, a const, and definition names.
function weighNames(node: Record<string, unknown>, weight: SchemaWeight): void {
  const values = node["enum"];
  if (Array.isArray(values)) {
    weight.enumValues += values.length;
    const chars = values.reduce<number>((sum, value) => sum + String(value).length, 0);
    weight.nameChars += chars;
    if (values.length > LONG_ENUM_VALUES && values.every((value) => typeof value === "string")) {
      weight.longEnumChars = Math.max(weight.longEnumChars, chars);
    }
  }
  if ("const" in node) {
    weight.nameChars += String(node["const"]).length;
  }
  for (const key of DEF_KEYS) {
    const defs = node[key];
    if (isRecord(defs)) {
      weight.nameChars += Object.keys(defs).reduce((sum, name) => sum + name.length, 0);
    }
  }
}

/** A JSON Schema's weight as a structured-output grammar counts it. `depth` is object nesting, the root object 1. */
function weighSchema(schema: unknown): SchemaWeight {
  const weight: SchemaWeight = { optionalProps: 0, unionProps: 0, objectProps: 0, depth: 0, enumValues: 0, nameChars: 0, longEnumChars: 0 };
  const visit = (node: unknown, depth: number): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth);
      }
      return;
    }
    if (!isRecord(node)) {
      return;
    }
    weighNode(node, weight);
    const here = isRecord(node["properties"]) ? depth + 1 : depth;
    weight.depth = Math.max(weight.depth, here);
    for (const child of childSchemas(node)) {
      visit(child, here);
    }
  };
  visit(schema, 0);
  return weight;
}

// A node's children to walk. A name map's keys are field names: its members are schemas, the map itself is not one.
function childSchemas(node: Record<string, unknown>): unknown[] {
  return Object.entries(node).flatMap(([key, value]) => (NAME_MAP_KEYS.has(key) && isRecord(value) ? Object.values(value) : [value]));
}

/** A JSON Schema's optional and union-typed property counts, the two ceilings Anthropic reports in its refusals. */
export function structuredSchemaComplexity(schema: unknown): { readonly optionalProps: number; readonly unionProps: number } {
  const { optionalProps, unionProps } = weighSchema(schema);
  return { optionalProps, unionProps };
}

/** Each ceiling's count over a request's summed weight, keyed by the ceiling kind. */
const CEILING_READS: Readonly<
  Record<WireSchemaCeiling, { readonly limit: keyof WireSchemaLimits; readonly count: (w: SchemaWeight, tools: number) => number }>
> = {
  "optional-props": { limit: "maxOptionalProps", count: (w) => w.optionalProps },
  "union-props": { limit: "maxUnionProps", count: (w) => w.unionProps },
  "strict-tools": { limit: "maxStrictTools", count: (_w, tools) => tools },
  "object-props": { limit: "maxObjectProps", count: (w) => w.objectProps },
  depth: { limit: "maxDepth", count: (w) => w.depth },
  "enum-values": { limit: "maxEnumValues", count: (w) => w.enumValues },
  "name-chars": { limit: "maxNameChars", count: (w) => w.nameChars },
  "long-enum-chars": { limit: "maxLongEnumChars", count: (w) => w.longEnumChars },
};

/** Count already-scrubbed schemas against `limits`: every grammar-compiled schema of one request (the response
 *  schema and each strict tool's parameters), plus the number of strict tools. Depth is the deepest schema's. */
export function countWireSchemas(
  scrubbed: readonly Record<string, unknown>[],
  args: { readonly mode: WireSchemaMode; readonly limits: WireSchemaLimits | undefined; readonly strictTools: number },
): readonly WireSchemaViolation[] {
  if (args.limits === undefined) {
    return [];
  }
  const total: SchemaWeight = { optionalProps: 0, unionProps: 0, objectProps: 0, depth: 0, enumValues: 0, nameChars: 0, longEnumChars: 0 };
  for (const schema of scrubbed) {
    const weight = weighSchema(schema);
    total.optionalProps += weight.optionalProps;
    total.unionProps += weight.unionProps;
    total.objectProps += weight.objectProps;
    total.enumValues += weight.enumValues;
    total.nameChars += weight.nameChars;
    total.depth = Math.max(total.depth, weight.depth);
    total.longEnumChars = Math.max(total.longEnumChars, weight.longEnumChars);
  }
  const violations: WireSchemaViolation[] = [];
  for (const kind of WIRE_SCHEMA_CEILINGS) {
    const read = CEILING_READS[kind];
    const limit = args.limits[read.limit];
    const count = read.count(total, args.strictTools);
    if (limit !== undefined && count > limit) {
      violations.push({ kind, mode: args.mode, count, limit });
    }
  }
  return violations;
}

/** What a scrub refused, as violations: each refused construct, an ambiguous optional-and-nullable property, and a
 *  root that is not an object under a reshaping mode. */
export function scrubViolations(scrub: ReturnType<typeof scrubWireSchema>, mode: WireSchemaMode, needsObjectRoot: boolean): readonly WireSchemaViolation[] {
  return [
    ...scrub.refused.map((refusal): WireSchemaViolation => ({ kind: "refused-keyword", mode, keyword: refusal.keyword, path: refusal.path })),
    ...scrub.ambiguousPaths.map((path): WireSchemaViolation => ({ kind: "ambiguous-null", mode, path })),
    ...(needsObjectRoot && scrub.schema["type"] !== "object" ? [{ kind: "root-not-object", mode, path: "" } as const] : []),
  ];
}

/** Does one request's grammar-compiled schemas, scrubbed for `mode`, carry only what the mode expresses and fit
 *  `limits`? The planner's check, and the one a preflight runs over a connection's target. */
export function checkWireSchema(
  schemas: readonly Record<string, unknown>[],
  mode: WireSchemaMode,
  limits: WireSchemaLimits | undefined,
  strictTools = 0,
): WireSchemaCheck {
  const reshapes = WIRE_SUBSETS[mode].requireAllAsNullable;
  const scrubs = schemas.map((schema) => scrubWireSchema(schema, mode));
  const violations = [
    ...scrubs.flatMap((scrub) => scrubViolations(scrub, mode, reshapes)),
    ...countWireSchemas(
      scrubs.map((scrub) => scrub.schema),
      { mode, limits, strictTools },
    ),
  ];
  return { fits: violations.length === 0, violations, wire: scrubs.map((scrub) => scrub.schema) };
}
