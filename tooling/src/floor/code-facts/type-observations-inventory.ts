// A closed raw-question profile persists through the existing invocation atoms, without compiler objects.
import { z } from "zod";
import { scalarTypeSelectionsSchema } from "./projection-inventory-contract.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import type { NativeTypeObservation, TypeObservationDemand, TypeObservationValues } from "./type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE, TYPE_OBSERVATION_QUESTION_KINDS, TYPE_OBSERVATION_VALUE_FACETS } from "./type-observations-contract.ts";
import { assertTypeObservationCoverage } from "./type-observations-coverage.ts";
import { nativePrimitiveFlagsSchema } from "./type-projection-contract.ts";

export type InventoryTypeObservations = TypeObservationValues<InventorySpan>;
const index = z.number().int().nonnegative();
export function typeObservationDemandSchema<Anchor>(span: z.ZodType<Anchor>): z.ZodType<TypeObservationDemand<Anchor>> {
  return z.strictObject({
    profile: z.literal(TYPE_OBSERVATION_PROFILE),
    sources: z.array(span),
    nodes: z.array(span),
    questions: z
      .array(
        z.strictObject({
          kind: z.enum(TYPE_OBSERVATION_QUESTION_KINDS),
          nodes: z.array(span),
          files: z.array(z.string()).optional(),
          relationTargets: z.array(z.strictObject({ file: z.string(), start: index, end: index, kind: index })).optional(),
          callableHomes: z.array(z.strictObject({ name: z.string(), suffix: z.string() })).optional(),
          properties: z.array(z.string()).optional(),
          receiverMethods: z.array(z.string()).optional(),
          selectedPropertyGraph: z
            .strictObject({
              exportName: z.string().min(1).optional(),
              rootPath: z.array(z.string().min(1)),
              stopPath: z.array(z.string().min(1)).min(1),
              leafPaths: z.array(z.array(z.string().min(1)).min(1)),
            })
            .optional(),
          valueFacets: z.array(z.enum(TYPE_OBSERVATION_VALUE_FACETS)).optional(),
        }),
      )
      .optional(),
  });
}
function observation<Value>(value: z.ZodType<Value>): z.ZodType<NativeTypeObservation<Value>> {
  return z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("unrequested") }),
    z.strictObject({ kind: z.literal("absent") }),
    z.strictObject({ kind: z.literal("value"), value }),
  ]);
}
export function typeObservationsSchema(span: z.ZodType<InventorySpan>): z.ZodType<InventoryTypeObservations> {
  const symbol = z.strictObject({ name: z.string(), declarations: z.array(span), canonical: index, valueDeclaration: span.nullable().optional() });
  const type = z.strictObject({
    symbol: index.nullable(),
    aliasSymbol: index.nullable(),
    never: z.boolean(),
    typeParameter: z.boolean(),
    intersectionCount: index.optional(),
    unionCount: index,
    tupleCount: index,
    primitiveFlags: nativePrimitiveFlagsSchema.optional(),
    categoryFlags: z.strictObject({ object: z.boolean(), void: z.boolean() }).optional(),
    stringLiteral: z.string().nullable().optional(),
    defaultDisplay: z.string().optional(),
    literalValue: observation(z.union([z.string(), z.number(), z.boolean(), z.strictObject({ negative: z.boolean(), base10Value: z.string() })])).optional(),
    typeArguments: z.array(index).optional(),
    typeArgumentCount: index.optional(),
  });
  return z
    .strictObject({
      anchor: span,
      demand: typeObservationDemandSchema(span),
      symbols: z.array(symbol),
      nodes: z.array(z.strictObject({ node: span, symbol: index.nullable(), type: index, contextual: observation(index) })),
      constInitializers: z.array(z.strictObject({ node: span, values: z.array(span) })).optional(),
      types: z.array(type.nullable()),
      properties: z.array(
        z.strictObject({
          selector: index,
          at: span,
          propertyCount: index.optional(),
          values: z.array(z.strictObject({ name: z.string(), symbol: index, type: index })),
        }),
      ),
      unions: z.array(z.strictObject({ selector: index, values: z.array(index) })),
      intersections: z.array(z.strictObject({ selector: index, values: z.array(index) })).optional(),
      constraints: z.array(z.strictObject({ selector: index, value: index.nullable() })).optional(),
      signatureDeclarations: z
        .array(z.strictObject({ selector: index, kind: z.enum(["call", "construct"]), declarationCount: index, declarations: z.array(span) }))
        .optional(),
      callReturns: z.array(z.strictObject({ node: span, values: z.array(index) })),
      computedNames: z.array(z.strictObject({ selector: index, values: z.array(z.strictObject({ declaration: span, names: z.array(span) })) })),
      signatures: z.array(z.strictObject({ call: span, fact: observation(z.strictObject({ declaration: span, parameters: z.array(index) })) })),
      propertySymbols: z.array(z.strictObject({ selector: index, name: z.string(), symbol: index.nullable() })).optional(),
      exportDeclarations: z.array(z.strictObject({ source: span, name: z.string(), declarations: z.array(span).nullable() })).optional(),
      callableBodies: z.array(z.strictObject({ node: span, body: span.nullable() })).optional(),
      definitions: z.array(z.strictObject({ node: span, values: z.array(span) })).optional(),
      functionExports: z.array(z.strictObject({ node: span, value: z.boolean() })).optional(),
      callParameters: z.array(z.strictObject({ call: span, parameterCount: index.nullable(), values: z.array(index).nullable() })).optional(),
      signatureParameters: z.array(z.strictObject({ selector: index, at: span, parameterCounts: z.array(index), values: z.array(z.array(index)) })).optional(),
      valueProfiles: z.array(z.strictObject({ node: span, facets: z.array(z.enum(TYPE_OBSERVATION_VALUE_FACETS)) })).optional(),
      dependencies: z.array(z.strictObject({ type: index, owner: span, at: span, witness: span.nullable() })),
      localTargets: z.array(z.strictObject({ node: span, symbol: index.nullable() })),
      exports: z.array(z.strictObject({ source: span, symbols: z.array(index), default: index.nullable(), localTargets: z.array(index) })),
      selections: scalarTypeSelectionsSchema(span).nullable(),
    })
    .superRefine((facts, ctx) => {
      try {
        assertTypeObservationCoverage(
          facts,
          (node) => JSON.stringify(node),
          (node) => node.kind,
        );
      } catch (error) {
        ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
      }
    });
}
