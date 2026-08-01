// tests/support/zod-leaf-paths — a MECHANICAL leaf-path enumeration over a zod v4 schema, so a field
// inventory derives from the CONTRACT instead of a hand-typed list that rots the day someone adds a column.
// Used by the rpg field-reachability suite: every leaf the snapshot/sheet schemas declare must either reach a
// model-facing read surface or carry a cited exemption, and a NEW field enters that matrix by existing.
//
// Path grammar (stable, assertion-friendly): `a.b` object keys · `a[]` array elements · `a.*` record values ·
// a discriminated/object union contributes the UNION of its options' leaves (one path per option field, deduped,
// declaration order preserved). Optional/nullable/default/readonly wrappers are transparent. Anything else — a
// primitive, an enum, a `.transform()` pipe (the branded-id schemas), a scalar union — is a LEAF.

import type { z } from "zod";

/** The zod v4 internal def shape this walker reads. Zod exposes `.def` publicly per node; the fields present
 *  depend on `type` (verified against zod 4.4: object→shape, array→element, record→valueType, union→options,
 *  optional/nullable/default/readonly/nonoptional→innerType). */
interface ZodDefLike {
  readonly type: string;
  readonly shape?: Readonly<Record<string, unknown>>;
  readonly element?: unknown;
  readonly valueType?: unknown;
  readonly options?: readonly unknown[];
  readonly innerType?: unknown;
}

/** The wrappers that carry no path segment of their own — unwrap and keep walking. */
const TRANSPARENT = new Set(["optional", "nullable", "default", "prefault", "readonly", "nonoptional", "catch"]);

function defOf(schema: unknown): ZodDefLike | null {
  if (typeof schema !== "object" || schema === null) {
    return null;
  }
  const def = (schema as { def?: unknown }).def;
  if (typeof def !== "object" || def === null || typeof (def as { type?: unknown }).type !== "string") {
    return null;
  }
  return def as ZodDefLike;
}

function walk(schema: unknown, prefix: string, out: string[]): void {
  const def = defOf(schema);
  if (def === null) {
    push(out, prefix);
    return;
  }
  if (TRANSPARENT.has(def.type) && def.innerType !== undefined) {
    walk(def.innerType, prefix, out);
    return;
  }
  if (!walkContainer(def, prefix, out)) {
    push(out, prefix);
  }
}

/** Walk a COMPOSITE node's children; `false` = this node is a leaf (a primitive, an enum, a `.transform()`
 *  pipe, or a scalar union) and the caller records the path. */
function walkContainer(def: ZodDefLike, prefix: string, out: string[]): boolean {
  if (def.type === "object" && def.shape !== undefined) {
    for (const [key, child] of Object.entries(def.shape)) {
      walk(child, prefix === "" ? key : `${prefix}.${key}`, out);
    }
    return true;
  }
  if (def.type === "array" && def.element !== undefined) {
    walk(def.element, `${prefix}[]`, out);
    return true;
  }
  if (def.type === "record" && def.valueType !== undefined) {
    walk(def.valueType, `${prefix}.*`, out);
    return true;
  }
  return walkUnion(def, prefix, out);
}

/** An OBJECT union (discriminated or not) contributes every option's fields — a `cast` NPC's `castKey` is a
 *  field of the actor-ref plane exactly as `characterId` is. A SCALAR union (`number | string`) is a leaf. */
function walkUnion(def: ZodDefLike, prefix: string, out: string[]): boolean {
  if (def.type !== "union" || def.options === undefined) {
    return false;
  }
  const objectOptions = def.options.filter((o) => defOf(o)?.type === "object");
  if (objectOptions.length === 0 || objectOptions.length !== def.options.length) {
    return false;
  }
  for (const option of objectOptions) {
    walk(option, prefix, out);
  }
  return true;
}

function push(out: string[], path: string): void {
  if (path !== "" && !out.includes(path)) {
    out.push(path);
  }
}

/** Every LEAF path a schema declares, in declaration order (see the header for the path grammar). */
export function zodLeafPaths(schema: z.ZodType, prefix = ""): readonly string[] {
  const out: string[] = [];
  walk(schema, prefix, out);
  return out;
}
