// Closed native type observations; declaration origins stay distinct from field displays and policy judgments.
import type { Node } from "ts-morph";
import { z } from "zod";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { TypeIdentityOrigin } from "./type-member-origin-contract.ts";
import type { NativeTypeOriginProjection } from "./type-origin-projection-contract.ts";

export const TYPE_PROJECTION_FACETS = [
  "string-index",
  "properties",
  "call-signatures",
  "scalar",
  "type-identity",
  "type-symbol",
  "runtime-undefined",
  "origins",
  "declaration-export",
  "vocabulary",
] as const;
export type TypeProjectionFacet = (typeof TYPE_PROJECTION_FACETS)[number];

export const typeProjectionPlanSchema = z
  .strictObject({
    facets: z.array(z.enum(TYPE_PROJECTION_FACETS)).min(1),
    properties: z.array(z.string()),
  })
  .refine(
    (plan) => new Set(plan.facets).size === plan.facets.length && new Set(plan.properties).size === plan.properties.length,
    "native type projection demand contains duplicate facets or properties",
  )
  .refine((plan) => plan.facets.includes("properties") === plan.properties.length > 0, "native type property demand must name its exact properties");
export type TypeProjectionPlan = z.infer<typeof typeProjectionPlanSchema>;

export interface NativeTypePropertyPresence {
  readonly name: string;
  readonly present: boolean;
}

export interface NativeScalarTypeProjection {
  readonly stringLiterals: readonly string[];
  readonly nonNullableObject: boolean;
  readonly any: boolean;
  readonly unknown: boolean;
}

export const nativeTypeVocabularySchema = z.strictObject({
  properties: z.array(z.string()),
  arms: z
    .array(
      z.strictObject({
        string: z.boolean(),
        number: z.boolean(),
        boolean: z.boolean(),
        literal: z.boolean(),
        array: z.boolean(),
        tuple: z.boolean(),
        null: z.boolean(),
        undefined: z.boolean(),
        any: z.boolean(),
        unknown: z.boolean(),
        symbolName: z.string().nullable(),
        stringIndex: z.boolean(),
        properties: z.array(z.string()),
      }),
    )
    .min(1),
});
export type NativeTypeVocabulary = z.infer<typeof nativeTypeVocabularySchema>;

export interface NativeTypeProjectionValues {
  readonly vocabulary: NativeTypeVocabulary;
  readonly "declaration-export": boolean;
  readonly origins: NativeTypeOriginProjection;
  readonly "runtime-undefined": boolean;
  readonly "string-index": boolean;
  readonly properties: readonly NativeTypePropertyPresence[];
  readonly "call-signatures": boolean;
  readonly scalar: NativeScalarTypeProjection;
  readonly "type-identity": ReferenceFact<TypeIdentityOrigin>;
  /** Null is no type symbol; an empty declaration set remains a distinct native answer. */
  readonly "type-symbol": readonly Node[] | null;
}

export type NativeTypeProjection = { readonly [Facet in TypeProjectionFacet]?: NativeTypeProjectionValues[Facet] };

/** Canonical request identity preserves property membership without depending on caller ordering. */
export function canonicalTypeProjectionPlan(input: TypeProjectionPlan): TypeProjectionPlan {
  const plan = typeProjectionPlanSchema.parse(input);
  return { facets: plan.facets.toSorted(), properties: plan.properties.toSorted() };
}

/** Missing requested data is unavailable evidence, never an absent property or a negative classification. */
export function typeProjectionFacet<Facet extends TypeProjectionFacet>(facts: NativeTypeProjection, facet: Facet): NativeTypeProjectionValues[Facet] {
  const value = facts[facet];
  if (value === undefined) {
    throw new Error(`native type projection facet ${facet} is unavailable`);
  }
  return value;
}

/** A delivered projection contains exactly the requested facets and property names. */
export function assertTypeProjectionCoverage<Values extends { readonly properties?: readonly NativeTypePropertyPresence[] | undefined }>(
  facts: Values,
  input: TypeProjectionPlan,
): void {
  const plan = canonicalTypeProjectionPlan(input);
  const actual = Object.keys(facts).toSorted();
  if (
    Object.values(facts).some((value) => value === undefined) ||
    actual.length !== plan.facets.length ||
    actual.some((key, index) => key !== plan.facets[index])
  ) {
    throw new Error("native type projection facet coverage is incomplete or foreign");
  }
  if (plan.facets.includes("properties")) {
    const properties = facts.properties;
    if (properties === undefined || properties.length !== plan.properties.length || properties.some(({ name }, index) => name !== plan.properties[index])) {
      throw new Error("native type projection property coverage is incomplete or foreign");
    }
  }
}
