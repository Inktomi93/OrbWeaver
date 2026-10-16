// Type-level discriminator reader for bus-fact, extracted from bus-fact-read.ts.
import type { Node as MorphNode } from "ts-morph";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type { BusReadContext } from "../contract/bus-fact.ts";

export function typeDiscriminators(context: BusReadContext, type: NativeTypeSelector, at: MorphNode, readers = context.types(at)): ReadonlySet<string> {
  const property = { ...type, steps: [...type.steps, { kind: "property" as const, name: "type", at }] };
  const selected = readers.select(property);
  if (selected === null) {
    return new Set();
  }
  const propertyType = readers.unions(property);
  return new Set(
    (propertyType.length > 0 ? propertyType : [property]).flatMap((part) => {
      const value = readers.literal(part);
      return typeof value === "string" ? [value] : [];
    }),
  );
}
