// tests/support/iso/zod-leaf-paths — a MECHANICAL leaf-path enumeration over a zod v4 schema, so a field
// inventory derives from the CONTRACT instead of a hand-typed list that rots the day someone adds a column.
// Used by the rpg field-reachability suite: every leaf the snapshot/sheet schemas declare must either reach a
// model-facing read surface or carry a cited exemption, and a NEW field enters that matrix by existing.
//
// Path grammar (stable, assertion-friendly): `a.b` object keys · `a[]` array elements · `a.*` record values ·
// a discriminated/object union contributes the UNION of its options' leaves (one path per option field, deduped,
// declaration order preserved). Optional/nullable/default/readonly wrappers are transparent. Anything else — a
// primitive, an enum, a `.transform()` pipe (the branded-id schemas), a scalar union — is a LEAF.

import { z } from "zod";

/** The wrappers that carry no path segment of their own — unwrap and keep walking. */
type TransparentWrapper = z.ZodOptional | z.ZodNullable | z.ZodDefault | z.ZodPrefault | z.ZodReadonly | z.ZodNonOptional | z.ZodCatch;

function isTransparent(schema: z.core.$ZodType): schema is TransparentWrapper {
  return (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodNonOptional ||
    schema instanceof z.ZodCatch
  );
}

function walk(schema: z.core.$ZodType, prefix: string, out: string[]): void {
  if (isTransparent(schema)) {
    walk(schema.def.innerType, prefix, out);
    return;
  }
  if (!walkContainer(schema, prefix, out)) {
    push(out, prefix);
  }
}

/** Walk a COMPOSITE node's children; `false` = this node is a leaf (a primitive, an enum, a `.transform()`
 *  pipe, or a scalar union) and the caller records the path. */
function walkContainer(schema: z.core.$ZodType, prefix: string, out: string[]): boolean {
  if (schema instanceof z.ZodObject) {
    for (const [key, child] of Object.entries(schema.def.shape)) {
      walk(child, prefix === "" ? key : `${prefix}.${key}`, out);
    }
    return true;
  }
  if (schema instanceof z.ZodArray) {
    walk(schema.def.element, `${prefix}[]`, out);
    return true;
  }
  if (schema instanceof z.ZodRecord) {
    walk(schema.def.valueType, `${prefix}.*`, out);
    return true;
  }
  return walkUnion(schema, prefix, out);
}

/** An OBJECT union (discriminated or not) contributes every option's fields — a `cast` NPC's `npcKey` is a
 *  field of the actor-ref plane exactly as `characterId` is. A SCALAR union (`number | string`) is a leaf. */
function walkUnion(schema: z.core.$ZodType, prefix: string, out: string[]): boolean {
  if (!(schema instanceof z.ZodUnion)) {
    return false;
  }
  const options: readonly z.core.$ZodType[] = schema.def.options;
  if (options.length === 0 || !options.every((option) => option instanceof z.ZodObject)) {
    return false;
  }
  for (const option of options) {
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
