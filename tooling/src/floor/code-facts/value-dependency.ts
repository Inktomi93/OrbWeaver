// Returned-value dependency over supplied native carriers; unsupported operations never lend their arguments an effect.
import type { CallExpression, Node as MorphNode, ts } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { readCallReturnProgram } from "./call-returns.ts";
import { runtimeUndefinedValue } from "./call-supplied.ts";
import {
  inspectBindingReassignment,
  inspectReferenceWrites,
  readMemberReference,
  referenceResolutionServices,
  resolveStableExpression,
} from "./reference-fact.ts";
import { lexicalReferenceSymbol } from "./reference-fact-alias.ts";
import type { CallReturnObservations, CallReturnProgram, ReturnedValueInputs, ReturnedValueSource, ReturnedValueTerminals } from "./reference-fact-contract.ts";
import { readNativeStringCallWith } from "./reference-fact-global.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";
import { resolveTypeMemberOrigin } from "./type-member-origin.ts";
import { resolveTypePropertyValue } from "./type-member-origin-core.ts";
import { readReturnedValue, referencesOf } from "./value-carrier.ts";
import type {
  OpaqueNativeValueBoundary,
  ReturnedDictionaryInput,
  ReturnedDictionaryResult,
  ReturnedDictionaryWrite,
  ValueDependencyContribution,
  ValueDependencyInput,
  ValueDependencyResult,
} from "./value-dependency-contract.ts";

interface DependencyContext {
  readonly input: ValueDependencyInput;
  readonly program: CallReturnProgram;
  readonly active: ReadonlySet<ts.Node>;
  readonly carriers: ReturnedValueTerminals;
  readonly bindings: ReadonlyMap<MorphNode, MorphNode>;
}

type DependencyRead =
  | { readonly kind: "read"; readonly contributions: readonly ValueDependencyContribution[] }
  | Extract<ValueDependencyResult, { readonly kind: "unqualified" }>;

function unqualified(node: MorphNode, reason: string): Extract<ValueDependencyResult, { readonly kind: "unqualified" }> {
  return { kind: "unqualified", node, reason };
}

function joined(reads: readonly DependencyRead[]): DependencyRead {
  const failure = reads.find((read) => read.kind === "unqualified");
  return failure ?? { kind: "read", contributions: reads.flatMap((read) => (read.kind === "read" ? read.contributions : [])) };
}

interface NativeValueTransfer {
  readonly inputs: readonly MorphNode[];
  readonly declarations: readonly MorphNode[];
}

function readNativeValueTransfer(call: CallExpression, context: DependencyContext): NativeValueTransfer | undefined {
  const member = resolveTypeMemberOrigin(call.getExpression());
  const read = readMemberReference(call.getExpression());
  if (member.kind !== "resolved" || read.kind !== "resolved") {
    return;
  }
  const stable = referenceResolutionServices.inspectSymbolWrites(member.value.symbol, call.getExpression());
  if (stable.kind !== "resolved") {
    return;
  }
  const declarations = member.value.declarations;
  if (!declarations.every((declaration) => context.program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode))) {
    return;
  }
  const parents = declarations.map((declaration) => declaration.getParent());
  if (
    parents.every((parent) => Node.isInterfaceDeclaration(parent) && parent.getName() === "Math") &&
    ["min", "max", "floor", "ceil", "round"].includes(member.value.name)
  ) {
    return { inputs: call.getArguments(), declarations };
  }
  if (
    parents.every((parent) => Node.isInterfaceDeclaration(parent) && parent.getName() === "String") &&
    ["slice", "substring", "trim"].includes(member.value.name)
  ) {
    return { inputs: [read.value.receiver, ...call.getArguments()], declarations };
  }
  // biome-ignore lint/complexity/noUselessUndefined: noImplicitReturns requires an explicit unsupported effect.
  return undefined;
}

function terminalContribution(source: ReturnedValueSource, context: DependencyContext): DependencyRead | undefined {
  if (!(Node.isCallExpression(source.value) && context.input.terminals.has(source.value.compilerNode))) {
    return;
  }
  if (!context.program.byCall.has(source.value.compilerNode)) {
    return unqualified(source.value, "The terminal call is absent from the supplied native observations.");
  }
  return { kind: "read", contributions: [{ terminal: source.value, projection: source.path, uses: [source.value] }] };
}

function nativeLeafDependency(source: ReturnedValueSource, context: DependencyContext): DependencyRead | undefined {
  if (context.input.nativeValueTransfers === true && source.path.length > 0 && (source.nativeLookup !== undefined || source.nativeIteration !== undefined)) {
    return unqualified(source.value, "A projected native cache/iteration value has no proved member contribution.");
  }
  if (context.input.nativeValueTransfers === true && source.nativeLookup !== undefined) {
    return dependencyUses(readDependency(source.nativeLookup.key, [], { ...context, bindings: source.bindings }), [source.nativeLookup.call]);
  }
  if (context.input.nativeValueTransfers === true && source.nativeIteration !== undefined) {
    return dependencyUses(readDependency(source.nativeIteration.collection, [], { ...context, bindings: source.bindings }), [
      source.nativeIteration.call,
      source.nativeIteration.parameter,
    ]);
  }
  return undefined;
}

function readCallLeaf(source: ReturnedValueSource, call: CallExpression, context: DependencyContext): DependencyRead {
  if (source.path.length > 0) {
    return unqualified(call, "A projected native result has no proved input/result transfer for that projection.");
  }
  const transfer = readNativeValueTransfer(call, context);
  return transfer === undefined
    ? unqualified(call, "The returned operation has no proved native input/result transfer.")
    : dependencyUses(joined(transfer.inputs.map((input) => readDependency(input, [], context))), [call, ...transfer.declarations]);
}

function readLeaf(source: ReturnedValueSource, context: DependencyContext): DependencyRead {
  if (!source.present) {
    return unqualified(source.value, "A missing returned projection does not establish dependency.");
  }
  const native = nativeLeafDependency(source, context);
  if (native !== undefined) {
    return native;
  }
  const type = source.value.getType();
  if (type.isNever()) {
    return unqualified(source.value, "A never leaf supplies no returned value contribution.");
  }
  const terminal = terminalContribution(source, context);
  if (terminal !== undefined) {
    return opaqueNativeData(terminal, source.value);
  }
  const inherited = { ...context, bindings: source.bindings };
  if (Node.isCallExpression(source.value)) {
    return readCallLeaf(source, source.value, inherited);
  }
  if (Node.isArrayLiteralExpression(source.value)) {
    if (source.path.length > 0 || source.value.getElements().some(Node.isSpreadElement)) {
      return unqualified(source.value, "An opaque or spread array projection has no closed contribution.");
    }
    return joined(source.value.getElements().map((element) => readDependency(element, [], inherited)));
  }
  const loop = readLoopElement(source, inherited);
  if (loop !== undefined) {
    return loop;
  }
  if (Node.isIdentifier(source.value) || Node.isLiteralExpression(source.value)) {
    return { kind: "read", contributions: [] };
  }
  return unqualified(source.value, "The returned expression is outside proved native dependency effects.");
}

function readDependency(node: MorphNode, path: readonly string[], context: DependencyContext): DependencyRead {
  if (context.active.has(node.compilerNode)) {
    return unqualified(node, "Returned dependency revisits its binding or operation.");
  }
  const next = { ...context, active: new Set(context.active).add(node.compilerNode) };
  const collector = readArrayCollector(node, path, next);
  if (collector !== undefined) {
    return collector;
  }
  const carried = readReturnedValue(node, path, context.input.observations, {
    terminals: context.carriers,
    bindings: context.bindings,
    ...(context.input.nativeValueTransfers === true ? { nativeValueTransfers: true as const } : {}),
  });
  return carried.kind === "unresolved" ? unqualified(carried.node, carried.detail) : joined(carried.value.map((source) => readLeaf(source, next)));
}

/** Prove a supplied terminal actually contributes to the returned value; call presence and unknown leaves do not qualify. */
export function readValueDependencyContribution(input: ValueDependencyInput): ValueDependencyResult {
  if (input.value.wasForgotten()) {
    return unqualified(input.value, "Returned dependency received a forgotten native value.");
  }
  const admitted = readCallReturnProgram(input.value, input.observations);
  if (admitted.kind === "unresolved") {
    return unqualified(admitted.node, admitted.detail);
  }
  const context: DependencyContext = { input, program: admitted.value, active: new Set(), carriers: input.terminals, bindings: new Map() };
  const carriers = (call: CallExpression): boolean => input.terminals.has(call.compilerNode) || readNativeValueTransfer(call, context) !== undefined;
  const result = readDependency(input.value, input.path ?? [], { ...context, carriers });
  if (result.kind === "unqualified") {
    return result;
  }
  return result.contributions.length === 0
    ? unqualified(input.value, "No supplied native terminal contributes to this returned value.")
    : {
        kind: "qualified",
        contributions: result.contributions,
        dataTrust: { kind: "unqualified", boundaries: result.contributions.flatMap((contribution) => contribution.opaqueData ?? []) },
      };
}

function ownCallable(node: MorphNode): MorphNode | undefined {
  return node.getFirstAncestor(
    (parent) => Node.isFunctionDeclaration(parent) || Node.isArrowFunction(parent) || Node.isFunctionExpression(parent) || Node.isMethodDeclaration(parent),
  );
}

function localVariable(node: MorphNode): import("ts-morph").VariableDeclaration | undefined {
  if (Node.isVariableDeclaration(node)) {
    return node;
  }
  const declaration = Node.isIdentifier(node) ? lexicalReferenceSymbol(node)?.getValueDeclaration() : undefined;
  return declaration !== undefined && Node.isVariableDeclaration(declaration) ? declaration : undefined;
}

function readLoopElement(source: ReturnedValueSource, context: DependencyContext): DependencyRead | undefined {
  const declaration = localVariable(source.value);
  const list = declaration?.getParentIfKind(SyntaxKind.VariableDeclarationList);
  const loop = list?.getParentIfKind(SyntaxKind.ForOfStatement);
  if (declaration === undefined || list === undefined || loop === undefined || loop.getInitializer() !== list) {
    return;
  }
  if (list.getDeclarationKind() !== VariableDeclarationKind.Const || list.getDeclarations().length !== 1 || !Node.isIdentifier(declaration.getNameNode())) {
    return unqualified(declaration, "The iterator binding is mutable or has opaque destructuring.");
  }
  const type = loop.getExpression().getType();
  if (type.getArrayElementType() === undefined && !type.isReadonlyArray()) {
    return unqualified(loop, "Only a native array iteration supplies a proved returned element projection.");
  }
  const name = declaration.getNameNode();
  const stable = Node.isIdentifier(name) ? inspectReferenceWrites(name) : undefined;
  if (stable?.kind !== "resolved") {
    return unqualified(declaration, "The iterated element is written or has no stable native binding.");
  }
  if (source.path.length > 0) {
    const property = resolveTypePropertyValue(declaration, source.path);
    if (property.kind !== "resolved" || property.value.type.isNever()) {
      return unqualified(declaration, "The iterated projection has no resolved native member origin.");
    }
    const read = readDependency(loop.getExpression(), [], context);
    return opaqueNativeData(
      dependencyUses(read, [loop, declaration, ...property.value.declarations]),
      property.value.declarations[0] ?? declaration,
      property.value.type,
    );
  }
  const read = readDependency(loop.getExpression(), [], context);
  return dependencyUses(read, [loop, declaration]);
}

type CollectorUse =
  | { readonly kind: "observed" }
  | { readonly kind: "append"; readonly call: CallExpression }
  | Extract<ValueDependencyResult, { readonly kind: "unqualified" }>;

function collectorUse(reference: MorphNode, scope: MorphNode, context: DependencyContext): CollectorUse {
  if (ownCallable(reference) !== scope) {
    return unqualified(reference, "The returned collector escapes into another callable lifetime.");
  }
  const site = referenceResolutionServices.unwrapExpression(reference.getParent() ?? reference);
  if (Node.isReturnStatement(site) && site.getExpression() === reference) {
    return { kind: "observed" };
  }
  const member = resolveTypeMemberOrigin(site);
  if (
    member.kind !== "resolved" ||
    !member.value.declarations.every((declaration) => context.program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode))
  ) {
    return unqualified(reference, "A collector reference is a write, escape or unknown member operation.");
  }
  if (member.value.name === "length") {
    return { kind: "observed" };
  }
  const call = site.getParent();
  return member.value.name === "push" &&
    Node.isCallExpression(call) &&
    call.getExpression() === site &&
    call.getArguments().every((argument) => !Node.isSpreadElement(argument))
    ? { kind: "append", call }
    : unqualified(reference, "A collector reference is not a proved native append or readonly length observation.");
}

function primitiveStringInput(node: MorphNode, context: DependencyContext): boolean {
  const values = readReturnedValue(node, [], context.input.observations, {
    terminals: context.carriers,
    bindings: context.bindings,
    nativeValueTransfers: true,
  });
  if (values.kind !== "resolved" || values.value.length !== 1) {
    return false;
  }
  const source = values.value[0];
  if (source === undefined || !source.present || source.path.length > 0) {
    return false;
  }
  if (Node.isCallExpression(source.value)) {
    const member = readMemberReference(source.value.getExpression());
    const effect = readNativeValueTransfer(source.value, context);
    const input = effect?.inputs[0];
    return member.kind === "resolved" && effect?.inputs.length === 1 && input !== undefined && primitiveStringInput(input, context);
  }
  const declaration = Node.isIdentifier(source.value) ? lexicalReferenceSymbol(source.value)?.getValueDeclaration() : undefined;
  return Node.isParameterDeclaration(declaration) && source.value.getType().isString();
}

function nativeCollectorPrefix(statement: MorphNode, context: DependencyContext): boolean {
  if (Node.isVariableStatement(statement)) {
    return (
      statement.getDeclarationKind() === VariableDeclarationKind.Const &&
      statement.getDeclarations().every((declaration) => declaration.getInitializer() !== undefined && !declaration.getInitializerOrThrow().getType().isNever())
    );
  }
  if (!Node.isIfStatement(statement) || statement.getElseStatement() !== undefined) {
    return false;
  }
  const condition = statement.getExpression();
  const right = Node.isBinaryExpression(condition) ? condition.getRight() : undefined;
  if (
    !Node.isBinaryExpression(condition) ||
    condition.getOperatorToken().getKind() !== SyntaxKind.EqualsEqualsEqualsToken ||
    !Node.isNumericLiteral(right) ||
    right.getLiteralValue() !== 0
  ) {
    return false;
  }
  const member = readMemberReference(condition.getLeft());
  const branch = statement.getThenStatement();
  const returns = Node.isBlock(branch) ? branch.getStatements() : [branch];
  return (
    member.kind === "resolved" &&
    member.value.name === "length" &&
    primitiveStringInput(member.value.receiver, context) &&
    returns.length === 1 &&
    Node.isReturnStatement(returns[0]) &&
    returns[0].getExpression() !== undefined
  );
}

function nativeCollectorCap(statement: MorphNode | undefined, binding: MorphNode): boolean {
  if (!Node.isIfStatement(statement) || statement.getElseStatement() !== undefined) {
    return false;
  }
  const condition = statement.getExpression();
  if (
    !Node.isBinaryExpression(condition) ||
    condition.getOperatorToken().getKind() !== SyntaxKind.GreaterThanEqualsToken ||
    !(condition.getRight().getType().isNumber() || condition.getRight().getType().isNumberLiteral())
  ) {
    return false;
  }
  const member = readMemberReference(condition.getLeft());
  const branch = statement.getThenStatement();
  const statements = Node.isBlock(branch) ? branch.getStatements() : [branch];
  return (
    member.kind === "resolved" &&
    member.value.name === "length" &&
    localVariable(member.value.receiver) === binding &&
    statements.length === 1 &&
    Node.isBreakStatement(statements[0]) &&
    statements[0].getLabel() === undefined
  );
}

function nativeLookupAppendClosed(call: MorphNode | undefined, writes: readonly MorphNode[], binding: MorphNode, value: MorphNode): boolean {
  const argument = Node.isCallExpression(call) ? call.getArguments()[0] : undefined;
  return (
    Node.isCallExpression(call) &&
    call.getArguments().length === 1 &&
    argument !== undefined &&
    localVariable(argument) === value &&
    writes.length <= 2 &&
    (writes.length !== 2 || nativeCollectorCap(writes[1], binding))
  );
}

function nativeLookupLoop(
  loop: import("ts-morph").ForOfStatement,
  binding: MorphNode,
  appends: ReadonlySet<import("ts-morph").ts.Node>,
  context: DependencyContext,
): boolean {
  const list = loop.getInitializer();
  const element =
    Node.isVariableDeclarationList(list) && list.getDeclarationKind() === VariableDeclarationKind.Const && list.getDeclarations().length === 1
      ? list.getDeclarations()[0]
      : undefined;
  const body = loop.getStatement();
  const statements = Node.isBlock(body) ? body.getStatements() : [body];
  const declarationStatement = statements[0];
  const guard = statements[1];
  if (
    element === undefined ||
    statements.length !== 2 ||
    !Node.isVariableStatement(declarationStatement) ||
    declarationStatement.getDeclarationKind() !== VariableDeclarationKind.Const ||
    declarationStatement.getDeclarations().length !== 1 ||
    !Node.isIfStatement(guard) ||
    guard.getElseStatement() !== undefined
  ) {
    return false;
  }
  const value = declarationStatement.getDeclarations()[0];
  const condition = guard.getExpression();
  if (
    value === undefined ||
    !Node.isBinaryExpression(condition) ||
    condition.getOperatorToken().getKind() !== SyntaxKind.ExclamationEqualsEqualsToken ||
    !Node.isIdentifier(condition.getRight()) ||
    !runtimeUndefinedValue(condition.getRight()) ||
    localVariable(condition.getLeft()) !== value
  ) {
    return false;
  }
  const guarded = guard.getThenStatement();
  const writes = Node.isBlock(guarded) ? guarded.getStatements() : [guarded];
  const append = writes[0];
  const call = Node.isExpressionStatement(append) ? append.getExpression() : undefined;
  if (!(Node.isCallExpression(call) && appends.has(call.compilerNode) && nativeLookupAppendClosed(call, writes, binding, value))) {
    return false;
  }
  const initial = value.getInitializer();
  if (initial === undefined) {
    return false;
  }
  const carried = readReturnedValue(initial, [], context.input.observations, {
    terminals: context.carriers,
    bindings: context.bindings,
    nativeValueTransfers: true,
  });
  if (
    carried.kind !== "resolved" ||
    !carried.value.some((source) => source.present) ||
    carried.value.some((source) => source.present && source.nativeLookup === undefined)
  ) {
    return false;
  }
  return carried.value.filter((source) => source.present).every((source) => nativeLookupElement(source, element, context));
}

function nativeLookupElement(source: ReturnedValueSource, element: MorphNode, context: DependencyContext): boolean {
  const key = source.nativeLookup?.key;
  if (key === undefined) {
    return false;
  }
  const keys = readReturnedValue(key, [], context.input.observations, { terminals: context.carriers, bindings: source.bindings, nativeValueTransfers: true });
  return keys.kind === "resolved" && keys.value.length > 0 && keys.value.every((keySource) => keySource.present && localVariable(keySource.value) === element);
}

function retainedLookupAppend(call: CallExpression, context: DependencyContext): DependencyRead {
  const argument = call.getArguments()[0];
  if (argument === undefined) {
    return unqualified(call, "The guarded native append has no supplied value.");
  }
  const carried = readReturnedValue(argument, [], context.input.observations, {
    terminals: context.carriers,
    bindings: context.bindings,
    nativeValueTransfers: true,
  });
  if (carried.kind !== "resolved") {
    return unqualified(carried.node, carried.detail);
  }
  const retained = carried.value.filter((source) => source.present);
  return retained.length === 0
    ? unqualified(call, "The guarded native append has no retained lookup alternative.")
    : joined(retained.map((source) => readLeaf(source, context)));
}

function closedCollectorPhase(
  node: MorphNode,
  declaration: MorphNode,
  phase: { readonly scope: MorphNode; readonly pushes: readonly CallExpression[] },
  context: DependencyContext,
): boolean {
  const { scope, pushes } = phase;
  const body =
    Node.isFunctionDeclaration(scope) || Node.isArrowFunction(scope) || Node.isFunctionExpression(scope) || Node.isMethodDeclaration(scope)
      ? scope.getBody()
      : undefined;
  const returned = node.getParent();
  const initialized = declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  if (body === undefined || !Node.isBlock(body) || !Node.isReturnStatement(returned) || returned.getExpression() !== node) {
    return false;
  }
  const statements = body.getStatements();
  const start = initialized === undefined ? -1 : statements.indexOf(initialized);
  if (
    start < 0 ||
    statements.at(-1) !== returned ||
    (context.input.nativeValueTransfers === true ? !statements.slice(0, start).every((statement) => nativeCollectorPrefix(statement, context)) : start !== 0)
  ) {
    return false;
  }
  const nativeAppends = new Set<import("ts-morph").ts.Node>(pushes.map((call) => call.compilerNode));
  const directAppend = (statement: MorphNode): boolean => Node.isExpressionStatement(statement) && nativeAppends.has(statement.getExpression().compilerNode);
  return (
    statements.slice(start + 1, -1).every((statement) => {
      if (directAppend(statement)) {
        return true;
      }
      if (!Node.isForOfStatement(statement)) {
        return false;
      }
      const loopBody = statement.getStatement();
      const loopStatements = Node.isBlock(loopBody) ? loopBody.getStatements() : [loopBody];
      if (!loopStatements.every(directAppend)) {
        return context.input.nativeValueTransfers === true && nativeLookupLoop(statement, declaration, nativeAppends, context);
      }
      const initializer = statement.getInitializer();
      const element = Node.isVariableDeclarationList(initializer) ? initializer.getDeclarations()[0] : undefined;
      if (element === undefined) {
        return false;
      }
      return pushes
        .filter((call) => call.getFirstAncestorByKind(SyntaxKind.ForOfStatement) === statement)
        .every((call) =>
          call.getArguments().every((argument) => {
            const sources = readReturnedValue(argument, [], context.input.observations, {
              terminals: context.carriers,
              bindings: context.bindings,
              ...(context.input.nativeValueTransfers === true ? { nativeValueTransfers: true as const } : {}),
            });
            return (
              sources.kind === "resolved" &&
              sources.value.length > 0 &&
              sources.value.every((source) => source.present && localVariable(source.value) === element)
            );
          }),
        );
    }) && pushes.every((call) => call.getStart() < returned.getStart())
  );
}

function readArrayCollector(node: MorphNode, path: readonly string[], context: DependencyContext): DependencyRead | undefined {
  const declaration = localVariable(node);
  const initializer = declaration?.getInitializer();
  if (declaration === undefined || initializer === undefined || !Node.isArrayLiteralExpression(initializer) || initializer.getElements().length > 0) {
    return;
  }
  const scope = ownCallable(declaration);
  if (
    path.length > 0 ||
    scope === undefined ||
    declaration.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() !== VariableDeclarationKind.Const
  ) {
    return unqualified(node, "A returned collector requires a local immutable empty-array binding without opaque projection.");
  }
  const uses = referencesOf(declaration.getNameNode(), scope).map((reference) => collectorUse(reference, scope, context));
  const failure = uses.find((use) => use.kind === "unqualified");
  if (failure !== undefined) {
    return failure;
  }
  const pushes = uses.flatMap((use) => (use.kind === "append" ? [use.call] : []));
  if (!closedCollectorPhase(node, declaration, { scope, pushes }, context)) {
    return unqualified(
      node,
      "The collector requires an initial empty-array declaration, a final return and closed appends from actual iterator elements or direct values.",
    );
  }
  return dependencyUses(
    joined(
      pushes.flatMap((call) =>
        context.input.nativeValueTransfers === true && call.getFirstAncestorByKind(SyntaxKind.IfStatement) !== undefined
          ? [retainedLookupAppend(call, context)]
          : call.getArguments().map((argument) => readDependency(argument, [], context)),
      ),
    ),
    [node, declaration, ...pushes],
  );
}

function opaqueNativeData(read: DependencyRead, node: MorphNode, type = node.getType()): DependencyRead {
  let kind: OpaqueNativeValueBoundary["kind"] | undefined;
  if (type.isAny()) {
    kind = "any";
  } else if (type.isUnknown()) {
    kind = "unknown";
  }
  if (read.kind !== "read" || kind === undefined) {
    return read;
  }
  return {
    ...read,
    contributions: read.contributions.map((contribution) => ({ ...contribution, opaqueData: [...(contribution.opaqueData ?? []), { node, kind }] })),
  };
}

function dependencyUses(read: DependencyRead, uses: readonly MorphNode[]): DependencyRead {
  return read.kind !== "read"
    ? read
    : { ...read, contributions: read.contributions.map((contribution) => ({ ...contribution, uses: [...contribution.uses, ...uses] })) };
}

interface DictionaryLoop {
  readonly node: import("ts-morph").ForOfStatement;
  readonly element: import("ts-morph").VariableDeclaration;
  readonly values: readonly string[];
  readonly origins: readonly MorphNode[];
}

function dictionaryLoop(node: MorphNode): DictionaryLoop | undefined {
  if (!Node.isForOfStatement(node)) {
    return;
  }
  const initializer = node.getInitializer();
  if (
    !Node.isVariableDeclarationList(initializer) ||
    initializer.getDeclarationKind() !== VariableDeclarationKind.Const ||
    initializer.getDeclarations().length !== 1
  ) {
    return;
  }
  const element = initializer.getDeclarations()[0];
  const name = element?.getNameNode();
  if (element === undefined || name === undefined || !Node.isIdentifier(name) || inspectReferenceWrites(name).kind !== "resolved") {
    return;
  }
  const tuple = readStaticAuthoredValue(node.getExpression());
  if (tuple.kind !== "resolved" || tuple.value.kind !== "tuple" || tuple.value.elements.length === 0) {
    return;
  }
  const elements = tuple.value.elements;
  if (elements.some((value) => value.kind !== "scalar" || typeof value.value !== "string")) {
    return;
  }
  return {
    node,
    element,
    values: elements.flatMap((value) => (value.kind === "scalar" && typeof value.value === "string" ? [value.value] : [])),
    origins: tuple.trace.declarations,
  };
}

function dictionaryKeys(key: MorphNode, loop: DictionaryLoop): readonly string[] | undefined {
  if (!Node.isTemplateExpression(key)) {
    return;
  }
  const spans = key.getTemplateSpans();
  const span = spans[0];
  if (spans.length !== 1 || span === undefined || localVariable(span.getExpression()) !== loop.element) {
    return;
  }
  return loop.values.map((value) => `${key.getHead().getLiteralText()}${value}${span.getLiteral().getLiteralText()}`);
}

function dictionaryWriter(statement: MorphNode, binding: MorphNode, loop: DictionaryLoop, optional: boolean): ReturnedDictionaryWrite | undefined {
  const expression = Node.isExpressionStatement(statement) ? statement.getExpression() : undefined;
  if (!Node.isBinaryExpression(expression) || expression.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return;
  }
  const left = expression.getLeft();
  if (!Node.isElementAccessExpression(left) || localVariable(left.getExpression()) !== binding) {
    return;
  }
  const key = left.getArgumentExpression();
  const keys = key === undefined ? undefined : dictionaryKeys(key, loop);
  if (key === undefined || keys === undefined || keys.some((name) => name === "__proto__")) {
    return;
  }
  return { keys, key, value: expression.getRight(), statement, optional };
}

interface DictionaryContext {
  readonly bindings: ReadonlyMap<MorphNode, MorphNode>;
  readonly observations: CallReturnObservations;
}

function retainedDictionarySource(source: ReturnedValueSource, owner: MorphNode | undefined): boolean {
  if (!source.present) {
    return false;
  }
  if (source.path.length > 0) {
    const origin = Node.isIdentifier(source.value) ? lexicalReferenceSymbol(source.value)?.getValueDeclaration() : undefined;
    if (!Node.isParameterDeclaration(origin) || ownCallable(origin) === owner) {
      return false;
    }
    const member = resolveTypePropertyValue(source.value, source.path);
    return member.kind === "resolved" && (member.value.type.isString() || member.value.type.isStringLiteral());
  }
  return source.value.getType().isString() || source.value.getType().isStringLiteral();
}

function retainedDictionaryArm(value: import("ts-morph").VariableDeclaration, loop: DictionaryLoop, context: DictionaryContext): boolean {
  const initial = value.getInitializer();
  if (initial === undefined) {
    return false;
  }
  const expression = referenceResolutionServices.unwrapExpression(initial);
  const services = { ...referenceResolutionServices, readCallReturnProgram, resolveStableExpression };
  const inputs: ReturnedValueInputs = {
    terminals: (call: CallExpression): boolean => readNativeStringCallWith(call, context.observations, services).kind === "resolved",
    bindings: context.bindings,
    explicitAbsentReturns: true,
  };
  const selector = Node.isElementAccessExpression(expression) ? expression.getArgumentExpression() : undefined;
  if (Node.isElementAccessExpression(expression) && selector !== undefined && localVariable(selector) === loop.element) {
    const projected = loop.values.map((key) => readReturnedValue(expression.getExpression(), [key], context.observations, inputs));
    return (
      projected.every((source) => source.kind === "resolved") &&
      projected.some((source) => source.value.some((retained) => retainedDictionarySource(retained, ownCallable(value))))
    );
  }
  if (Node.isPropertyAccessExpression(expression) || Node.isCallExpression(expression)) {
    const sources = readReturnedValue(initial, [], context.observations, inputs);
    return sources.kind === "resolved" && sources.value.some((retained) => retainedDictionarySource(retained, ownCallable(value)));
  }
  const scalar = readStaticAuthoredValue(expression);
  return scalar.kind === "resolved" && scalar.value.kind === "scalar" && typeof scalar.value.value === "string";
}

function optionalDictionaryWriter(
  statement: MorphNode,
  binding: MorphNode,
  loop: DictionaryLoop,
  context: DictionaryContext,
): ReturnedDictionaryWrite | undefined {
  if (!Node.isIfStatement(statement) || statement.getElseStatement() !== undefined) {
    return;
  }
  const condition = statement.getExpression();
  const branch = statement.getThenStatement();
  if (
    !Node.isBinaryExpression(condition) ||
    condition.getOperatorToken().getKind() !== SyntaxKind.ExclamationEqualsEqualsToken ||
    !condition.getRight().getType().isUndefined()
  ) {
    return;
  }
  const value = localVariable(condition.getLeft());
  const valueName = value?.getNameNode();
  if (
    value === undefined ||
    valueName === undefined ||
    !Node.isIdentifier(valueName) ||
    inspectReferenceWrites(valueName).kind !== "resolved" ||
    value.getInitializer() === undefined
  ) {
    return;
  }
  const writes = Node.isBlock(branch) ? branch.getStatements() : [branch];
  const write = writes.length === 1 && writes[0] !== undefined ? dictionaryWriter(writes[0], binding, loop, true) : undefined;
  return write !== undefined &&
    localVariable(write.value) === value &&
    value.getType().getNonNullableType().isString() &&
    retainedDictionaryArm(value, loop, context)
    ? write
    : undefined;
}

function dictionaryLoopWrites(loop: DictionaryLoop, binding: MorphNode, context: DictionaryContext): readonly ReturnedDictionaryWrite[] | undefined {
  const body = loop.node.getStatement();
  const statements = Node.isBlock(body) ? body.getStatements() : [body];
  const writes: ReturnedDictionaryWrite[] = [];
  for (const statement of statements) {
    if (Node.isVariableStatement(statement)) {
      const declarations = statement.getDeclarations();
      if (statement.getDeclarationKind() !== VariableDeclarationKind.Const || declarations.length !== 1 || declarations[0]?.getInitializer() === undefined) {
        return;
      }
      continue;
    }
    const write = dictionaryWriter(statement, binding, loop, false) ?? optionalDictionaryWriter(statement, binding, loop, context);
    if (write === undefined) {
      return;
    }
    writes.push(write);
  }
  return writes.length === 0 ? undefined : writes;
}

interface DictionaryBinding {
  readonly binding: import("ts-morph").VariableDeclaration;
  readonly scope: MorphNode;
  readonly name: import("ts-morph").Identifier;
  readonly body: import("ts-morph").Block;
}

function dictionaryBinding(value: MorphNode): DictionaryBinding | undefined {
  const binding = localVariable(value);
  const scope = binding === undefined ? undefined : ownCallable(binding);
  const name = binding?.getNameNode();
  const initial = binding?.getInitializer();
  const body =
    scope !== undefined &&
    (Node.isFunctionDeclaration(scope) || Node.isFunctionExpression(scope) || Node.isArrowFunction(scope) || Node.isMethodDeclaration(scope))
      ? scope.getBody()
      : undefined;
  const returned = value.getParent();
  if (
    binding === undefined ||
    name === undefined ||
    !Node.isIdentifier(name) ||
    inspectBindingReassignment(name).kind !== "resolved" ||
    initial === undefined ||
    !Node.isObjectLiteralExpression(initial) ||
    initial.getProperties().length > 0 ||
    body === undefined ||
    !Node.isBlock(body) ||
    !Node.isReturnStatement(returned) ||
    returned.getExpression() !== value
  ) {
    return;
  }
  const statements = body.getStatements();
  const initialized = binding.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  if (statements[0] !== initialized || initialized?.getDeclarationKind() !== VariableDeclarationKind.Const || statements.at(-1) !== returned) {
    return;
  }
  return scope === undefined ? undefined : { binding, scope, name, body };
}

/** Read finite tuple-indexed returned-map writes; optional keys stay optional and metadata remains untrusted. */
export function readReturnedDictionary(input: ReturnedDictionaryInput): ReturnedDictionaryResult {
  if (input.value.wasForgotten()) {
    return unqualified(input.value, "Returned dictionary received a forgotten native value.");
  }
  const captured = readCallReturnProgram(input.value, input.observations);
  if (captured.kind === "unresolved") {
    return unqualified(captured.node, captured.detail);
  }
  const bound = dictionaryBinding(input.value);
  if (bound === undefined) {
    return unqualified(input.value, "Returned dictionary requires an initial immutable empty-object binding and direct final return.");
  }
  const { binding, scope, name, body } = bound;
  const statements = body.getStatements();
  const loops = statements.slice(1, -1).map(dictionaryLoop);
  if (loops.length === 0 || loops.some((loop) => loop === undefined)) {
    return unqualified(input.value, "Returned dictionary writes require actual immutable nonempty authored tuple loops.");
  }
  const writes: ReturnedDictionaryWrite[] = [];
  const origins: MorphNode[] = [];
  for (const loop of loops) {
    if (loop === undefined) {
      continue;
    }
    const found = dictionaryLoopWrites(loop, binding, { observations: input.observations, bindings: input.bindings ?? new Map() });
    if (found === undefined) {
      return unqualified(loop.node, "Returned dictionary has an unknown key, write, guard or empty writer.");
    }
    writes.push(...found);
    origins.push(...loop.origins);
  }
  const accepted = new Set([
    input.value.compilerNode,
    ...writes.map(
      (write) =>
        (Node.isExpressionStatement(write.statement) ? write.statement.getExpression() : write.statement)
          .getFirstChildByKind(SyntaxKind.ElementAccessExpression)
          ?.getExpression().compilerNode,
    ),
  ]);
  if (referencesOf(name, scope).some((reference) => !accepted.has(reference.compilerNode))) {
    return unqualified(input.value, "Returned dictionary has an unaccounted write, read or escape.");
  }
  return {
    kind: "qualified",
    binding,
    returned: input.value,
    keys: [...new Set(writes.flatMap((write) => write.keys))],
    writes,
    vocabularyOrigins: origins,
    dataTrust: { kind: "unqualified" },
  };
}
