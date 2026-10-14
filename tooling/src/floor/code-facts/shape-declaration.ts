// Declaration and data-shape recognition over delivered nodes; population and reporting belong to consumers.
import type { InterfaceDeclaration, Node as MorphNode, SourceFile, Type, TypeAliasDeclaration, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { inventoryDeclarationKey, inventoryExports } from "./semantic-inventory-reader.ts";
import { isFactoryCallFromPackage, ZOD_PACKAGE } from "./zod-origin.ts";

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
  return isFactoryCallFromPackage(initializer, ZOD_SHAPE_FACTORIES, ZOD_PACKAGE);
}

function isLocallyExported(node: MorphNode): boolean {
  const key = inventoryDeclarationKey(node);
  return [...inventoryExports(node.getSourceFile()).values()].some((declarations) =>
    declarations.some((declaration) => inventoryDeclarationKey(declaration) === key),
  );
}

/** The name nodes one delivered declaration owes a finding on: an exported interface's or alias's own name,
 *  and the name of every exported const in a statement whose initializer is a proven zod shape factory. */
export function inlineShapeNames(node: MorphNode): readonly MorphNode[] {
  if (Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) {
    return node.hasExportKeyword() || isLocallyExported(node) ? [node.getNameNode()] : [];
  }
  if (Node.isVariableStatement(node)) {
    return node
      .getDeclarations()
      .filter((declaration) => {
        const initializer = declaration.getInitializer();
        return (node.hasExportKeyword() || isLocallyExported(declaration)) && initializer !== undefined && isZodShapeCall(initializer);
      })
      .map((declaration) => declaration.getNameNode());
  }
  return [];
}

/** Local exported type origins, once each under their first public name; foreign reexports are not local declarations. */
export function exportedShapeDeclarations(sf: SourceFile): readonly (readonly [string, InterfaceDeclaration | TypeAliasDeclaration])[] {
  const seen = new Set<string>();
  const home = inventoryDeclarationKey(sf);
  return [...inventoryExports(sf)].flatMap(([name, declarations]) =>
    declarations.flatMap((declaration) => {
      if (!(Node.isInterfaceDeclaration(declaration) || Node.isTypeAliasDeclaration(declaration))) {
        return [];
      }
      const key = inventoryDeclarationKey(declaration);
      if (inventoryDeclarationKey(declaration.getSourceFile()) !== home || seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [[name, declaration] as const];
    }),
  );
}

/** An authored interface without heritage, or an alias with an object-literal body, rather than a derive. */
export function isHandWrittenShape(node: InterfaceDeclaration | TypeAliasDeclaration): boolean {
  return Node.isInterfaceDeclaration(node) ? node.getHeritageClauses().length === 0 : node.getTypeNode()?.getKind() === SyntaxKind.TypeLiteral;
}

/** Exported interfaces and object-literal aliases. Heritage remains admitted for name-collision policy. */
export function handWrittenShapeDeclarations(sf: SourceFile): readonly (InterfaceDeclaration | TypeAliasDeclaration)[] {
  return [
    ...sf.getInterfaces().filter(isLocallyExported),
    ...sf.getTypeAliases().filter((declaration) => isLocallyExported(declaration) && declaration.getTypeNode()?.getKind() === SyntaxKind.TypeLiteral),
  ];
}

/** References to the supplied local type identifiers, not substrings of lookalike identifiers. */
export function referencesTypeIdentifiers(type: TypeNode, names: ReadonlySet<string>): boolean {
  return (Node.isIdentifier(type) && names.has(type.getText())) || type.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => names.has(id.getText()));
}
