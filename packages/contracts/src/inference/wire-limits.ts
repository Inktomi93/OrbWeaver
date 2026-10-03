// A structured-output request's weight against a grammar's stated ceilings (`WireSubset.limits`), counted on what
// actually reaches the wire: each schema AFTER `scrubWireSchema` for the mode, summed across the request, because
// the ceilings are per request and the modes move weight between them (`strict-compatible` turns every optional
// into a nullable union; the others keep it optional).

import type { WireSchemaMode } from "./wire-subset.ts";
import { scrubWireSchema, WIRE_SCHEMA_MODES, WIRE_SUBSETS } from "./wire-subset.ts";

/** A JSON Schema's weight as a structured-output grammar counts it, per PARAMETER (an object property): those
 *  left out of their object's `required`, and those typed by a union (`anyOf`/`oneOf` or a `type` array). */
export function structuredSchemaComplexity(schema: unknown): { readonly optionalProps: number; readonly unionProps: number } {
  const weight = { optionalProps: 0, unionProps: 0 };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (isRecord(node)) {
      countProperties(node, weight);
      Object.values(node).forEach(visit);
    }
  };
  visit(schema);
  return weight;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnion(param: Record<string, unknown>): boolean {
  return Array.isArray(param["anyOf"]) || Array.isArray(param["oneOf"]) || Array.isArray(param["type"]);
}

/** Count ONE object node's own parameters into `weight` (its nested nodes are the walk's job). */
function countProperties(node: Record<string, unknown>, weight: { optionalProps: number; unionProps: number }): void {
  const properties = node["properties"];
  if (!isRecord(properties)) {
    return;
  }
  const required = new Set(Array.isArray(node["required"]) ? node["required"] : []);
  for (const [key, param] of Object.entries(properties)) {
    weight.optionalProps += required.has(key) ? 0 : 1;
    weight.unionProps += isRecord(param) && isUnion(param) ? 1 : 0;
  }
}

/** One ceiling a request breaks on one wire mode, as data. */
export interface WireSchemaViolation {
  readonly kind: "optional-props" | "union-props";
  readonly mode: WireSchemaMode;
  readonly count: number;
  readonly limit: number;
}

export interface WireSchemaCheck {
  readonly fits: boolean;
  readonly violations: readonly WireSchemaViolation[];
}

/** Does a request's strict schemas, scrubbed for `mode`, fit the ceilings of `limitsFrom`'s subset (default: the
 *  mode's own)? A subset that states no limits fits everything. `limitsFrom` exists because a vendor's grammar
 *  enforces its table whichever wire class carried the request (OpenRouter scrubs `strict-compatible` and then
 *  forwards to Anthropic). */
export function checkWireSchema(schemas: readonly Record<string, unknown>[], mode: WireSchemaMode, limitsFrom: WireSchemaMode = mode): WireSchemaCheck {
  const limits = WIRE_SUBSETS[limitsFrom].limits;
  let optionalProps = 0;
  let unionProps = 0;
  for (const schema of schemas) {
    const weight = structuredSchemaComplexity(scrubWireSchema(schema, mode).schema);
    optionalProps += weight.optionalProps;
    unionProps += weight.unionProps;
  }
  const violations: WireSchemaViolation[] = [];
  if (limits !== undefined && optionalProps > limits.maxOptionalProps) {
    violations.push({ kind: "optional-props", mode, count: optionalProps, limit: limits.maxOptionalProps });
  }
  if (limits !== undefined && unionProps > limits.maxUnionProps) {
    violations.push({ kind: "union-props", mode, count: unionProps, limit: limits.maxUnionProps });
  }
  return { fits: violations.length === 0, violations };
}

/** {@link checkWireSchema} on EVERY wire mode: for a caller that picks a vehicle before the backend picks the mode,
 *  so the request must fit whichever one it rides. `limitsFrom` undefined ⇒ no stated ceiling ⇒ fits. */
export function fitsEveryWire(schemas: readonly Record<string, unknown>[], limitsFrom: WireSchemaMode | undefined): WireSchemaCheck {
  if (limitsFrom === undefined) {
    return { fits: true, violations: [] };
  }
  const violations = WIRE_SCHEMA_MODES.flatMap((mode) => checkWireSchema(schemas, mode, limitsFrom).violations);
  return { fits: violations.length === 0, violations };
}
