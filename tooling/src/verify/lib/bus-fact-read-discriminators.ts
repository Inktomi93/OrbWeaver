// Type-level discriminator reader for bus-fact, extracted from bus-fact-read.ts.
import type { Node as MorphNode, Type } from "ts-morph";

export function typeDiscriminators(type: Type, at: MorphNode): ReadonlySet<string> {
  const property = type.getProperty("type");
  if (property === undefined) {
    return new Set();
  }
  const propertyType = property.getTypeAtLocation(at);
  return new Set(
    (propertyType.isUnion() ? propertyType.getUnionTypes() : [propertyType]).flatMap((part) => {
      const value = part.getLiteralValue();
      return typeof value === "string" ? [value] : [];
    }),
  );
}
