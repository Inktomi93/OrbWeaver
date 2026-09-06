// Canonical identity and authored-value composition for the visitor-fed bus fact collector.
import type { CallExpression, Node as MorphNode, Type, TypeAliasDeclaration, VariableDeclaration } from "ts-morph";
import { Node } from "ts-morph";
import type { BusAnchor, BusDeclarationIdentity, BusMemberIdentity, BusOperationIdentity, BusUnresolvedIdentity } from "../contract/bus-fact.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import type { ReferenceUnresolvedReason } from "../contract/reference-fact.ts";
import { resolveCallableMember } from "./gate-contract-origin.ts";
import { readMemberReference, readStaticString, resolveStableExpression } from "./reference-fact.ts";
import { resolveCallableOrigin } from "./reference-fact-call.ts";
import { readStaticAuthoredScalar, readStaticAuthoredValue } from "./static-authored-value.ts";

export const BUS_UNION_SUFFIX = "BusEvent";
export const NAMED_BUS_UNIONS = new Set(["DomainEvent"]);
export const EVENT_TYPES_SUFFIX = "_EVENT_TYPES";

export const busIdentityKey = ({ path, exportName }: BusDeclarationIdentity): string => `${path}\0${exportName}`;

/** Compare a resolved declaration to one delivered source without probing foreign dependency files. */
export function deliveredSourceIs(context: GatePolicyContext, sourceFile: import("ts-morph").SourceFile, path: string): boolean {
  const absolute = sourceFile.getFilePath().replaceAll("\\", "/");
  return (absolute === path || absolute.endsWith(`/${path}`)) && context.relativePath(sourceFile) === path;
}

export function busAnchor(context: GatePolicyContext, node: MorphNode): BusAnchor {
  const at = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return { path: context.relativePath(node.getSourceFile()), line: at.line, column: at.column, node };
}

export function busDeclarationIdentity(context: GatePolicyContext, declaration: TypeAliasDeclaration): BusDeclarationIdentity {
  return { path: context.relativePath(declaration.getSourceFile()), exportName: declaration.getName() };
}

export function canonicalTypeAlias(type: Type): TypeAliasDeclaration | undefined {
  const declarations = (type.getAliasSymbol() ?? type.getSymbol())?.getDeclarations().filter(Node.isTypeAliasDeclaration) ?? [];
  return declarations.length === 1 ? declarations[0] : undefined;
}

interface RefusalInput {
  readonly context: GatePolicyContext;
  readonly stage: BusUnresolvedIdentity["stage"];
  readonly reason: ReferenceUnresolvedReason;
  readonly detail: string;
  readonly node?: MorphNode;
  readonly expected?: BusDeclarationIdentity | null;
}

export function busRefusal(input: RefusalInput): BusUnresolvedIdentity {
  const source = input.node?.getSourceFile().compilerNode;
  const anchor =
    input.node !== undefined && input.context.files.some((candidate) => candidate.compilerNode === source) ? busAnchor(input.context, input.node) : null;
  return {
    stage: input.stage,
    reason: input.reason,
    detail: input.detail,
    expected: input.expected ?? null,
    anchor,
  };
}

export function indexedBusUnion(node: MorphNode | undefined): MorphNode | undefined {
  if (!Node.isIndexedAccessTypeNode(node)) {
    return;
  }
  const index = node.getIndexTypeNode();
  if (!Node.isLiteralTypeNode(index)) {
    return;
  }
  const literal = index.getLiteral();
  return Node.isStringLiteral(literal) && literal.getLiteralText() === "type" ? node.getObjectTypeNode() : undefined;
}

export function beltUnionNode(declaration: VariableDeclaration): MorphNode | undefined {
  const initializer = declaration.getInitializer();
  if (!Node.isSatisfiesExpression(initializer)) {
    return;
  }
  const type = initializer.getTypeNode();
  if (Node.isTypeReference(type) && type.getTypeName().getText() === "Record") {
    return indexedBusUnion(type.getTypeArguments()[0]);
  }
  const array = Node.isTypeOperatorTypeNode(type) ? type.getTypeNode() : type;
  return Node.isArrayTypeNode(array) ? indexedBusUnion(array.getElementTypeNode()) : undefined;
}

export function beltMembers(
  context: GatePolicyContext,
  declaration: VariableDeclaration,
  bus: BusDeclarationIdentity,
  unresolved: BusUnresolvedIdentity[],
): BusMemberIdentity[] {
  const initializer = declaration.getInitializerOrThrow();
  const authored = readStaticAuthoredValue(Node.isSatisfiesExpression(initializer) ? initializer.getExpression() : initializer);
  if (authored.kind === "unresolved") {
    unresolved.push(busRefusal({ context, stage: "member", reason: authored.reason, detail: authored.detail, node: authored.node, expected: bus }));
    return [];
  }
  const values: { readonly name: string; readonly node: MorphNode }[] = [];
  if (authored.value.kind === "object") {
    values.push(...authored.value.properties.map(({ key, keyNode }) => ({ name: key, node: keyNode })));
  } else if (authored.value.kind === "tuple") {
    values.push(
      ...authored.value.elements.flatMap((element) =>
        element.kind === "scalar" && typeof element.value === "string" ? [{ name: element.value, node: element.node }] : [],
      ),
    );
  }
  if (values.length === 0) {
    unresolved.push(
      busRefusal({
        context,
        stage: "member",
        reason: "missing",
        detail: `${declaration.getName()} resolves no event members`,
        node: declaration,
        expected: bus,
      }),
    );
  }
  return values.map(({ name, node }) => ({ bus, name, anchor: busAnchor(context, node) }));
}

function staticPropertyName(context: GatePolicyContext, node: MorphNode, unresolved: BusUnresolvedIdentity[]): string | undefined {
  if (Node.isIdentifier(node)) {
    return node.getText();
  }
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  if (!Node.isComputedPropertyName(node)) {
    return;
  }
  const read = readStaticString(node.getExpression());
  if (read.kind === "unresolved") {
    unresolved.push(busRefusal({ context, stage: "emitter", reason: read.reason, detail: read.detail, node: read.node }));
    return;
  }
  return read.value;
}

function objectOf(context: GatePolicyContext, node: MorphNode, unresolved: BusUnresolvedIdentity[]): import("ts-morph").ObjectLiteralExpression | undefined {
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved") {
    if (!Node.isParameterDeclaration(stable.node)) {
      unresolved.push(busRefusal({ context, stage: "emitter", reason: stable.reason, detail: stable.detail, node: stable.node }));
    }
    return;
  }
  return Node.isObjectLiteralExpression(stable.value) ? stable.value : undefined;
}

export function authoredProperty(
  context: GatePolicyContext,
  object: import("ts-morph").ObjectLiteralExpression,
  wanted: string,
  unresolved: BusUnresolvedIdentity[],
): MorphNode | undefined {
  return [...object.getProperties()]
    .reverse()
    .reduce<MorphNode | undefined>((value, property) => value ?? authoredPropertyEntry(context, property, wanted, unresolved), undefined);
}

function authoredPropertyEntry(context: GatePolicyContext, property: MorphNode, wanted: string, unresolved: BusUnresolvedIdentity[]): MorphNode | undefined {
  if (Node.isSpreadAssignment(property)) {
    const spread = objectOf(context, property.getExpression(), unresolved);
    return spread === undefined ? undefined : authoredProperty(context, spread, wanted, unresolved);
  }
  if (!(Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property))) {
    return;
  }
  if (staticPropertyName(context, property.getNameNode(), unresolved) !== wanted) {
    return;
  }
  return Node.isPropertyAssignment(property) ? property.getInitializer() : property.getNameNode();
}

function parameterDeclaration(node: MorphNode): import("ts-morph").ParameterDeclaration | undefined {
  const stable = resolveStableExpression(node);
  return stable.kind === "unresolved" && Node.isParameterDeclaration(stable.node) ? stable.node : undefined;
}

export interface ParameterProjection {
  readonly parameter: import("ts-morph").ParameterDeclaration;
  readonly memberPath: readonly string[];
}

export function parameterProjection(
  context: GatePolicyContext,
  node: MorphNode,
  property: string,
  unresolved: BusUnresolvedIdentity[],
): ParameterProjection | undefined {
  const direct = parameterDeclaration(node);
  if (direct !== undefined) {
    return { parameter: direct, memberPath: [] };
  }
  const object = objectOf(context, node, []);
  const value = object === undefined ? node : authoredProperty(context, object, property, unresolved);
  if (value === undefined) {
    return;
  }
  const parameter = parameterDeclaration(value);
  if (parameter !== undefined) {
    return { parameter, memberPath: [] };
  }
  const member = readMemberReference(value);
  if (member.kind !== "resolved") {
    return;
  }
  const receiver = parameterDeclaration(member.value.receiver);
  return receiver === undefined ? undefined : { parameter: receiver, memberPath: [member.value.name] };
}

export function discriminatorValues(
  context: GatePolicyContext,
  node: MorphNode,
  property: string,
  unresolved: BusUnresolvedIdentity[],
): readonly { readonly value: string; readonly node: MorphNode }[] {
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved" && Node.isConditionalExpression(stable.node)) {
    return [
      ...discriminatorValues(context, stable.node.getWhenTrue(), property, unresolved),
      ...discriminatorValues(context, stable.node.getWhenFalse(), property, unresolved),
    ];
  }
  if (stable.kind === "unresolved") {
    if (!Node.isParameterDeclaration(stable.node)) {
      unresolved.push(busRefusal({ context, stage: "emitter", reason: stable.reason, detail: stable.detail, node: stable.node }));
    }
    return [];
  }
  const valueNode = Node.isObjectLiteralExpression(stable.value) ? authoredProperty(context, stable.value, property, unresolved) : stable.value;
  if (valueNode === undefined || parameterProjection(context, valueNode, property, []) !== undefined) {
    return [];
  }
  const value = readStaticAuthoredScalar(valueNode);
  if (value.kind === "unresolved") {
    unresolved.push(busRefusal({ context, stage: "emitter", reason: value.reason, detail: value.detail, node: value.node }));
    return [];
  }
  return typeof value.value === "string" ? [{ value: value.value, node: value.trace.origin }] : [];
}

export function callName(call: CallExpression): string | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  const member = readMemberReference(expression);
  return member.kind === "resolved" ? member.value.name : undefined;
}

export function typeForParameter(context: GatePolicyContext, call: CallExpression, index: number): Type | undefined {
  const signature = context.checker().getResolvedSignature(call);
  const parameter = signature?.getParameters()[index];
  return parameter === undefined ? undefined : context.checker().getTypeOfSymbolAtLocation(parameter, call);
}

export function callableDeclaration(call: CallExpression): MorphNode | undefined {
  const expression = call.getExpression();
  let symbol: import("ts-morph").Symbol | undefined;
  if (Node.isIdentifier(expression)) {
    symbol = expression.getSymbol();
  } else if (readMemberReference(expression).kind === "resolved") {
    symbol = expression.getSymbol();
  }
  const declarations = symbol?.getAliasedSymbol()?.getDeclarations() ?? symbol?.getDeclarations() ?? [];
  return declarations.length === 1 ? declarations[0] : undefined;
}

function busChannelReceiver(context: GatePolicyContext, receiver: MorphNode): boolean {
  const stable = resolveStableExpression(receiver);
  return stable.trace.declarations.filter(Node.isVariableDeclaration).some((declaration) => {
    const initializer = declaration.getInitializer();
    if (!Node.isCallExpression(initializer)) {
      return false;
    }
    const origin = resolveCallableOrigin(initializer);
    return (
      origin.kind === "resolved" &&
      origin.value.target.kind === "module" &&
      origin.value.target.canonical.kind === "project" &&
      deliveredSourceIs(context, origin.value.target.canonical.sourceFile, "packages/server/src/transport/trpc/bus-channel.ts") &&
      origin.value.target.canonical.exportedName === "defineBusChannel"
    );
  });
}

function injectedReceiver(receiver: MorphNode): boolean {
  let root = receiver;
  for (;;) {
    const member = readMemberReference(root);
    if (member.kind !== "resolved") {
      break;
    }
    root = member.value.receiver;
  }
  const stable = resolveStableExpression(root);
  return stable.kind === "unresolved" && Node.isParameterDeclaration(stable.node);
}

export type EmitterSinkKind = "channel" | "injected";

/** Prove the call reaches an injected callable or the one bus-channel publisher, not a same-typed decoy. */
export function emitterSink(context: GatePolicyContext, call: CallExpression): EmitterSinkKind | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    const declarations = expression.getSymbol()?.getDeclarations() ?? [];
    return declarations.length === 1 && Node.isParameterDeclaration(declarations[0]) ? "injected" : undefined;
  }
  const member = resolveCallableMember(expression);
  if (member === undefined) {
    return;
  }
  if (injectedReceiver(member.receiver)) {
    const declarations = member.receiver.getType().getProperty(member.name)?.getDeclarations() ?? [];
    return declarations.some((declaration) => Node.isPropertySignature(declaration)) ? "injected" : undefined;
  }
  return member.name === "publish" && busChannelReceiver(context, member.receiver) ? "channel" : undefined;
}

export function operationIdentity(context: GatePolicyContext, call: CallExpression, bus: BusDeclarationIdentity): BusOperationIdentity {
  const callable = resolveCallableOrigin(call);
  if (callable.kind === "resolved" && callable.value.target.kind === "module" && callable.value.target.canonical.kind === "project") {
    return {
      kind: "module",
      module: {
        path: context.relativePath(callable.value.target.canonical.sourceFile),
        exportName: callable.value.target.canonical.exportedName,
      },
      memberPath: callable.value.target.memberPath,
    };
  }
  return { kind: "injected", owner: bus, memberPath: [callName(call) ?? "<call>"] };
}

export function ownerIdentity(context: GatePolicyContext, node: MorphNode): BusDeclarationIdentity {
  const owner = node.getFirstAncestor(
    (candidate) => Node.isTypeAliasDeclaration(candidate) || Node.isVariableDeclaration(candidate) || Node.isFunctionDeclaration(candidate),
  );
  let name = "<anonymous>";
  if (Node.isTypeAliasDeclaration(owner) || Node.isVariableDeclaration(owner) || Node.isFunctionDeclaration(owner)) {
    name = owner.getName() ?? name;
  }
  return { path: context.relativePath(node.getSourceFile()), exportName: name };
}

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
