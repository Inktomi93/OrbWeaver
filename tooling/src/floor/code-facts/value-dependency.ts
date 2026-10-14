// Returned-value dependency over supplied native carriers; unsupported operations never lend their arguments an effect.
import type { CallExpression, Node as MorphNode, ts } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { readCallReturnProgram } from "./call-returns.ts";
import { inspectReferenceWrites, readMemberReference, referenceResolutionServices } from "./reference-fact.ts";
import { lexicalReferenceSymbol } from "./reference-fact-alias.ts";
import type { CallReturnProgram, ReturnedValueSource, ReturnedValueTerminals } from "./reference-fact-contract.ts";
import { resolveTypeMemberOrigin } from "./type-member-origin.ts";
import { resolveTypePropertyValue } from "./type-member-origin-core.ts";
import { readReturnedValue, referencesOf } from "./value-carrier.ts";
import type { OpaqueNativeValueBoundary, ValueDependencyContribution, ValueDependencyInput, ValueDependencyResult } from "./value-dependency-contract.ts";

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

function readLeaf(source: ReturnedValueSource, context: DependencyContext): DependencyRead {
  if (!source.present) {
    return unqualified(source.value, "A missing returned projection does not establish dependency.");
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
    if (source.path.length > 0) {
      return unqualified(source.value, "A projected native result has no proved input/result transfer for that projection.");
    }
    const transfer = readNativeValueTransfer(source.value, context);
    return transfer === undefined
      ? unqualified(source.value, "The returned operation has no proved native input/result transfer.")
      : dependencyUses(joined(transfer.inputs.map((input) => readDependency(input, [], inherited))), [source.value, ...transfer.declarations]);
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
  const carried = readReturnedValue(node, path, context.input.observations, { terminals: context.carriers, bindings: context.bindings });
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
  if (start !== 0 || statements.at(-1) !== returned) {
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
        return false;
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
            const sources = readReturnedValue(argument, [], context.input.observations, { terminals: context.carriers, bindings: context.bindings });
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
  return dependencyUses(joined(pushes.flatMap((call) => call.getArguments().map((argument) => readDependency(argument, [], context)))), [
    node,
    declaration,
    ...pushes,
  ]);
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
