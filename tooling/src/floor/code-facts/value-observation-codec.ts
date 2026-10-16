// Existing atom storage carries complete projected trees and exact native source anchors.
import { z } from "zod";
import { nativeTypeVocabularySchema } from "./type-projection-contract.ts";
import type { NativeColumnRowObservation, ProjectedStoredValueMember, ProjectedStoredValueShape } from "./value-observation-contract.ts";

/** The same recursive vocabulary validates scalar capture and replay without a Type-shaped substitute. */
export function storedValueObservationSchema<Anchor>(anchor: z.ZodType<Anchor>): z.ZodType<ProjectedStoredValueShape<Anchor>> {
  const member: z.ZodType<ProjectedStoredValueMember<Anchor>> = z.lazy(() =>
    z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("named"), name: z.string() }),
      z.strictObject({ kind: z.literal("spread"), value: shape }),
      z.strictObject({ kind: z.enum(["computed", "other"]) }),
    ]),
  );
  const shape: z.ZodType<ProjectedStoredValueShape<Anchor>> = z.lazy(() =>
    z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.enum(["empty", "sql", "unresolved", "typed"]), node: anchor, type: nativeTypeVocabularySchema }),
      z.strictObject({ kind: z.enum(["binding", "call", "choice"]), node: anchor, type: nativeTypeVocabularySchema, values: z.array(shape) }),
      z.strictObject({ kind: z.literal("object"), node: anchor, type: nativeTypeVocabularySchema, members: z.array(member) }),
    ]),
  );
  return shape;
}
/** Row narrowing may refuse semantically; missing rows are never decoded as resolved absence. */
export function columnRowObservationSchema<Anchor>(anchor: z.ZodType<Anchor>): z.ZodType<NativeColumnRowObservation<Anchor>> {
  return z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("refused"),
      node: anchor,
      message: z.string(),
      column: z.strictObject({ property: z.string().nullable(), row: anchor, ambiguous: z.boolean() }),
    }),
    z.strictObject({
      kind: z.literal("resolved"),
      column: z.strictObject({ property: z.string().nullable(), row: anchor, ambiguous: z.boolean() }).nullable(),
      table: anchor.nullable(),
      declarations: z.array(anchor),
    }),
  ]);
}
/** Mapping anchors retains every branch/member and complete native type observation. */
export function mapStoredValueObservation<From, To>(shape: ProjectedStoredValueShape<From>, map: (node: From) => To): ProjectedStoredValueShape<To> {
  const base = { node: map(shape.node), type: shape.type };
  if (shape.kind === "object") {
    return {
      ...base,
      kind: shape.kind,
      members: shape.members.map((member) => (member.kind === "spread" ? { ...member, value: mapStoredValueObservation(member.value, map) } : member)),
    };
  }
  if (shape.kind === "binding" || shape.kind === "call" || shape.kind === "choice") {
    return { ...base, kind: shape.kind, values: shape.values.map((value) => mapStoredValueObservation(value, map)) };
  }
  return { ...base, kind: shape.kind };
}
/** Only source anchors change between native capture and canonical syntax replay. */
export function mapColumnRowObservation<From, To>(value: NativeColumnRowObservation<From>, map: (node: From) => To): NativeColumnRowObservation<To> {
  return value.kind === "refused"
    ? { ...value, node: map(value.node), column: { ...value.column, row: map(value.column.row) } }
    : {
        ...value,
        column: value.column === null ? null : { ...value.column, row: map(value.column.row) },
        table: value.table === null ? null : map(value.table),
        declarations: value.declarations.map(map),
      };
}
