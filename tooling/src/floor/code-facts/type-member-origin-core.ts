// Native declaration/identity primitives for type-member readers; graph/containment judgments stay consumers.
import type { ReferenceFact, ReferenceUnresolvedReason, UnresolvedReferenceFact } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { Node as MorphNode, Symbol as MorphSymbol, Signature, Type } from "ts-morph";
import { ts as morphTs, Node, VariableDeclarationKind } from "ts-morph";
import ts from "typescript";
import type { NativeParserTypeContext, TypeIdentityOrigin, TypeRealmOperations } from "./type-member-origin-contract.ts";
import type { TypeObservationReader } from "./type-observations-contract.ts";
import { nodeTypeSelector } from "./type-projection-contract.ts";

function unwrapReceiverExpression(raw: MorphNode): MorphNode {
  let node = raw;
  while (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isSatisfiesExpression(node) || Node.isNonNullExpression(node)) {
    node = node.getExpression();
  }
  return node;
}

export const MAX_RECEIVER_HOPS = 4;

interface ReceiverOperations<T> {
  readonly unwrap: (node: T) => T;
  readonly isIdentifier: (node: T) => boolean;
  readonly initializers: (node: T) => readonly T[];
  readonly observe?: (node: T) => void;
}

function uncastReceiverCore<T>(node: T, operations: ReceiverOperations<T>): T {
  let current = operations.unwrap(node);
  operations.observe?.(current);
  for (let hop = 0; hop < MAX_RECEIVER_HOPS && operations.isIdentifier(current); hop += 1) {
    const initializer = operations.initializers(current)[0];
    if (initializer === undefined) {
      break;
    }
    current = operations.unwrap(initializer);
    operations.observe?.(current);
  }
  return current;
}

/** Follow only raw lexical const initializers, retaining call terminals after unwrapping. */
export function uncastReceiver(
  node: MorphNode,
  declarations: (identifier: MorphNode) => readonly MorphNode[] = (identifier) => identifier.getSymbol()?.getDeclarations() ?? [],
  observe?: (value: MorphNode) => void,
): MorphNode {
  return uncastReceiverCore(node, {
    unwrap: unwrapReceiverExpression,
    isIdentifier: Node.isIdentifier,
    initializers: (identifier) =>
      declarations(identifier).flatMap((declaration) => {
        const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
        return initializer !== undefined &&
          Node.isVariableDeclaration(declaration) &&
          declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const
          ? [initializer]
          : [];
      }),
    ...(observe === undefined ? {} : { observe }),
  });
}

/** ESLint's existing owning Program uses the same four-hop lexical algorithm as captured morph consumers. */
export function nativeUncastReceiver(node: ts.Node, checker: ts.TypeChecker): ts.Node {
  return uncastReceiverCore(node, {
    unwrap: (raw) => {
      let current = raw;
      while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) {
        current = current.expression;
      }
      return current;
    },
    isIdentifier: ts.isIdentifier,
    initializers: (identifier) =>
      (checker.getSymbolAtLocation(identifier)?.declarations ?? []).flatMap((declaration) =>
        ts.isVariableDeclaration(declaration) &&
        ts.isVariableDeclarationList(declaration.parent) &&
        ts.isVariableStatement(declaration.parent.parent) &&
        compilerFlag(declaration.parent.flags, ts.NodeFlags.Const) &&
        declaration.initializer !== undefined
          ? [declaration.initializer]
          : [],
      ),
  });
}

export function resolved<T, Anchor = MorphNode>(value: T, origin: Anchor, declarations: readonly Anchor[]): ReferenceFact<T, Anchor> {
  return { kind: "resolved", value, trace: { declarations: [...declarations], origin } };
}

export function unresolved<Anchor = MorphNode>(reason: ReferenceUnresolvedReason, node: Anchor, detail: string): UnresolvedReferenceFact<Anchor> {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}

export function symbolDeclarations(symbol: MorphSymbol, node: MorphNode, subject: string): ReferenceFact<readonly MorphNode[]> {
  const declarations = symbol.getDeclarations();
  return declarations.length === 0 ? unresolved("missing", node, `${subject} has no declaration`) : resolved(declarations, node, declarations);
}

/** The checker’s terminal instantiated property type and its actual declaration origins. */
export interface NativeTypePropertyValue {
  readonly type: Type;
  readonly declarations: readonly MorphNode[];
}

/** Preserve the declaration-only door over the one native property-path traversal. */
export function resolveTypePropertyOrigin(expression: MorphNode, name: string | readonly string[]): ReferenceFact<readonly MorphNode[]> {
  const fact = resolveTypePropertyValue(expression, name);
  return fact.kind === "resolved" ? { ...fact, value: fact.value.declarations } : fact;
}

/** Captured native property declarations retain the direct reader's nonnullable and no-evidence rules. */
export function observedTypePropertyOrigin(receiver: MorphNode, name: string, readers: TypeObservationReader): ReferenceFact<readonly MorphNode[]> {
  const selector = { ...nodeTypeSelector(receiver), steps: [{ kind: "nonnullable" as const }] };
  const symbol = readers.propertySymbol(selector, name);
  if (symbol === null) {
    return unresolved("missing", receiver, `the checker resolved no property symbol named ${name} on ${receiver.getText()}`);
  }
  const declarations = readers.symbolData(symbol).declarations;
  return declarations.length === 0 ? unresolved("missing", receiver, `property ${name} has no declaration`) : resolved(declarations, receiver, declarations);
}

/** Resolve `<expression>.<name>` WHEN THERE IS NO MEMBER-ACCESS NODE TO HAND OVER — the BINDING-PATTERN twin
 *  of `resolveTypeMemberOrigin`. A destructure (`const { issues } = failure`) asks the same question
 *  the dotted read asks, but its subject is a `BindingElement`: there is no `PropertyAccessExpression` for
 *  the member reader to normalise, only the initializer expression and a name. Supplied paths follow native
 *  instantiated property types and retain every terminal declaration. Without this door a policy
 *  finishes the chain itself (`type.getProperty(name)?.getDeclarations()`) — the #2097 class, and the exact
 *  reason the audit routes those sites to a shared reader: a `lib/` reader that hands back a `Symbol`
 *  invites the gate to answer the declaration question, so the reader answers it.
 *
 *  NON-NULLABLE for the same reason the member reader is: a union carrying `undefined` exposes NO property
 *  symbols at all, and the read only happens where the receiver is present. Unresolved exactly when the
 *  checker resolves no such property, or resolves one with no declaration — both of which are "cannot be
 *  established", never "not this identity".
 *
 *  WHAT FOLDED ONTO IT, AND WHAT DID NOT (the move must END a duplicate, never create one). Folded in the
 *  same commit: `project-home-origin.ts#uncastMemberDeclaredByPackage` and
 *  `bus-fact-read.ts#busChannelPublisher` — both spelled the identical chain and both already treated "no
 *  symbol" and "no declaration" as one no-evidence answer, so each collapses an unresolved fact to `[]` and
 *  is behaviour-identical. NOT folded: `resolveTypeMemberOrigin`, which looks like the same
 *  three lines and is a DIFFERENT predicate — it anchors its refusal on the `nameNode` rather than on the
 *  receiver expression (the coordinate a policy reports), and it needs the property SYMBOL itself for the
 *  `TypeMemberOrigin` it returns, which this reader deliberately does not hand back. Folding it would move
 *  every one of that reader's refusal positions. */
export function resolveTypePropertyValue(expression: MorphNode, name: string | readonly string[]): ReferenceFact<NativeTypePropertyValue> {
  const path = typeof name === "string" ? [name] : name;
  if (path.length === 0) {
    return unresolved("unsupported", expression, "a property path must name at least one member");
  }
  // A source-file namespace has a module symbol rather than an expression type.
  const initialType = Node.isSourceFile(expression) ? expression.getSymbol()?.getTypeAtLocation(expression) : expression.getType();
  if (initialType === undefined) {
    return unresolved("missing", expression, "the checker resolved no module symbol for the property path");
  }
  let type: Type = initialType;
  let declarations: readonly MorphNode[] = [];
  for (const member of path) {
    const symbol = type.getNonNullableType().getProperty(member);
    if (symbol === undefined) {
      return unresolved("missing", expression, `the checker resolved no property symbol named ${member} on ${expression.getText()}`);
    }
    const origin = symbolDeclarations(symbol, expression, `property ${member}`);
    if (origin.kind === "unresolved") {
      return origin;
    }
    declarations = origin.value;
    type = symbol.getTypeAtLocation(expression);
  }
  return resolved({ type, declarations }, expression, declarations);
}

/** One authored reference's declaration identity. This is provenance only: the value query below must
 *  establish that this reference's resolved type is actually carried by the received value. */
export function annotationReferenceOrigin(node: MorphNode): ReferenceFact<TypeIdentityOrigin> {
  const symbol = node.getSymbol();
  const target = symbol?.getAliasedSymbol() ?? symbol;
  if (target === undefined) {
    return unresolved("missing", node, `the checker resolved no type reference for ${node.getText()}`);
  }
  const declarations = symbolDeclarations(target, node, `type reference ${target.getName()}`);
  return declarations.kind === "unresolved"
    ? declarations
    : resolved(
        { name: target.getName(), node, aliased: declarations.value.some(Node.isTypeAliasDeclaration), declarations: declarations.value },
        node,
        declarations.value,
      );
}

export function unprovenTypeIdentity(origin: TypeIdentityOrigin, reason: ReferenceUnresolvedReason, detail: string): ReferenceFact<TypeIdentityOrigin> {
  return { kind: "unresolved", reason, detail, node: origin.node, trace: { origin: origin.node, declarations: origin.declarations } };
}

export function normalizedPath(node: MorphNode): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}

export type MorphTypeOperations = TypeRealmOperations<MorphNode, Type, MorphSymbol, Signature, morphTs.Type>;
export type ParserTypeOperations = TypeRealmOperations<ts.Node, ts.Type, ts.Symbol, ts.Signature, ts.Type>;

function compilerFlag(flags: number, flag: number): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: Compiler flag enums are native bitfields in both separate realms.
  return (flags & flag) !== 0;
}

function parserTypeReference(type: ts.Type): type is ts.TypeReference {
  return (
    compilerFlag(type.flags, ts.TypeFlags.Object) &&
    "objectFlags" in type &&
    typeof type.objectFlags === "number" &&
    compilerFlag(type.objectFlags, ts.ObjectFlags.Reference)
  );
}

function parserIndexedType(type: ts.Type): type is ts.IndexedAccessType {
  return compilerFlag(type.flags, ts.TypeFlags.IndexedAccess);
}

function morphIndexedType(type: morphTs.Type): type is morphTs.IndexedAccessType {
  return compilerFlag(type.flags, morphTs.TypeFlags.IndexedAccess);
}

/** Bind only raw parser/compiler observations; no ts-morph wrapper accepts values from this realm. */
export function parserTypeOperations(context: NativeParserTypeContext): ParserTypeOperations {
  const { checker, program } = context;
  return {
    nodeIdentity: (node) => node,
    typeIdentity: (type) => type,
    parent: (node) => node.parent,
    children: (node): readonly ts.Node[] => {
      const values: ts.Node[] = [];
      ts.forEachChild(node, (child) => {
        values.push(child);
      });
      return values;
    },
    path: (node) => node.getSourceFile().fileName.replaceAll("\\", "/"),
    text: (node) => node.getText(),
    contains: (node) => program.getSourceFile(node.getSourceFile().fileName) === node.getSourceFile(),
    forgotten: () => false,
    identifier: ts.isIdentifier,
    parameter: ts.isTypeParameterDeclaration,
    variable: ts.isVariableDeclaration,
    generic: (node): ReturnType<ParserTypeOperations["generic"]> => {
      if (ts.isTypeAliasDeclaration(node)) {
        return { kind: "alias", parameters: node.typeParameters ?? [], body: node.type };
      }
      if (ts.isInterfaceDeclaration(node)) {
        return { kind: "interface", parameters: node.typeParameters ?? [], body: undefined };
      }
      if (ts.isClassDeclaration(node)) {
        return { kind: "class", parameters: node.typeParameters ?? [], body: undefined };
      }
      return undefined;
    },
    reference: (node): ReturnType<ParserTypeOperations["reference"]> => {
      if (ts.isTypeReferenceNode(node)) {
        return { name: node.typeName, arguments: node.typeArguments ?? [] };
      }
      if (ts.isExpressionWithTypeArguments(node)) {
        return { name: node.expression, arguments: node.typeArguments ?? [] };
      }
      return undefined;
    },
    mapped: (node) =>
      ts.isMappedTypeNode(node)
        ? {
            parameter: node.typeParameter,
            constraint: node.typeParameter.constraint,
            value: node.type,
            remap: node.nameType,
            optional: node.questionToken?.kind === ts.SyntaxKind.QuestionToken,
            readonly: node.readonlyToken !== undefined,
          }
        : undefined,
    indexedNode: (node) => (ts.isIndexedAccessTypeNode(node) ? { object: node.objectType, index: node.indexType } : undefined),
    operatorType: (node) => (ts.isTypeOperatorNode(node) ? node.type : undefined),
    query: (node) => (ts.isTypeQueryNode(node) ? node.exprName : undefined),
    conditional: (node) => (ts.isConditionalTypeNode(node) ? { check: node.checkType, extends: node.extendsType, selected: node.trueType } : undefined),
    template: (node) =>
      ts.isTemplateLiteralTypeNode(node)
        ? { head: node.head.text, spans: node.templateSpans.map((span) => ({ type: span.type, tail: span.literal.text })) }
        : undefined,
    literalNode: (node) => (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal) ? node.literal.text : undefined),
    type: (node) => checker.getTypeAtLocation(node),
    symbol: (node) => checker.getSymbolAtLocation(node),
    alias: (symbol) => (compilerFlag(symbol.flags, ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol),
    declarations: (symbol) => symbol.declarations ?? [],
    symbolName: (symbol) => symbol.getName(),
    symbolType: (symbol, at) => checker.getTypeOfSymbolAtLocation(symbol, at),
    typeSymbol: (type) => type.getSymbol(),
    aliasSymbol: (type) => type.aliasSymbol,
    flags: (type) => ({
      any: compilerFlag(type.flags, ts.TypeFlags.Any),
      unknown: compilerFlag(type.flags, ts.TypeFlags.Unknown),
      never: compilerFlag(type.flags, ts.TypeFlags.Never),
      parameter: compilerFlag(type.flags, ts.TypeFlags.TypeParameter),
      object: compilerFlag(type.flags, ts.TypeFlags.Object),
    }),
    unions: (type) => (type.isUnion() ? type.types : []),
    intersections: (type) => (type.isIntersection() ? type.types : []),
    tuple: (type) => (checker.isTupleType(type) && parserTypeReference(type) ? checker.getTypeArguments(type) : undefined),
    element: (type) => (checker.isArrayType(type) ? checker.getIndexTypeOfType(type, ts.IndexKind.Number) : undefined),
    indexes: (type) =>
      [checker.getIndexTypeOfType(type, ts.IndexKind.String), checker.getIndexTypeOfType(type, ts.IndexKind.Number)].filter((value) => value !== undefined),
    properties: (type) => checker.getPropertiesOfType(type),
    property: (type, name) => checker.getPropertyOfType(type, name),
    arguments: (type) => (parserTypeReference(type) ? checker.getTypeArguments(type) : []),
    aliasArguments: (type) => type.aliasTypeArguments ?? [],
    nonnullable: (type) => checker.getNonNullableType(type),
    awaited: (type) => checker.getAwaitedType(type),
    signatures: (type, kind) => checker.getSignaturesOfType(type, kind === "call" ? ts.SignatureKind.Call : ts.SignatureKind.Construct),
    signatureDeclaration: (signature) => signature.declaration,
    signatureParameters: (signature) => signature.parameters,
    signatureReturn: (signature) => checker.getReturnTypeOfSignature(signature),
    indexedType: (type) => (parserIndexedType(type) && type.indexType.isStringLiteral() ? { object: type.objectType, key: type.indexType.value } : undefined),
    literalType: (type) => (type.isStringLiteral() ? type.value : undefined),
    assignable: (left, right) => checker.isTypeAssignableTo(left, right),
    defaultLibrary: (node) => program.isSourceFileDefaultLibrary(node.getSourceFile()),
  };
}

/** Morph consumers keep their own compiler, wrappers, Program and declaration identities. */
export function morphTypeOperations(program: morphTs.Program): MorphTypeOperations {
  return {
    nodeIdentity: (node) => node.compilerNode,
    typeIdentity: (type) => type.compilerType,
    parent: (node) => node.getParent(),
    children: (node) => node.getChildren(),
    path: normalizedPath,
    text: (node) => node.getText(),
    contains: (node) => program.getSourceFile(node.getSourceFile().getFilePath()) === node.getSourceFile().compilerNode,
    forgotten: (node) => node.wasForgotten(),
    identifier: Node.isIdentifier,
    parameter: Node.isTypeParameterDeclaration,
    variable: Node.isVariableDeclaration,
    generic: (node): ReturnType<MorphTypeOperations["generic"]> => {
      if (Node.isTypeAliasDeclaration(node)) {
        return { kind: "alias", parameters: node.getTypeParameters(), body: node.getTypeNode() };
      }
      if (Node.isInterfaceDeclaration(node)) {
        return { kind: "interface", parameters: node.getTypeParameters(), body: undefined };
      }
      if (Node.isClassDeclaration(node)) {
        return { kind: "class", parameters: node.getTypeParameters(), body: undefined };
      }
      return undefined;
    },
    reference: (node): ReturnType<MorphTypeOperations["reference"]> => {
      if (Node.isTypeReference(node)) {
        return { name: node.getTypeName(), arguments: node.getTypeArguments() };
      }
      if (Node.isExpressionWithTypeArguments(node)) {
        return { name: node.getExpression(), arguments: node.getTypeArguments() };
      }
      return undefined;
    },
    mapped: (node) =>
      Node.isMappedTypeNode(node)
        ? {
            parameter: node.getTypeParameter(),
            constraint: node.getTypeParameter().getConstraint(),
            value: node.getTypeNode(),
            remap: node.getNameTypeNode(),
            optional: node.getQuestionToken()?.getKind() === morphTs.SyntaxKind.QuestionToken,
            readonly: node.getReadonlyToken() !== undefined,
          }
        : undefined,
    indexedNode: (node) => (Node.isIndexedAccessTypeNode(node) ? { object: node.getObjectTypeNode(), index: node.getIndexTypeNode() } : undefined),
    operatorType: (node) => (Node.isTypeOperatorTypeNode(node) ? node.getTypeNode() : undefined),
    query: (node) => (Node.isTypeQuery(node) ? node.getExprName() : undefined),
    conditional: (node) =>
      Node.isConditionalTypeNode(node) ? { check: node.getCheckType(), extends: node.getExtendsType(), selected: node.getTrueType() } : undefined,
    template: (node): ReturnType<MorphTypeOperations["template"]> => {
      if (!Node.isTemplateLiteralTypeNode(node)) {
        return;
      }
      const spans = node.getTemplateSpans().flatMap((span) => {
        const type = span.getFirstChildByKind(morphTs.SyntaxKind.TypeReference);
        const tail = span.getLastChildIfKind(morphTs.SyntaxKind.TemplateTail);
        return type === undefined || tail === undefined ? [] : [{ type, tail: tail.getLiteralText() }];
      });
      return spans.length === node.getTemplateSpans().length ? { head: node.getHead().getLiteralText(), spans } : undefined;
    },
    literalNode: (node): string | undefined => {
      const literal = Node.isLiteralTypeNode(node) ? node.getLiteral() : undefined;
      return literal !== undefined && Node.isStringLiteral(literal) ? literal.getLiteralValue() : undefined;
    },
    type: (node) => node.getType(),
    symbol: (node) => node.getSymbol(),
    alias: (symbol) => symbol.getAliasedSymbol() ?? symbol,
    declarations: (symbol) => symbol.getDeclarations(),
    symbolName: (symbol) => symbol.getName(),
    symbolType: (symbol, at) => symbol.getTypeAtLocation(at),
    typeSymbol: (type) => type.getSymbol(),
    aliasSymbol: (type) => type.getAliasSymbol(),
    flags: (type) => ({ any: type.isAny(), unknown: type.isUnknown(), never: type.isNever(), parameter: type.isTypeParameter(), object: type.isObject() }),
    unions: (type) => type.getUnionTypes(),
    intersections: (type) => type.getIntersectionTypes(),
    tuple: (type) => (type.isTuple() ? type.getTupleElements() : undefined),
    element: (type) => type.getArrayElementType(),
    indexes: (type) => [type.getStringIndexType(), type.getNumberIndexType()].filter((value) => value !== undefined),
    properties: (type) => type.getProperties(),
    property: (type, name) => type.getProperty(name),
    arguments: (type) => type.getTypeArguments(),
    aliasArguments: (type) => type.getAliasTypeArguments(),
    nonnullable: (type) => type.getNonNullableType(),
    awaited: (type) => type.getAwaitedType(),
    signatures: (type, kind) => (kind === "call" ? type.getCallSignatures() : type.getConstructSignatures()),
    signatureDeclaration: (signature) => signature.getDeclaration(),
    signatureParameters: (signature) => signature.getParameters(),
    signatureReturn: (signature) => signature.getReturnType(),
    indexedType: (type) => (morphIndexedType(type) && type.indexType.isStringLiteral() ? { object: type.objectType, key: type.indexType.value } : undefined),
    literalType: (type): string | undefined => {
      const value = type.getLiteralValue();
      return type.isStringLiteral() && typeof value === "string" ? value : undefined;
    },
    assignable: (left, right) => program.getTypeChecker().isTypeAssignableTo(left.compilerType, right.compilerType),
    defaultLibrary: (node) => program.isSourceFileDefaultLibrary(node.getSourceFile().compilerNode),
  };
}
