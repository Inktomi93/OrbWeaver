// Native wire schemas contain data and source anchors only; canonical producers/codecs depend on this boundary.
import { z } from "zod";
import { typeRelationSchema } from "./assignability-contract.ts";
import type { InventoryInvocationReference, InventorySpan } from "./semantic-inventory-contract.ts";
import type { TypeIdentityOrigin } from "./type-member-origin-contract.ts";
import type { NativeTypeProjection, NativeTypeSelections, TypeProjectionPlan } from "./type-projection-contract.ts";
import { assertTypeSelectionCoverage, nativeSelectedTypeSchema, nativeTypeVocabularySchema, typeProjectionPlanSchema } from "./type-projection-contract.ts";
/** Numeric text retains negative zero and nonfinite canonical answers across JSON/SQLite encoding. */
export function authoredNumberText(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

const scalarSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("number"),
    value: z.string().refine((text) => authoredNumberText(Number(text)) === text, "noncanonical authored numeric value"),
  }),
  z.strictObject({ kind: z.literal("string"), value: z.string() }),
  z.strictObject({ kind: z.literal("boolean"), value: z.boolean() }),
  z.strictObject({ kind: z.literal("null") }),
]);
const indexSchema = z.number().int().nonnegative();
export type InventoryAuthoredEntry =
  | { readonly kind: "scalar"; readonly node: InventorySpan; readonly value: z.infer<typeof scalarSchema> }
  | { readonly kind: "tuple"; readonly node: InventorySpan; readonly elements: readonly number[] }
  | {
      readonly kind: "object";
      readonly node: InventorySpan;
      readonly properties: readonly { readonly key: string; readonly keyNode: InventorySpan; readonly value: number }[];
    };
export interface InventoryAuthoredTree {
  readonly root: number;
  readonly entries: readonly InventoryAuthoredEntry[];
}
export interface InventoryAuthoredValueProjection {
  readonly value: InventoryInvocationReference<InventoryAuthoredTree>;
  readonly composite: InventoryInvocationReference<InventorySpan>;
}

/** The inventory supplies its canonical span/reference validators without a runtime module cycle. */
export function authoredProjectionSchema(
  span: z.ZodType<InventorySpan>,
  reference: <Value>(value: z.ZodType<Value>) => z.ZodType<InventoryInvocationReference<Value>>,
): z.ZodType<InventoryAuthoredValueProjection> {
  const entry = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("scalar"), node: span, value: scalarSchema }),
    z.strictObject({ kind: z.literal("tuple"), node: span, elements: z.array(indexSchema) }),
    z.strictObject({ kind: z.literal("object"), node: span, properties: z.array(z.strictObject({ key: z.string(), keyNode: span, value: indexSchema })) }),
  ]);
  return z.strictObject({ value: reference(z.strictObject({ root: indexSchema, entries: z.array(entry).min(1) })), composite: reference(span) });
}

export type InventoryAuthoredScalar = z.infer<typeof scalarSchema>;

export interface InventoryTypeOriginProjection {
  readonly root: InventorySpan;
  readonly stable: InventoryInvocationReference<InventorySpan>;
  readonly binding: InventoryInvocationReference<InventorySpan>;
  readonly bindingProperty: {
    readonly binding: InventorySpan;
    readonly receiver: InventorySpan | null;
    readonly key: InventoryInvocationReference<string>;
    readonly declarations: InventoryInvocationReference<readonly InventorySpan[]> | null;
  } | null;
  readonly values: readonly {
    readonly node: InventorySpan;
    readonly identities: InventoryInvocationReference<readonly WireIdentity[]>;
    readonly member: InventoryInvocationReference<readonly InventorySpan[]>;
  }[];
  readonly annotations: readonly {
    readonly annotation: InventorySpan;
    readonly direct: InventoryInvocationReference<WireIdentity> | null;
    readonly scalar: readonly InventoryInvocationReference<WireIdentity>[];
  }[];
  readonly callable: InventoryInvocationReference<InventorySpan> | null;
}

/** Span/reference schemas come from the existing inventory boundary. */
export function typeOriginProjectionSchema(
  span: z.ZodType<InventorySpan>,
  reference: <Value>(value: z.ZodType<Value>) => z.ZodType<InventoryInvocationReference<Value>>,
  identity: z.ZodType<WireIdentity>,
): z.ZodType<InventoryTypeOriginProjection> {
  return z.strictObject({
    root: span,
    stable: reference(span),
    binding: reference(span),
    bindingProperty: z
      .strictObject({ binding: span, receiver: span.nullable(), key: reference(z.string()), declarations: reference(z.array(span)).nullable() })
      .nullable(),
    values: z.array(z.strictObject({ node: span, identities: reference(z.array(identity)), member: reference(z.array(span)) })),
    annotations: z.array(z.strictObject({ annotation: span, direct: reference(identity).nullable(), scalar: z.array(reference(identity)) })),
    callable: reference(span).nullable(),
  });
}

export type WireIdentity = Omit<TypeIdentityOrigin, "node" | "declarations"> & {
  readonly node: InventorySpan;
  readonly declarations: readonly InventorySpan[];
};
export interface InventoryTypeProjection {
  readonly plan: TypeProjectionPlan;
  readonly values: {
    readonly [Facet in Exclude<keyof NativeTypeProjection, "type-identity" | "type-symbol" | "origins" | "lexical" | "member-declarations">]?:
      | NativeTypeProjection[Facet]
      | undefined;
  } & {
    readonly "member-declarations"?:
      | readonly {
          readonly name: string;
          readonly origin: InventoryInvocationReference<readonly InventorySpan[]>;
          readonly raw: readonly InventorySpan[] | null;
          readonly nonnullable: readonly InventorySpan[] | null;
        }[]
      | undefined;
    readonly lexical?:
      | {
          readonly value: InventoryInvocationReference<InventorySpan>;
          readonly declarations: readonly InventorySpan[] | null;
          readonly origins: readonly InventorySpan[] | null;
        }
      | undefined;
    readonly origins?: InventoryTypeOriginProjection | undefined;
    readonly "type-identity"?: InventoryInvocationReference<WireIdentity> | undefined;
    readonly "type-symbol"?: readonly InventorySpan[] | null | undefined;
  };
}

/** Schema injection keeps the inventory's canonical span/reference vocabulary cycle-free. */
export function typeProjectionSchema(
  span: z.ZodType<InventorySpan>,
  reference: <Value>(value: z.ZodType<Value>) => z.ZodType<InventoryInvocationReference<Value>>,
): z.ZodType<InventoryTypeProjection> {
  const identity = z.strictObject({ name: z.string(), node: span, aliased: z.boolean(), declarations: z.array(span) });
  return z.strictObject({
    plan: typeProjectionPlanSchema,
    values: z.strictObject({
      "member-declarations": z
        .array(z.strictObject({ name: z.string(), origin: reference(z.array(span)), raw: z.array(span).nullable(), nonnullable: z.array(span).nullable() }))
        .optional(),
      lexical: z.strictObject({ value: reference(span), declarations: z.array(span).nullable(), origins: z.array(span).nullable() }).optional(),
      vocabulary: nativeTypeVocabularySchema.optional(),
      "declaration-export": z.boolean().optional(),
      origins: typeOriginProjectionSchema(span, reference, identity).optional(),
      "runtime-undefined": z.boolean().optional(),
      "string-index": z.boolean().optional(),
      properties: z.array(z.strictObject({ name: z.string(), present: z.boolean() })).optional(),
      "call-signatures": z.boolean().optional(),
      scalar: z.strictObject({ stringLiterals: z.array(z.string()), nonNullableObject: z.boolean(), any: z.boolean(), unknown: z.boolean() }).optional(),
      "type-identity": reference(identity).optional(),
      "type-symbol": z.array(span).nullable().optional(),
    }),
  });
}

export type InventoryTypeSelections = NativeTypeSelections<InventorySpan>;

/** Selector identity retains its native source, exact location and ordered transformations. */
export function typeSelectionsSchema(span: z.ZodType<InventorySpan>): z.ZodType<InventoryTypeSelections> {
  const base = z.union([
    z.strictObject({ kind: z.enum(["node", "contextual"]), node: span }),
    z.strictObject({ kind: z.literal("schema-column"), column: z.string() }),
  ]);
  const step = z.union([
    z.strictObject({ kind: z.enum(["nonnullable", "array-element-or-self"]) }),
    z.strictObject({ kind: z.literal("property"), name: z.string(), at: span }),
  ]);
  const relation = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("absent") }),
    z.strictObject({ kind: z.literal("unavailable"), reason: z.literal("primitive-absent") }),
    z.strictObject({ kind: z.literal("answer"), value: typeRelationSchema }),
  ]);
  return z
    .strictObject({
      plan: z.strictObject({
        selectors: z.array(z.strictObject({ base, steps: z.array(step), displayAt: span.nullable() })).min(1),
        relations: z.array(z.strictObject({ left: indexSchema, right: indexSchema })),
      }),
      values: z.array(nativeSelectedTypeSchema.nullable()),
      relations: z.array(relation),
    })
    .superRefine((facts, ctx) => {
      try {
        assertTypeSelectionCoverage(facts);
      } catch (error) {
        ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
      }
    });
}
