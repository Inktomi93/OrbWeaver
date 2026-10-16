// Native generic dependence retains the first declaration witness in the canonical traversal order.
import type { Node as MorphNode, Type } from "ts-morph";
import { Node } from "ts-morph";

/** Follow actual type arguments, union/intersection/index slots and named properties, never annotation spelling. */
export function firstOwnedTypeParameter(type: Type, owner: MorphNode, at: MorphNode): MorphNode | undefined {
  const seen = new Set<object>();
  const visit = (current: Type): MorphNode | undefined => {
    if (seen.has(current.compilerType)) {
      return;
    }
    seen.add(current.compilerType);
    const parameter = current
      .getSymbol()
      ?.getDeclarations()
      .find((declaration) => Node.isTypeParameterDeclaration(declaration) && declaration.getAncestors().includes(owner));
    if (parameter !== undefined) {
      return parameter;
    }
    const children = [
      ...current.getTypeArguments(),
      ...current.getAliasTypeArguments(),
      ...current.getUnionTypes(),
      ...current.getIntersectionTypes(),
      ...[current.getStringIndexType(), current.getNumberIndexType()].filter((child): child is Type => child !== undefined),
    ];
    for (const child of children) {
      const found = visit(child);
      if (found !== undefined) {
        return found;
      }
    }
    for (const property of current.getProperties()) {
      const found = visit(property.getTypeAtLocation(at));
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  };
  return visit(type);
}
