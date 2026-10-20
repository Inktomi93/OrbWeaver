// Factory signature ownership stays within the declaring source; function bodies grant no type home.
import ts from "typescript";
import { isParserPlainDataShape, WIRE_SHAPE_SUFFIXES } from "./shape-declaration.ts";
import { parserGenericReferenceContributes } from "./shape-derivation.ts";

import { SIGNATURE_TYPE_HOME_ROOTS } from "./type-home.ts";
import { readParserReturnedTypeIdentities } from "./type-member-origin.ts";
import type { NativeParserTypeContext } from "./type-member-origin-contract.ts";

interface SourceFactoryDeclarations {
  readonly checker: ts.TypeChecker;
  readonly contribution: typeof parserGenericReferenceContributes;
  readonly returnedData: typeof readParserReturnedTypeIdentities;
  readonly declarations: ReadonlySet<ts.Declaration>;
}

const sourceDeclarations = new WeakMap<ts.Program, WeakMap<ts.SourceFile, SourceFactoryDeclarations>>();

function sourceFactoryDeclarations(parser: NativeParserTypeContext): ReadonlySet<ts.Declaration> {
  const sources = sourceDeclarations.get(parser.program) ?? new WeakMap<ts.SourceFile, SourceFactoryDeclarations>();
  const previous = sources.get(parser.source);
  const contribution = parserGenericReferenceContributes;
  const returnedData = readParserReturnedTypeIdentities;
  if (previous?.checker === parser.checker && previous.contribution === contribution && previous.returnedData === returnedData) {
    return previous.declarations;
  }
  const declarations = serverFactoryTypeDeclarations(parser, (name) => ts.isIdentifier(name) && contribution(name, parser));
  sources.set(parser.source, { checker: parser.checker, contribution, returnedData, declarations });
  sourceDeclarations.set(parser.program, sources);
  return declarations;
}

/** D324 and D331 apply to local function signatures, never to an unrelated shape or plain wire data. */
export function signatureTypeHome(node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration, path: string, parser: NativeParserTypeContext): boolean {
  if (!SIGNATURE_TYPE_HOME_ROOTS.some((root) => path.startsWith(root))) {
    return false;
  }
  const raw = node;
  if (
    parser.source !== raw.getSourceFile() ||
    parser.checker !== parser.program.getTypeChecker() ||
    parser.program.getSourceFile(parser.source.fileName) !== parser.source
  ) {
    throw new Error("factory placement parser source/checker is foreign or stale");
  }
  return (
    !(WIRE_SHAPE_SUFFIXES.some((suffix) => raw.name.text.endsWith(suffix)) && isParserPlainDataShape(raw, parser)) && sourceFactoryDeclarations(parser).has(raw)
  );
}

function signatureReferences(
  node: ts.Node,
  checker: ts.TypeChecker,
  references: (type: ts.Node) => void,
  returned: (type: ts.Type, declaration: ts.SignatureDeclaration) => void,
): void {
  if (
    !(
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
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
    returned(checker.getReturnTypeOfSignature(signature), node);
  }
}

function referenceBinding(name: ts.Node): ts.Node {
  if (ts.isQualifiedName(name)) {
    return name.right;
  }
  return ts.isPropertyAccessExpression(name) ? name.name : name;
}

// Supporting declarations follow native binding contribution, not generic argument spelling.
function serverFactoryTypeDeclarations(parser: NativeParserTypeContext, contributes: (name: ts.Node) => boolean): ReadonlySet<ts.Declaration> {
  const { source, checker } = parser;
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
  const returnedRoot = (type: ts.Type): void => {
    if (returns.has(type)) {
      return;
    }
    returns.add(type);
    const awaited = checker.getAwaitedType(type);
    if (awaited !== undefined && awaited !== type) {
      returnedRoot(awaited);
    }
    admit(type.aliasSymbol ?? type.getSymbol());
    if (type.isUnionOrIntersection()) {
      for (const member of type.types) {
        returnedRoot(member);
      }
    }
  };
  const returned = (type: ts.Type, node: ts.SignatureDeclaration): void => {
    if (returns.has(type)) {
      return;
    }
    returnedRoot(type);
    const graph = readParserReturnedTypeIdentities({ node, rootType: type, parser });
    if (graph.kind !== "resolved") {
      return;
    }
    for (const declaration of graph.value.flatMap((origin) => origin.declarations)) {
      if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) {
        admit(checker.getSymbolAtLocation(declaration.name));
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
