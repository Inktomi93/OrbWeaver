// A closed raw-question profile persists through the existing invocation atoms, without compiler objects.
import { z } from "zod";
import { scalarTypeSelectionsSchema } from "./projection-inventory-contract.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import type { NativeTypeObservation, TypeObservationDemand, TypeObservationValues } from "./type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "./type-observations-contract.ts";
import { assertTypeObservationCoverage } from "./type-observations-coverage.ts";

export type InventoryTypeObservations = TypeObservationValues<InventorySpan>;
const index = z.number().int().nonnegative();
export function typeObservationDemandSchema<Anchor>(span: z.ZodType<Anchor>): z.ZodType<TypeObservationDemand<Anchor>> {
  return z.strictObject({ profile: z.literal(TYPE_OBSERVATION_PROFILE), sources: z.array(span), nodes: z.array(span) });
}
function observation<Value>(value: z.ZodType<Value>): z.ZodType<NativeTypeObservation<Value>> {
  return z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("unrequested") }),
    z.strictObject({ kind: z.literal("absent") }),
    z.strictObject({ kind: z.literal("value"), value }),
  ]);
}
export function typeObservationsSchema(span: z.ZodType<InventorySpan>): z.ZodType<InventoryTypeObservations> {
  const symbol = z.strictObject({ name: z.string(), declarations: z.array(span), canonical: index });
  const type = z.strictObject({
    symbol: index.nullable(),
    aliasSymbol: index.nullable(),
    never: z.boolean(),
    typeParameter: z.boolean(),
    unionCount: index,
    tupleCount: index,
  });
  return z
    .strictObject({
      anchor: span,
      demand: typeObservationDemandSchema(span),
      symbols: z.array(symbol),
      nodes: z.array(z.strictObject({ node: span, symbol: index.nullable(), type: index, contextual: observation(index) })),
      types: z.array(type.nullable()),
      properties: z.array(z.strictObject({ selector: index, at: span, values: z.array(z.strictObject({ name: z.string(), symbol: index, type: index })) })),
      unions: z.array(z.strictObject({ selector: index, values: z.array(index) })),
      callReturns: z.array(z.strictObject({ node: span, values: z.array(index) })),
      computedNames: z.array(z.strictObject({ selector: index, values: z.array(z.strictObject({ declaration: span, names: z.array(span) })) })),
      signatures: z.array(z.strictObject({ call: span, fact: observation(z.strictObject({ declaration: span, parameters: z.array(index) })) })),
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
