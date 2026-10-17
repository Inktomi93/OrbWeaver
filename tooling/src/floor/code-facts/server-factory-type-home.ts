// Factory signature ownership stays within the declaring source; function bodies grant no type home.
import type { InterfaceDeclaration, TypeAliasDeclaration } from "ts-morph";
import { createWrappedNode, ts } from "ts-morph";
import { isPlainDataShape, WIRE_SHAPE_SUFFIXES } from "./shape-declaration.ts";
import { parserGenericReferenceContributes } from "./shape-derivation.ts";

import { SERVER_FACTORY_TYPE_HOME_ROOTS } from "./type-home.ts";
import type { NativeParserTypeContext } from "./type-member-origin-contract.ts";

interface SourceFactoryDeclarations {
  readonly checker: ts.TypeChecker;
  readonly contribution: typeof parserGenericReferenceContributes;
  readonly declarations: ReadonlySet<ts.Declaration>;
}

const sourceDeclarations = new WeakMap<ts.Program, WeakMap<ts.SourceFile, SourceFactoryDeclarations>>();

function sourceFactoryDeclarations(parser: NativeParserTypeContext): ReadonlySet<ts.Declaration> {
  const sources = sourceDeclarations.get(parser.program) ?? new WeakMap<ts.SourceFile, SourceFactoryDeclarations>();
  const previous = sources.get(parser.source);
  const contribution = parserGenericReferenceContributes;
  if (previous?.checker === parser.checker && previous.contribution === contribution) {
    return previous.declarations;
  }
  const declarations = serverFactoryTypeDeclarations(parser.source, parser.checker, (name) => ts.isIdentifier(name) && contribution(name, parser));
  sources.set(parser.source, { checker: parser.checker, contribution, declarations });
  sourceDeclarations.set(parser.program, sources);
  return declarations;
}

/** D324 applies to local factory signatures, never to an unrelated shape or plain wire data. */
export function serverFactoryTypeHome(node: InterfaceDeclaration | TypeAliasDeclaration, path: string, parser: NativeParserTypeContext): boolean {
  if (!SERVER_FACTORY_TYPE_HOME_ROOTS.some((root) => path.startsWith(root))) {
    return false;
  }
  const raw = node.compilerNode;
  if (
    parser.source !== raw.getSourceFile() ||
    parser.checker !== parser.program.getTypeChecker() ||
    parser.program.getSourceFile(parser.source.fileName) !== parser.source
  ) {
    throw new Error("factory placement parser source/checker is foreign or stale");
  }
  const observed = createWrappedNode(raw, { typeChecker: parser.checker, sourceFile: parser.source });
  return (
    !(WIRE_SHAPE_SUFFIXES.some((suffix) => observed.getName().endsWith(suffix)) && isPlainDataShape(observed)) && sourceFactoryDeclarations(parser).has(raw)
  );
}

function signatureReferences(node: ts.Node, checker: ts.TypeChecker, references: (type: ts.Node) => void, returned: (type: ts.Type) => void): void {
  if (
    !(
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node)
    ) ||
    node.body === undefined
  ) {
    return;
  }
  for (const parameter of node.parameters) {
    if (parameter.type !== undefined) {
      references(parameter.type);
    }
  }
  if (node.type !== undefined) {
    references(node.type);
  }
  const signature = checker.getSignatureFromDeclaration(node);
  if (signature !== undefined) {
    returned(checker.getReturnTypeOfSignature(signature));
  }
}

function referenceBinding(name: ts.Node): ts.Node {
  if (ts.isQualifiedName(name)) {
    return name.right;
  }
  return ts.isPropertyAccessExpression(name) ? name.name : name;
}

// Supporting declarations follow native binding contribution, not generic argument spelling.
function serverFactoryTypeDeclarations(source: ts.SourceFile, checker: ts.TypeChecker, contributes: (name: ts.Node) => boolean): ReadonlySet<ts.Declaration> {
  const owned = new Set<ts.Declaration>();
  const pending: ts.Declaration[] = [];
  const returns = new Set<ts.Type>();
  const admit = (symbol: ts.Symbol | undefined): void => {
    // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
    const resolved = symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
    for (const declaration of resolved?.declarations ?? []) {
      if (
        declaration.getSourceFile() === source &&
        (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) &&
        !owned.has(declaration)
      ) {
        owned.add(declaration);
        pending.push(declaration);
      }
    }
  };
  const references = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
      const name = ts.isTypeReferenceNode(node) ? node.typeName : node.expression;
      if (!contributes(referenceBinding(name))) {
        return;
      }
      admit(checker.getSymbolAtLocation(name));
    }
    ts.forEachChild(node, references);
  };
  const returned = (type: ts.Type): void => {
    if (returns.has(type)) {
      return;
    }
    returns.add(type);
    const awaited = checker.getAwaitedType(type);
    if (awaited !== undefined && awaited !== type) {
      returned(awaited);
    }
    admit(type.aliasSymbol ?? type.getSymbol());
    if (type.isUnionOrIntersection()) {
      for (const member of type.types) {
        returned(member);
      }
    }
  };
  const functions = (node: ts.Node): void => {
    signatureReferences(node, checker, references, returned);
    ts.forEachChild(node, functions);
  };
  functions(source);
  for (const declaration of pending) {
    references(declaration);
  }
  return owned;
}
