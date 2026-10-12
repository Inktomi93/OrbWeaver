// What counts as an EXPORTED SHAPE DECLARATION under Spine-TypeScript-and-Patterns.md §7.4 — the
// `no-inline-types` family's shared subject. The family is split by POPULATION only: `no-inline-types` judges
// exported type aliases and zod shape consts across the implementation roots, `no-inline-domain-interface`
// judges exported interfaces inside server domains. Both ask this one recognizer which name nodes owe a finding,
// so "a declared shape" cannot mean two different things in the two halves of one law.
//
// The zod arm is identity, never spelling: the callee must resolve through the `zod` door
// (`lib/zod-origin.ts#isZodCall`) to one of the three factories whose result IS a declared shape. It is NOT
// fail-closed — an unreadable factory-named call passes (the declared limit `no-inline-types` records).
import type { InterfaceDeclaration, Node as MorphNode, Type } from "ts-morph";
import { Node } from "ts-morph";
import { isZodCall, zodCandidateCall } from "./zod-origin.ts";

/** True when the interface and every type it nests are data: no call or construct signature anywhere. A hook
 *  result, a service bundle or a deps record carries behaviour and cannot cross a wire; a wire shape cannot.
 *  Scalars (anything that is neither an object nor a union or intersection of them) are data. */
export function isPlainDataShape(node: InterfaceDeclaration): boolean {
  const seen = new Set<unknown>();
  const holdsBehaviour = (type: Type): boolean => {
    if (seen.has(type.compilerType)) {
      return false;
    }
    seen.add(type.compilerType);
    const parts = [...type.getUnionTypes(), ...type.getIntersectionTypes()];
    if (parts.length > 0) {
      return parts.some(holdsBehaviour);
    }
    if (!type.isObject()) {
      return false;
    }
    if (type.isArray() || type.isReadonlyArray() || type.isTuple()) {
      return [...type.getTypeArguments(), ...type.getTupleElements()].some(holdsBehaviour);
    }
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
      return true;
    }
    const indexed = [type.getStringIndexType(), type.getNumberIndexType()].filter((member) => member !== undefined);
    return type.getProperties().some((property) => holdsBehaviour(property.getTypeAtLocation(node))) || indexed.some(holdsBehaviour);
  };
  return !holdsBehaviour(node.getType());
}

const ZOD_SHAPE_FACTORIES: ReadonlySet<string> = new Set(["object", "enum", "discriminatedUnion"]);

function isZodShapeCall(initializer: MorphNode): boolean {
  const name = zodCandidateCall(initializer)?.name;
  return name !== undefined && ZOD_SHAPE_FACTORIES.has(name) && isZodCall(initializer, name);
}

/** The name nodes one delivered declaration owes a finding on: an exported interface's or alias's own name,
 *  and the name of every exported const in a statement whose initializer is a proven zod shape factory. */
export function inlineShapeNames(node: MorphNode): readonly MorphNode[] {
  if (Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) {
    return node.hasExportKeyword() ? [node.getNameNode()] : [];
  }
  if (Node.isVariableStatement(node) && node.hasExportKeyword()) {
    return node
      .getDeclarations()
      .filter((declaration) => {
        const initializer = declaration.getInitializer();
        return initializer !== undefined && isZodShapeCall(initializer);
      })
      .map((declaration) => declaration.getNameNode());
  }
  return [];
}
