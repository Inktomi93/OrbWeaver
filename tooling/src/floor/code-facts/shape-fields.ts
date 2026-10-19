// Shape field discovery over delivered native nodes; consumers own their admission floors and matching policy.
import type { InterfaceDeclaration, Node as MorphNode, Symbol as TsSymbol, TypeLiteralNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

/** The two existing discovery populations: exact respells and contract-copy candidates. */
export const SHAPE_FIELD_MODES = ["respell", "copy"] as const;
export type ShapeFieldMode = (typeof SHAPE_FIELD_MODES)[number];

const COPY_DISCOVERY: Readonly<Record<ShapeFieldMode, boolean>> = { respell: false, copy: true };

/** Resolved object fields, including inferred and mapped members. Respell excludes intersections and reads
 * classes' own data members; copy admits intersections. Neither mode admits unions, arrays, tuples or callables. */
export function resolvedShapeProperties(decl: MorphNode, mode: ShapeFieldMode): readonly TsSymbol[] | undefined {
  const copy = COPY_DISCOVERY[mode];
  const type = decl.getType();
  if (type.isUnion() || (!copy && type.isIntersection())) {
    return;
  }
  if (!(type.isObject() || (copy && type.isIntersection())) || type.isArray() || type.isTuple() || type.getCallSignatures().length > 0) {
    return;
  }
  const properties =
    !copy && Node.isClassDeclaration(decl)
      ? [
          ...decl.getProperties().filter((property) => !property.isStatic()),
          ...decl
            .getConstructors()
            .flatMap((ctor) => ctor.getParameters())
            .filter((parameter) => parameter.isParameterProperty()),
        ].flatMap((member) => {
          const symbol = member.getSymbol();
          return symbol === undefined ? [] : [symbol];
        })
      : type.getProperties();
  return properties;
}

/** Authored data property signatures; functions are behavior and indexed-access types already derive. */
export function ownDataFieldNames(node: InterfaceDeclaration | TypeLiteralNode): ReadonlySet<string> {
  const fields = new Set<string>();
  for (const member of node.getMembers()) {
    if (!Node.isPropertySignature(member)) {
      continue;
    }
    const typeNode = member.getTypeNode();
    if (typeNode !== undefined && (typeNode.isKind(SyntaxKind.FunctionType) || typeNode.isKind(SyntaxKind.IndexedAccessType))) {
      continue;
    }
    fields.add(member.getName());
  }
  return fields;
}
