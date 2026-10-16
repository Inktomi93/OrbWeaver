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
  "lexical",
  "member-declarations",
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
  .refine(
    (plan) => (plan.facets.includes("properties") || plan.facets.includes("member-declarations")) === plan.properties.length > 0,
    "native type property demand must name its exact properties",
  );
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

export interface NativeLexicalTypeProjection {
  readonly value: ReferenceFact<Node>;
  readonly declarations: readonly Node[] | null;
  readonly origins: readonly Node[] | null;
}

export interface NativeTypeMemberDeclarations {
  readonly name: string;
  readonly origin: ReferenceFact<readonly Node[]>;
  readonly raw: readonly Node[] | null;
  readonly nonnullable: readonly Node[] | null;
}

export interface NativeTypeProjectionValues {
  readonly "member-declarations": readonly NativeTypeMemberDeclarations[];
  readonly lexical: NativeLexicalTypeProjection;
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
export function assertTypeProjectionCoverage<
  Values extends {
    readonly properties?: readonly NativeTypePropertyPresence[] | undefined;
    readonly "member-declarations"?: readonly { readonly name: string }[] | undefined;
  },
>(facts: Values, input: TypeProjectionPlan): void {
  const plan = canonicalTypeProjectionPlan(input);
  const actual = Object.keys(facts).toSorted();
  if (
    Object.values(facts).some((value) => value === undefined) ||
    actual.length !== plan.facets.length ||
    actual.some((key, index) => key !== plan.facets[index])
  ) {
    throw new Error("native type projection facet coverage is incomplete or foreign");
  }
  if (plan.facets.includes("member-declarations")) {
    const members = facts["member-declarations"];
    if (members === undefined || members.length !== plan.properties.length || members.some(({ name }, index) => name !== plan.properties[index])) {
      throw new Error("native type member declaration coverage is incomplete or foreign");
    }
  }
  if (plan.facets.includes("properties")) {
    const properties = facts.properties;
    if (properties === undefined || properties.length !== plan.properties.length || properties.some(({ name }, index) => name !== plan.properties[index])) {
      throw new Error("native type projection property coverage is incomplete or foreign");
    }
  }
}

export type NativeTypeSelectionBase<Anchor> =
  | { readonly kind: "node" | "contextual" | "return"; readonly node: Anchor }
  | { readonly kind: "resolved-parameter" | "call-parameter"; readonly node: Anchor; readonly index: number }
  | { readonly kind: "schema-column"; readonly column: string };
export type NativeTypeSelectionStep<Anchor> =
  | { readonly kind: "nonnullable" | "array-element-or-self" | "array-element" | "string-index" | "number-index" }
  | { readonly kind: "type-argument" | "call-return" | "tuple-member" | "union-part" | "intersection-part"; readonly index: number }
  | { readonly kind: "property"; readonly name: string; readonly at: Anchor }
  | { readonly kind: "signature-parameter"; readonly signature: number; readonly index: number; readonly at: Anchor };
export interface NativeTypeSelector<Anchor = Node> {
  readonly base: NativeTypeSelectionBase<Anchor>;
  readonly steps: readonly NativeTypeSelectionStep<Anchor>[];
  readonly displayAt: Anchor | null;
}
export interface NativeTypeSelectionPlan<Anchor = Node> {
  readonly selectors: readonly NativeTypeSelector<Anchor>[];
  readonly relations: readonly { readonly left: number; readonly right: number }[];
}

export const nativePrimitiveFlagsSchema = z.strictObject({
  string: z.boolean(),
  stringLiteral: z.boolean(),
  number: z.boolean(),
  numberLiteral: z.boolean(),
  boolean: z.boolean(),
  booleanLiteral: z.boolean(),
  null: z.boolean(),
  undefined: z.boolean(),
});
export type NativePrimitiveFlags = z.infer<typeof nativePrimitiveFlagsSchema>;
export const nativeSelectedTypeSchema = z.strictObject({
  any: z.boolean(),
  unknown: z.boolean(),
  identity: z.number().int().nonnegative(),
  display: z.string().nullable(),
  parts: z
    .array(
      z.strictObject({
        identity: z.number().int().nonnegative().nullable(),
        aliasName: z.string().nullable(),
        aliasArguments: z.array(z.number().int().nonnegative().nullable()),
      }),
    )
    .min(1),
  vocabulary: nativeTypeVocabularySchema,
  arms: z.array(z.strictObject({ flags: nativePrimitiveFlagsSchema, arrayElement: nativePrimitiveFlagsSchema.nullable() })).min(1),
});
export type NativeSelectedType = z.infer<typeof nativeSelectedTypeSchema>;
export const nativeScalarSelectedTypeSchema = nativeSelectedTypeSchema.pick({ any: true, unknown: true, identity: true, display: true });
export type NativeScalarSelectedType = z.infer<typeof nativeScalarSelectedTypeSchema>;
export type NativeSelectedTypeRelation =
  | { readonly kind: "absent" }
  | { readonly kind: "unavailable"; readonly reason: "primitive-absent" }
  | { readonly kind: "answer"; readonly value: import("./assignability-contract.ts").TypeRelation };
export interface NativeScalarTypeSelections<Anchor = Node> {
  readonly plan: NativeTypeSelectionPlan<Anchor>;
  readonly values: readonly (NativeScalarSelectedType | null)[];
  readonly relations: readonly NativeSelectedTypeRelation[];
}
export interface NativeTypeSelections<Anchor = Node> extends NativeScalarTypeSelections<Anchor> {
  readonly plan: NativeTypeSelectionPlan<Anchor>;
  readonly values: readonly (NativeSelectedType | null)[];
  readonly relations: readonly NativeSelectedTypeRelation[];
}

/** Missing selectors and relations cannot become negative native answers. */
export function assertTypeSelectionCoverage<Anchor>(facts: NativeTypeSelections<Anchor>): void {
  assertScalarTypeSelectionCoverage(facts);
  assertSelectedTypeIdentities(facts.values);
}

/** Scalar-only requests deliberately omit vocabulary and intersection/union projection. */
export function assertScalarTypeSelectionCoverage<Anchor>(facts: NativeScalarTypeSelections<Anchor>): void {
  const { plan, values, relations } = facts;
  if (plan.selectors.length === 0 || values.length !== plan.selectors.length || relations.length !== plan.relations.length) {
    throw new Error("native Type selection coverage is incomplete");
  }
  for (const [index, value] of values.entries()) {
    if (value !== null && (value.display === null) !== (plan.selectors[index]?.displayAt === null)) {
      throw new Error("native Type display coverage is incomplete or foreign");
    }
  }
  for (const [index, value] of values.entries()) {
    if (value !== null) {
      const representative = values[value.identity];
      if (value.identity > index || representative === undefined || representative === null || representative.identity !== value.identity) {
        throw new Error("native Type selection identity is foreign");
      }
    }
  }
  assertSelectedTypeRelations(plan, values, relations);
}

function assertSelectedTypeIdentities(values: NativeTypeSelections["values"]): void {
  for (const [index, value] of values.entries()) {
    if (value === null) {
      continue;
    }
    const representative = values[value.identity];
    if (
      value.identity > index ||
      representative === undefined ||
      representative === null ||
      representative.identity !== value.identity ||
      value.parts[0]?.identity !== value.identity
    ) {
      throw new Error("native Type selection identity is foreign");
    }
    for (const identity of value.parts.flatMap((part) => [part.identity, ...part.aliasArguments])) {
      if (identity !== null && (values[identity] === null || values[identity] === undefined || values[identity].identity !== identity)) {
        throw new Error("native Type selection related identity is foreign");
      }
    }
  }
}

function assertSelectedTypeRelations<Anchor>(
  plan: NativeTypeSelectionPlan<Anchor>,
  values: NativeScalarTypeSelections["values"],
  relations: NativeScalarTypeSelections["relations"],
): void {
  const pairs = new Set<string>();
  for (const [index, pair] of plan.relations.entries()) {
    const key = `${pair.left}:${pair.right}`;
    if (
      !(Number.isSafeInteger(pair.left) && Number.isSafeInteger(pair.right)) ||
      pair.left < 0 ||
      pair.right < 0 ||
      pair.left >= values.length ||
      pair.right >= values.length ||
      pairs.has(key)
    ) {
      throw new Error("native Type relation demand is foreign or ambiguous");
    }
    pairs.add(key);
    const absent = values[pair.left] === null || values[pair.right] === null;
    if ((relations[index]?.kind === "absent") !== absent) {
      throw new Error("native Type relation absence disagrees with its selectors");
    }
  }
}

/** Semantic absence stays distinct from an unavailable native comparison. */
export function selectedTypeRelation(facts: NativeScalarTypeSelections, index: number): import("./assignability-contract.ts").TypeRelation | undefined {
  const relation = facts.relations[index];
  if (facts.plan.relations[index] === undefined || relation === undefined) {
    throw new Error("native Type relation was not captured");
  }
  if (relation.kind === "unavailable") {
    throw new Error(`native Type relation is unavailable: ${relation.reason}`);
  }
  return relation.kind === "absent" ? undefined : relation.value;
}

/** Select only preclosed questions; a missing selector/relation is unavailable evidence, never false. */
export function typeSelectionIndex<Anchor>(facts: NativeTypeSelections<Anchor>, selector: NativeTypeSelector<Anchor>): number {
  const equalBase = (left: NativeTypeSelectionBase<Anchor>, right: NativeTypeSelectionBase<Anchor>): boolean =>
    left.kind === "schema-column"
      ? right.kind === "schema-column" && left.column === right.column
      : right.kind !== "schema-column" &&
        left.kind === right.kind &&
        left.node === right.node &&
        (!("index" in left) || ("index" in right && left.index === right.index));
  const index = facts.plan.selectors.findIndex(
    (candidate) =>
      equalBase(candidate.base, selector.base) &&
      candidate.displayAt === selector.displayAt &&
      candidate.steps.length === selector.steps.length &&
      candidate.steps.every((step, at) => {
        const other = selector.steps[at];
        if (step.kind === "property") {
          return other?.kind === "property" && step.name === other.name && step.at === other.at;
        }
        if (step.kind === "signature-parameter") {
          return other?.kind === "signature-parameter" && step.signature === other.signature && step.index === other.index && step.at === other.at;
        }
        return other?.kind === step.kind && (!("index" in step) || ("index" in other && step.index === other.index));
      }),
  );
  if (index < 0) {
    throw new Error("native Type selector was not captured in this ordinary cohort");
  }
  return index;
}

/** One capture-owned metadata index preserves the first identical nomination, without retaining compiler answers. */
export function typeSelectorIndex<Anchor>(plan: NativeTypeSelectionPlan<Anchor>): (selector: NativeTypeSelector<Anchor>) => number {
  const anchors = new Map<Anchor, number>();
  const anchorId = (anchor: Anchor): number => {
    let id = anchors.get(anchor);
    if (id === undefined) {
      id = anchors.size;
      anchors.set(anchor, id);
    }
    return id;
  };
  const key = (selector: NativeTypeSelector<Anchor>): string =>
    JSON.stringify({
      base: selector.base.kind === "schema-column" ? selector.base : { ...selector.base, node: anchorId(selector.base.node) },
      steps: selector.steps.map((step) => (step.kind === "property" || step.kind === "signature-parameter" ? { ...step, at: anchorId(step.at) } : step)),
      displayAt: selector.displayAt === null ? null : anchorId(selector.displayAt),
    });
  const indices = new Map<string, number>();
  for (const [index, selector] of plan.selectors.entries()) {
    const value = key(selector);
    if (!indices.has(value)) {
      indices.set(value, index);
    }
  }
  return (selector) => {
    const index = indices.get(key(selector));
    if (index === undefined) {
      throw new Error("native Type selector was not captured in this ordinary cohort");
    }
    return index;
  };
}

/** A subset remaps local identity representatives without equating mutually assignable native Types. */
export function selectTypeSelections<Anchor>(facts: NativeTypeSelections<Anchor>, plan: NativeTypeSelectionPlan<Anchor>): NativeTypeSelections<Anchor> {
  const indices = plan.selectors.map((selector) => typeSelectionIndex(facts, selector));
  const identities = new Map<number, number>();
  for (const [index, master] of indices.entries()) {
    const value = facts.values[master];
    if (value !== null && value !== undefined && !identities.has(value.identity)) {
      identities.set(value.identity, index);
    }
  }
  const values = indices.map((master) => {
    const value = facts.values[master];
    if (value === undefined) {
      throw new Error("native Type selector answer is missing");
    }
    if (value === null) {
      return null;
    }
    const identity = identities.get(value.identity);
    if (identity === undefined) {
      throw new Error("native Type selector identity is missing");
    }
    return {
      ...value,
      identity,
      parts: value.parts.map((part) => ({
        ...part,
        identity: part.identity === null ? null : (identities.get(part.identity) ?? null),
        aliasArguments: part.aliasArguments.map((argument) => (argument === null ? null : (identities.get(argument) ?? null))),
      })),
    };
  });
  const relations = plan.relations.map((pair) => {
    const left = indices[pair.left];
    const right = indices[pair.right];
    const index = facts.plan.relations.findIndex((candidate) => candidate.left === left && candidate.right === right);
    const value = facts.relations[index];
    if (index < 0 || value === undefined) {
      throw new Error("native Type relation was not captured in this ordinary cohort");
    }
    return value;
  });
  const result = { plan, values, relations };
  assertTypeSelectionCoverage(result);
  return result;
}

/** One exact node slot, with no native interpretation at nomination time. */
export function nodeTypeSelector(node: Node, kind: "node" | "contextual" | "return" = "node"): NativeTypeSelector {
  return { base: { kind, node }, steps: [], displayAt: null };
}
export function typeArgumentSelector(selector: NativeTypeSelector, index = 0): NativeTypeSelector {
  return { ...selector, steps: [...selector.steps, { kind: "type-argument", index }] };
}
