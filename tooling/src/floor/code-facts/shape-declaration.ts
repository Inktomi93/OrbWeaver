// Declaration and data-shape recognition over delivered nodes; population and reporting belong to consumers.
import type { InterfaceDeclaration, Node as MorphNode, SourceFile, TypeAliasDeclaration, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type nativeTs from "typescript";
import { inventoryDeclarationKey } from "./semantic-inventory-reader.ts";
import { shapeExports } from "./shape-facts.ts";
import type { NativeParserTypeContext, TypeRealmOperations } from "./type-member-origin-contract.ts";
import { morphTypeOperations, parserTypeOperations } from "./type-member-origin-core.ts";
import { isFactoryCallFromPackage, ZOD_PACKAGE } from "./zod-origin.ts";

export const WIRE_SHAPE_SUFFIXES = ["View", "Result", "Summary", "Row", "Input", "Request", "Response", "Wire"] as const;

/** True when the interface and every type it nests are data: no call or construct signature anywhere. A hook
 *  result, a service bundle or a deps record carries behaviour and cannot cross a wire; a wire shape cannot.
 *  Scalars (anything that is neither an object nor a union or intersection of them) are data. */
export function isPlainDataShape(node: InterfaceDeclaration | TypeAliasDeclaration): boolean {
  return plainDataShapeCore(node, morphTypeOperations(node.getProject().getProgram().compilerObject));
}

/** The same data/behaviour predicate over the parser's actual native declarations. */
export function isParserPlainDataShape(node: nativeTs.InterfaceDeclaration | nativeTs.TypeAliasDeclaration, parser: NativeParserTypeContext): boolean {
  return plainDataShapeCore(node, parserTypeOperations(parser));
}

function plainDataShapeCore<N extends object, T, S, G, I extends object>(node: N, ops: TypeRealmOperations<N, T, S, G, I>): boolean {
  const seen = new Set<I>();
  const holdsBehaviour = (type: T): boolean => {
    const identity = ops.typeIdentity(type);
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    const parts = [...ops.unions(type), ...ops.intersections(type)];
    if (parts.length > 0) {
      return parts.some(holdsBehaviour);
    }
    if (!ops.flags(type).object) {
      return false;
    }
    const tuple = ops.tuple(type);
    if (ops.element(type) !== undefined || tuple !== undefined) {
      return [...ops.arguments(type), ...(tuple ?? [])].some(holdsBehaviour);
    }
    if (ops.signatures(type, "call").length > 0 || ops.signatures(type, "construct").length > 0) {
      return true;
    }
    return ops.properties(type).some((property) => holdsBehaviour(ops.symbolType(property, node))) || ops.indexes(type).some(holdsBehaviour);
  };
  return !holdsBehaviour(ops.type(node));
}

const ZOD_SHAPE_FACTORIES: ReadonlySet<string> = new Set(["object", "enum", "discriminatedUnion"]);

/** A call whose callee resolves through the `zod` door to a shape factory; unreadable callees are not shapes. */
export function isZodShapeCall(initializer: MorphNode): boolean {
  return isFactoryCallFromPackage(initializer, ZOD_SHAPE_FACTORIES, ZOD_PACKAGE);
}

function isLocallyExported(node: MorphNode): boolean {
  const key = inventoryDeclarationKey(node);
  return [...shapeExports(node.getSourceFile()).values()].some((declarations) =>
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
  return [...shapeExports(sf)].flatMap(([name, declarations]) =>
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
