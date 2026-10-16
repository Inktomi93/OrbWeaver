// Captured native value transfers; callback/cache interpretation remains explicitly opted in.
import type { CallExpression, Node, ts } from "ts-morph";
import { Node as N, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { readCallReturnProgram, runtimeUndefinedValue } from "./call-supplied.ts";
import { readStaticString, referenceResolutionServices, resolveGlobalMemberOrigin, staticMemberAccess } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import type {
  CallReturnProgram,
  NativeResourceRegistration,
  NativeValueTransferServices,
  ReferenceFact,
  ReturnedValueContext,
  ReturnedValueSource,
} from "./reference-fact-contract.ts";
import { isReferenceWriteTarget, unprovenReferenceUse } from "./reference-fact-writes.ts";

/** Native field origins retain the whole formal's write/escape obligation before any actual substitution. */
export function nativeParameterFieldsUnchanged(parameter: import("ts-morph").ParameterDeclaration, program: CallReturnProgram): boolean {
  if (readCallReturnProgram(parameter, { programs: [program] }).kind !== "resolved") {
    return false;
  }
  const name = parameter.getNameNode();
  if (!N.isIdentifier(name) || referenceResolutionServices.inspectReferenceWrites(name).kind !== "resolved") {
    return false;
  }
  return (
    unprovenReferenceUse(name, (use) => {
      const parent = use.getParent();
      if (parent === undefined) {
        return false;
      }
      const member = staticMemberAccess(parent);
      if (member?.receiver === use) {
        return !isReferenceWriteTarget(parent);
      }
      if (
        !N.isVariableDeclaration(parent) ||
        parent.getInitializer() !== use ||
        parent.getParentIfKind(SyntaxKind.VariableDeclarationList)?.getDeclarationKind() !== VariableDeclarationKind.Const
      ) {
        return false;
      }
      const pattern = parent.getNameNode();
      return (
        N.isObjectBindingPattern(pattern) &&
        pattern
          .getElements()
          .every((element) => element.getDotDotDotToken() === undefined && element.getInitializer() === undefined && N.isIdentifier(element.getNameNode()))
      );
    }) === undefined
  );
}

interface NativeTransferContext extends ReturnedValueContext {
  readonly services: NativeValueTransferServices;
}

/** Native result interpretation is reached only through the existing value-carrier traversal. */
export function readNativeReturnedCall(
  call: CallExpression,
  path: readonly string[],
  context: ReturnedValueContext,
  services: NativeValueTransferServices,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  return returnedNativeCallValue(call, path, { ...context, services });
}

/** An exact same-binding undefined guard refines only its actual native get return. */
export function readNativeRetainedReturn(
  value: Node,
  path: readonly string[],
  context: ReturnedValueContext,
  services: NativeValueTransferServices,
): ReferenceFact<readonly ReturnedValueSource[]> {
  return retainedNativeReturn(value, path, { ...context, services });
}

function retainedNativeReturn(value: Node, path: readonly string[], context: NativeTransferContext): ReferenceFact<readonly ReturnedValueSource[]> {
  const sources = context.services.readValue(value, path, context);
  const binding = unwrapTarget(value);
  if (!(context.nativeValueTransfers && N.isIdentifier(binding)) || sources.kind === "unresolved") {
    return sources;
  }
  const returned = value.getParent();
  const guard = returned?.getParent();
  let conditional = N.isIfStatement(guard) ? guard : undefined;
  if (N.isBlock(guard) && guard.getStatements().length === 1) {
    conditional = guard.getParentIfKind(SyntaxKind.IfStatement);
  }
  const condition = conditional?.getExpression();
  if (
    !N.isReturnStatement(returned) ||
    conditional === undefined ||
    (conditional.getThenStatement() !== guard && conditional.getThenStatement() !== returned) ||
    !N.isBinaryExpression(condition) ||
    condition.getOperatorToken().getKind() !== SyntaxKind.ExclamationEqualsEqualsToken ||
    !(N.isIdentifier(condition.getRight()) && runtimeUndefinedValue(condition.getRight()))
  ) {
    return sources;
  }
  const left = condition.getLeft();
  const declaration = lexicalReferenceSymbol(binding)?.getValueDeclaration();
  const initial = N.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  if (
    !N.isIdentifier(left) ||
    lexicalReferenceSymbol(left)?.compilerSymbol !== lexicalReferenceSymbol(binding)?.compilerSymbol ||
    initial === undefined ||
    !N.isCallExpression(initial) ||
    nativeMapMethod(initial, context) !== "get"
  ) {
    return sources;
  }
  const retained = sources.value.filter((source) => source.present && !runtimeUndefinedValue(unwrapTarget(source.value)));
  return retained.length === 0
    ? context.services.refusal(value, "missing", "guarded native get return has no retained value alternative")
    : { ...sources, value: retained };
}

function nativeMemo(call: CallExpression, context: NativeTransferContext): boolean {
  const origin = context.program?.nativeSymbolServices?.callableOrigin(call);
  const signature = call.getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration();
  return (
    context.program !== undefined &&
    origin?.kind === "resolved" &&
    origin.value.target.kind === "module" &&
    origin.value.target.canonical.kind === "project" &&
    origin.value.target.canonical.exportedName === "useMemo" &&
    signature !== undefined &&
    context.program.nativeSymbolServices?.declaredByPackage([signature], "@types/react") === true &&
    signature.compilerNode === origin.value.target.canonical.declaration.compilerNode &&
    context.program.program.isSourceFileFromExternalLibrary(signature.getSourceFile().compilerNode)
  );
}

function nativeCallbackValues(
  callback: Node,
  key: Node | undefined,
  path: readonly string[],
  context: NativeTransferContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const functions = context.services.readValue(callback, [], context);
  if (functions.kind === "unresolved") {
    return functions;
  }
  return context.services.alternatives(
    callback,
    functions.value.map((source) => nativeCallbackSource(source, key, path, context)),
  );
}

function nativeCallbackFunction(
  source: ReturnedValueSource,
  key: Node | undefined,
  context: NativeTransferContext,
): ReferenceFact<import("ts-morph").ArrowFunction | import("ts-morph").FunctionExpression | import("ts-morph").FunctionDeclaration> {
  const fn = source.value;
  if (!source.present || source.path.length > 0 || !(N.isArrowFunction(fn) || N.isFunctionExpression(fn) || N.isFunctionDeclaration(fn))) {
    return context.services.refusal(source.value, "unsupported", "native callback has no closed actual function body");
  }
  if (fn.isAsync() || (!N.isArrowFunction(fn) && fn.isGenerator())) {
    return context.services.refusal(fn, "unsupported", "native callback has an async/generator result rather than the supplied value");
  }
  const captured = context.program === undefined ? undefined : readCallReturnProgram(fn, { programs: [context.program] });
  if (captured?.kind !== "resolved") {
    return context.services.refusal(fn, "unsupported", "native callback body is outside the captured world/source epoch");
  }
  const params = fn.getParameters();
  if (
    params.length > (key === undefined ? 0 : 1) ||
    params.some((formal) => formal.isRestParameter() || formal.getInitializer() !== undefined || !N.isIdentifier(formal.getNameNode()))
  ) {
    return context.services.refusal(fn, "unsupported", "native callback formals are not closed");
  }
  return { kind: "resolved", value: fn, trace: { declarations: [fn], origin: fn } };
}

function nativeCallbackSource(
  source: ReturnedValueSource,
  key: Node | undefined,
  path: readonly string[],
  context: NativeTransferContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const callable = nativeCallbackFunction(source, key, context);
  if (callable.kind === "unresolved") {
    return callable;
  }
  const fn = callable.value;
  const params = fn.getParameters();
  const bindings = new Map(source.bindings);
  const parameter = params[0];
  if (parameter !== undefined && key !== undefined) {
    bindings.set(parameter, key);
  }
  const returns =
    context.program?.nativeReturnPaths?.(fn, context.explicitAbsentReturns) ??
    context.services.refusal(fn, "unsupported", "native return-owner projection was not captured");
  return returns.kind === "unresolved"
    ? returns
    : context.services.alternatives(
        fn,
        returns.value.map((value) =>
          N.isReturnStatement(value) && value.getExpression() === undefined
            ? context.services.leaf(value, path, { ...context, bindings }, false)
            : context.services.readValue(value, path, { ...context, bindings }),
        ),
      );
}

function nativeConstruction(value: Node, context: NativeTransferContext): string | undefined {
  if (!N.isNewExpression(value) || context.program === undefined) {
    return;
  }
  if (readCallReturnProgram(value, { programs: [context.program] }).kind !== "resolved") {
    return;
  }
  const program = context.program;
  const origin = resolveGlobalMemberOrigin(value.getExpression());
  const signature = value.getProject().getTypeChecker().getResolvedSignature(value)?.getDeclaration();
  if (origin.kind !== "resolved") {
    return;
  }
  const native =
    origin.value.memberPath.length === 0 &&
    signature !== undefined &&
    program.program.isSourceFileDefaultLibrary(signature.getSourceFile().compilerNode) &&
    origin.value.declarations.some((declaration) => program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode));
  return native ? origin.value.globalName : undefined;
}

function nativeMapMethod(call: CallExpression, context: NativeTransferContext): string | undefined {
  const program = context.program;
  const member = context.program?.nativeSymbolServices?.memberOrigin(call.getExpression());
  const signature = call.getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration();
  if (
    member?.kind !== "resolved" ||
    signature === undefined ||
    program === undefined ||
    referenceResolutionServices.inspectSymbolWrites(member.value.symbol, call.getExpression()).kind !== "resolved"
  ) {
    return;
  }
  const parent = signature.getParent();
  if (!(N.isInterfaceDeclaration(parent) && ["Map", "WeakMap"].includes(parent.getName()))) {
    return;
  }
  const symbol = parent.getSymbol()?.compilerSymbol;
  const declarations = symbol === undefined ? [] : (program.program.getTypeChecker().getMergedSymbol(symbol).declarations ?? []);
  if (!declarations.some((declaration) => program.program.isSourceFileDefaultLibrary(declaration.getSourceFile()))) {
    return;
  }
  return ["get", "set", "getOrInsertComputed"].includes(member.value.name) ? member.value.name : undefined;
}

function nativeMapUses(receiver: Node, context: NativeTransferContext): ReferenceFact<readonly CallExpression[]> {
  const calls = new Set<CallExpression>();
  const name = unwrapTarget(receiver);
  if (!N.isIdentifier(name)) {
    return context.services.refusal(receiver, "unsupported", "native cache receiver has no closed binding uses");
  }
  const unknown = unprovenReferenceUse(name, (use) => {
    const access = use.getParent();
    const member = access === undefined ? undefined : staticMemberAccess(access);
    const call = access?.getParent();
    if (
      member?.receiver !== use ||
      !N.isCallExpression(call) ||
      call.getExpression() !== access ||
      nativeMapMethod(call, context) === undefined ||
      context.program?.byCall.has(call.compilerNode) !== true
    ) {
      return false;
    }
    calls.add(call);
    return true;
  });
  return unknown === undefined
    ? { kind: "resolved", value: [...calls], trace: { declarations: [], origin: receiver } }
    : context.services.refusal(unknown, "unsupported", "native cache receiver escapes or has an unknown/mutating operation");
}

function sameCacheKey(left: Node, right: Node, context: NativeTransferContext): boolean {
  const lhs = context.services.readValue(left, [], context);
  const rhs = context.services.readValue(right, [], context);
  if (lhs.kind !== "resolved" || rhs.kind !== "resolved" || lhs.value.length !== 1 || rhs.value.length !== 1) {
    return false;
  }
  const l = lhs.value[0];
  const r = rhs.value[0];
  if (l === undefined || r === undefined || !l.present || !r.present || l.path.length > 0 || r.path.length > 0) {
    return false;
  }
  if (l.value.compilerNode === r.value.compilerNode) {
    return true;
  }
  if (
    N.isIdentifier(l.value) &&
    N.isIdentifier(r.value) &&
    lexicalReferenceSymbol(l.value)?.compilerSymbol === lexicalReferenceSymbol(r.value)?.compilerSymbol
  ) {
    return true;
  }
  const ls = readStaticString(l.value);
  const rs = readStaticString(r.value);
  return ls.kind === "resolved" && rs.kind === "resolved" && ls.value === rs.value;
}

function nativeMapInitialValues(construction: Node, path: readonly string[], context: NativeTransferContext): ReferenceFact<readonly ReturnedValueSource[]> {
  if (!N.isNewExpression(construction)) {
    return context.services.refusal(construction, "unsupported", "native map initializer has no construction");
  }
  const program = context.program;
  const args = construction.getArguments();
  if (args.length === 0) {
    return { kind: "resolved", value: [], trace: { declarations: [], origin: construction } };
  }
  const initial = args[0];
  if (args.length !== 1 || !N.isCallExpression(initial)) {
    return context.services.refusal(construction, "unsupported", "native map initialization has no actual mapped tuple source");
  }
  const member = staticMemberAccess(initial.getExpression());
  const origin = context.program?.nativeSymbolServices?.memberOrigin(initial.getExpression());
  if (
    member?.name !== "map" ||
    origin?.kind !== "resolved" ||
    program === undefined ||
    !origin.value.declarations.every((candidate) => program.program.isSourceFileDefaultLibrary(candidate.getSourceFile().compilerNode)) ||
    referenceResolutionServices.inspectSymbolWrites(origin.value.symbol, initial.getExpression()).kind !== "resolved" ||
    !program.byCall.has(initial.compilerNode)
  ) {
    return context.services.refusal(initial, "unsupported", "map entries require the actual captured native array map");
  }
  const inputs = context.services.readValue(member.receiver, [], context);
  if (inputs.kind === "unresolved") {
    return inputs;
  }
  if (
    inputs.value.some(
      (input) =>
        !input.present ||
        input.path.length > 0 ||
        !(
          N.isArrayLiteralExpression(input.value) ||
          (N.isIdentifier(input.value) && N.isParameterDeclaration(lexicalReferenceSymbol(input.value)?.getValueDeclaration()))
        ),
    )
  ) {
    return context.services.refusal(initial, "unsupported", "mapped entries have no actual input collection");
  }
  if (inputs.value.every((input) => N.isArrayLiteralExpression(input.value) && input.value.getElements().length === 0)) {
    return { kind: "resolved", value: [], trace: inputs.trace };
  }
  const callback = initial.getArguments()[0];
  if (callback === undefined) {
    return context.services.refusal(initial, "missing", "native array map has no actual callback");
  }
  const callbacks = context.services.readValue(callback, [], context);
  if (callbacks.kind === "unresolved") {
    return callbacks;
  }
  return context.services.alternatives(
    initial,
    callbacks.value.map((alternative) => {
      const fn = alternative.value;
      if (!alternative.present || alternative.path.length > 0 || !(N.isArrowFunction(fn) || N.isFunctionExpression(fn)) || fn.getParameters().length !== 1) {
        return context.services.refusal(callback, "unsupported", "mapped entries have no closed single-element callback");
      }
      if (fn.isAsync() || (N.isFunctionExpression(fn) && fn.isGenerator())) {
        return context.services.refusal(fn, "unsupported", "native mapped tuples cannot be async/generator results");
      }
      const parameter = fn.getParameters()[0];
      if (
        parameter === undefined ||
        !N.isIdentifier(parameter.getNameNode()) ||
        parameter.isRestParameter() ||
        parameter.getInitializer() !== undefined ||
        readCallReturnProgram(fn, { programs: [program] }).kind !== "resolved"
      ) {
        return context.services.refusal(fn, "unsupported", "mapped element has no captured actual formal");
      }
      const returns =
        context.program?.nativeReturnPaths?.(fn, false) ?? context.services.refusal(fn, "unsupported", "native return-owner projection was not captured");
      if (returns.kind === "unresolved") {
        return returns;
      }
      const iterations = new Map(context.nativeIterations).set(parameter, { call: initial, collection: member.receiver, parameter });
      const next = { ...context, bindings: alternative.bindings, nativeIterations: iterations };
      return context.services.alternatives(
        initial,
        returns.value.map((returned) => {
          const tuple = unwrapTarget(returned);
          if (
            !N.isArrayLiteralExpression(tuple) ||
            tuple.getElements().length !== 2 ||
            tuple.getElements().some((element) => N.isSpreadElement(element) || N.isOmittedExpression(element))
          ) {
            return context.services.refusal(returned, "unsupported", "map entries require both actual tuple positions");
          }
          const key = context.services.readValue(tuple, ["0"], next);
          const value = context.services.readValue(tuple, ["1", ...path], next);
          if (key.kind === "unresolved") {
            return key;
          }
          if (value.kind === "unresolved") {
            return value;
          }
          if (
            key.value.some((source) => !source.present || source.nativeIteration?.parameter !== parameter) ||
            value.value.some((source) => !source.present || source.nativeIteration?.parameter !== parameter)
          ) {
            return context.services.refusal(tuple, "unsupported", "mapped tuple does not retain its actual element key and value");
          }
          return value;
        }),
      );
    }),
  );
}

function nativeWriterReachable(call: CallExpression, context: NativeTransferContext): boolean {
  const parent = call.getParent();
  if (N.isExpressionStatement(parent) && parent.getExpression() === call) {
    return context.program?.nativeStatementReachable?.(parent).kind === "resolved";
  }
  if (!N.isVariableDeclaration(parent) || parent.getInitializer() !== call) {
    return false;
  }
  const list = parent.getParentIfKind(SyntaxKind.VariableDeclarationList);
  const statement = list?.getParent();
  return (
    list?.getDeclarationKind() === VariableDeclarationKind.Const &&
    list.getDeclarations().length === 1 &&
    N.isVariableStatement(statement) &&
    context.program?.nativeStatementReachable?.(statement).kind === "resolved"
  );
}

function returnedNativeMap(
  call: CallExpression,
  path: readonly string[],
  context: NativeTransferContext,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  const method = nativeMapMethod(call, context);
  const member = staticMemberAccess(call.getExpression());
  if (method === undefined || member === undefined || method === "set") {
    return;
  }
  const key = call.getArguments()[0];
  if (key === undefined) {
    return context.services.refusal(call, "missing", "native cache lookup has no supplied key");
  }
  const receivers = context.services.readValue(member.receiver, [], context);
  if (receivers.kind === "unresolved") {
    return receivers;
  }
  const signatureParent = call.getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration().getParent();
  const receiverKind = N.isInterfaceDeclaration(signatureParent) ? signatureParent.getName() : undefined;
  if (receivers.value.some((source) => !source.present || source.path.length > 0 || nativeConstruction(source.value, context) !== receiverKind)) {
    return context.services.refusal(call, "unsupported", "native cache receiver has no actual native construction alternatives");
  }

  const uses = nativeMapUses(member.receiver, context);
  if (uses.kind === "unresolved") {
    return uses;
  }
  const writes = uses.value.filter((use) => nativeMapMethod(use, context) !== "get");
  if (writes.some((write) => !nativeWriterReachable(write, context))) {
    return context.services.refusal(call, "unsupported", "native cache writer has no closed reachable statement contribution");
  }
  if (writes.length > 1 || (writes.length > 0 && receivers.value.some((source) => N.isNewExpression(source.value) && source.value.getArguments().length > 0))) {
    return context.services.refusal(call, "unsupported", "native cache has competing overwrite/initializer writer alternatives");
  }
  if (
    writes.some((write) => {
      const writtenKey = write.getArguments()[0];
      return writtenKey === undefined || !sameCacheKey(key, writtenKey, context);
    })
  ) {
    return context.services.refusal(call, "unsupported", "native cache writer has an unmatched key alternative");
  }
  // Cache and memo reuse preserve authored origins, not current invocation argument correlations.
  const values = writes.map((write) => {
    const value = write.getArguments()[1];
    if (value === undefined) {
      return context.services.refusal(write, "missing", "native cache writer has no supplied value");
    }
    return nativeMapMethod(write, context) === "getOrInsertComputed"
      ? nativeCallbackValues(value, write.getArguments()[0], path, { ...context, bindings: new Map() })
      : context.services.readValue(value, path, { ...context, bindings: new Map() });
  });
  const initial = receivers.value.map((source) => nativeMapInitialValues(source.value, path, { ...context, bindings: source.bindings }));
  const all = context.services.alternatives(call, [...values, ...initial]);
  if (all.kind === "unresolved") {
    return all;
  }
  const carried = { ...all, value: all.value.map((source) => ({ ...source, nativeLookup: { call, key } })) };
  return method === "get" ? context.services.alternatives(call, [carried, context.services.leaf(call, path, context, false)]) : carried;
}

function nativeFreezeCandidate(expression: Node): boolean {
  return (
    N.isIdentifier(expression) ||
    (N.isPropertyAccessExpression(expression) && expression.getName() === "freeze") ||
    (N.isElementAccessExpression(expression) && staticMemberAccess(expression)?.name === "freeze")
  );
}

function nativeFreezeArgument(call: CallExpression, context: NativeTransferContext): ReferenceFact<Node> | undefined {
  const captured = context.program === undefined ? undefined : readCallReturnProgram(call, { programs: [context.program] });
  if (captured?.kind === "unresolved") {
    return captured;
  }
  if (captured === undefined || !captured.value.byCall.has(call.compilerNode)) {
    return context.services.refusal(call, "missing", "native freeze operation was not captured");
  }
  const expression = unwrapTarget(call.getExpression());
  if (!nativeFreezeCandidate(expression)) {
    return;
  }
  const origin = resolveGlobalMemberOrigin(expression);
  if (origin.kind !== "resolved" || origin.value.globalName !== "Object" || origin.value.memberPath.length !== 1 || origin.value.memberPath[0] !== "freeze") {
    return;
  }
  const program = captured.value;
  if (
    origin.value.declarations.length === 0 ||
    !origin.value.declarations.every((declaration) => program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode))
  ) {
    return context.services.refusal(call, "unsupported", "freeze identity is not supplied by the captured native libraries");
  }
  const arguments_ = call.getArguments();
  const argument = arguments_[0];
  if (arguments_.length !== 1 || argument === undefined || N.isSpreadElement(argument)) {
    return context.services.refusal(call, "unsupported", "native freeze requires one explicit actual value");
  }
  const effects = context.services.inheritedEffects(call, context);
  if (effects.kind === "unresolved") {
    return effects;
  }
  return { kind: "resolved", value: argument, trace: { declarations: origin.value.declarations, origin: call } };
}

/** The same native operation/argument/effect proof serves identity transfer and output handoff. */
export function readNativeFreezeArgument(
  call: CallExpression,
  context: ReturnedValueContext,
  services: NativeValueTransferServices,
): ReferenceFact<Node> | undefined {
  return nativeFreezeArgument(call, { ...context, services });
}

function returnedFrozenValue(
  call: CallExpression,
  path: readonly string[],
  context: NativeTransferContext,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  const argument = nativeFreezeArgument(call, context);
  // Freeze returns the same value; it grants neither deep immutability nor readable getter/Proxy fields.
  return argument?.kind === "resolved" ? context.services.readValue(argument.value, path, context) : argument;
}

function capturedNativeProjection(
  call: CallExpression,
  path: readonly string[],
  context: NativeTransferContext,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  return (
    context.program?.nativeNamespaceValue?.(call, path, context, context.services) ??
    context.program?.nativeParsedValue?.(call, path, context, context.services)
  );
}

function returnedNativeCallValue(
  call: CallExpression,
  path: readonly string[],
  context: NativeTransferContext,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  if (context.program?.byCall.has(call.compilerNode) !== true) {
    return context.nativeValueTransfers || context.callableValues === true
      ? context.services.refusal(call, "missing", "native value call was not captured")
      : undefined;
  }
  const parsed = capturedNativeProjection(call, path, context);
  if (parsed !== undefined) {
    return parsed;
  }
  const frozen = returnedFrozenValue(call, path, context);
  if (frozen !== undefined) {
    return frozen;
  }
  if (!(context.nativeValueTransfers || context.callableValues === true)) {
    return;
  }
  const resource = readNativeResourceRegistration(call, context, context.services);
  if (resource !== undefined) {
    return resource.kind === "unresolved" ? resource : context.services.readValue(resource.value.argument, path, context);
  }
  if (!context.nativeValueTransfers) {
    return;
  }
  if (nativeMemo(call, context)) {
    const factory = call.getArguments()[0];
    return factory === undefined
      ? context.services.refusal(call, "missing", "native memo has no supplied factory")
      : nativeCallbackValues(factory, undefined, path, { ...context, bindings: new Map() });
  }
  return returnedNativeMap(call, path, context);
}

const NATIVE_RESOURCE_STACKS = ["DisposableStack", "AsyncDisposableStack"] as const;
const NATIVE_DISPOSAL_KEYS = ["dispose", "asyncDispose"] as const;

/** A well-known native symbol stays a symbol; it cannot collide with a carried string member. */
export function nativeDisposalPropertyKey(name: Node, program: CallReturnProgram | undefined): ts.Symbol | undefined {
  if (!N.isComputedPropertyName(name) || program === undefined || readCallReturnProgram(name, { programs: [program] }).kind !== "resolved") {
    return;
  }
  const origin = resolveGlobalMemberOrigin(name.getExpression());
  if (origin.kind !== "resolved" || origin.value.globalName !== "Symbol" || origin.value.memberPath.length !== 1) {
    return;
  }
  const member = origin.value.memberPath[0];
  if (
    !(
      NATIVE_DISPOSAL_KEYS.some((key) => key === member) &&
      origin.value.declarations.every((candidate) => program.program.isSourceFileDefaultLibrary(candidate.getSourceFile().compilerNode))
    )
  ) {
    return;
  }
  const declaration = origin.value.declarations.find((value) => N.isPropertySignature(value) && value.getName() === member);
  return declaration?.getSymbol()?.compilerSymbol;
}

interface ResourceMethod {
  readonly receiver: Node;
  readonly stack: string;
  readonly name: string;
}

function nativeResourceMethod(call: CallExpression, context: NativeTransferContext): ResourceMethod | undefined {
  const program = context.program;
  const member = program?.nativeSymbolServices?.memberOrigin(call.getExpression());
  const signature = call.getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration();
  const owner = signature?.getParent();
  if (
    program === undefined ||
    member?.kind !== "resolved" ||
    signature === undefined ||
    !N.isInterfaceDeclaration(owner) ||
    !NATIVE_RESOURCE_STACKS.some((name) => name === owner.getName())
  ) {
    return;
  }
  if (
    !(
      program.program.isSourceFileDefaultLibrary(signature.getSourceFile().compilerNode) &&
      member.value.declarations.every((declaration) => program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode))
    ) ||
    referenceResolutionServices.inspectSymbolWrites(member.value.symbol, call.getExpression()).kind !== "resolved"
  ) {
    return;
  }
  return { receiver: member.value.receiver, stack: owner.getName(), name: member.value.name };
}

function resourceReceiverClosed(receiver: Node, stack: string, context: NativeTransferContext): boolean {
  const name = unwrapTarget(receiver);
  if (N.isNewExpression(name)) {
    return true;
  }
  if (!N.isIdentifier(name)) {
    return false;
  }
  return (
    unprovenReferenceUse(name, (use) => {
      const access = use.getParent();
      const call = access?.getParent();
      if (
        !N.isCallExpression(call) ||
        call.getExpression() !== access ||
        staticMemberAccess(access)?.receiver !== use ||
        context.program?.byCall.has(call.compilerNode) !== true
      ) {
        return false;
      }
      const method = nativeResourceMethod(call, context);
      return method?.stack === stack;
    }) === undefined
  );
}

/** Native disposal binds the resource as this; receiver-dependent effects need a separate closed proof. */
export function nativeDisposerReceiverClosed(value: Node): boolean {
  if (!(N.isMethodDeclaration(value) || N.isArrowFunction(value) || N.isFunctionExpression(value) || N.isFunctionDeclaration(value))) {
    return false;
  }
  const body = value.getBody();
  if (body === undefined) {
    return false;
  }
  // Defaults and binding patterns execute with the native receiver before the body; type annotations do not.
  const runtime = [
    body,
    ...value.getParameters().flatMap((parameter) => {
      const initializer = parameter.getInitializer();
      return initializer === undefined ? [parameter.getNameNode()] : [parameter.getNameNode(), initializer];
    }),
  ];
  return runtime.every(
    (node) =>
      node.getKind() !== SyntaxKind.ThisKeyword &&
      node.getKind() !== SyntaxKind.SuperKeyword &&
      node.getFirstDescendantByKind(SyntaxKind.ThisKeyword) === undefined &&
      node.getFirstDescendantByKind(SyntaxKind.SuperKeyword) === undefined,
  );
}

function resourceDisposalSlots(object: import("ts-morph").ObjectLiteralExpression, context: NativeTransferContext): ReferenceFact<ReadonlyMap<string, Node>> {
  const slots = new Map<string, Node>();
  for (const property of object.getProperties()) {
    if (N.isSpreadAssignment(property)) {
      return context.services.refusal(property, "unsupported", "native resource disposal through a spread is not closed");
    }
    const name = property.getNameNode();
    const key = nativeDisposalPropertyKey(name, context.program);
    if (key !== undefined) {
      slots.set(key.getName(), property);
    } else if (N.isComputedPropertyName(name) || property.getName() === "__proto__") {
      return context.services.refusal(property, "unsupported", "native resource has an unresolved own disposal descriptor");
    }
  }
  return { kind: "resolved", value: slots, trace: { declarations: [], origin: object } };
}

function resourceDisposalValue(property: Node, resource: ReturnedValueSource, context: NativeTransferContext): ReferenceFact<readonly ReturnedValueSource[]> {
  if (N.isGetAccessorDeclaration(property) || N.isSetAccessorDeclaration(property)) {
    return context.services.refusal(property, "unsupported", "native resource disposal accessor effects are not closed");
  }
  if (N.isMethodDeclaration(property)) {
    return nativeDisposerReceiverClosed(property)
      ? {
          kind: "resolved",
          value: [{ value: property, bindings: resource.bindings, path: [], present: true }],
          trace: { declarations: [property], origin: property },
        }
      : context.services.refusal(property, "unsupported", "native disposer receiver effects are not closed");
  }
  const initial = N.isPropertyAssignment(property) ? property.getInitializer() : undefined;
  if (initial === undefined) {
    return context.services.refusal(property, "unsupported", "native resource disposal value has no actual initializer");
  }
  return context.services.readValue(initial, [], { ...context, bindings: resource.bindings });
}

function nullishResource(source: ReturnedValueSource): boolean {
  return source.present && source.path.length === 0 && (source.value.getKind() === SyntaxKind.NullKeyword || runtimeUndefinedValue(source.value));
}

function resourceDisposers(resource: ReturnedValueSource, stack: string, context: NativeTransferContext): ReferenceFact<readonly ReturnedValueSource[]> {
  const object = resource.value;
  if (nullishResource(resource)) {
    return { kind: "resolved", value: [], trace: { declarations: [], origin: object } };
  }
  if (!resource.present || resource.path.length > 0 || !N.isObjectLiteralExpression(object)) {
    return context.services.refusal(object, "unsupported", "native resource registration requires a closed actual own-object resource");
  }
  const slots = resourceDisposalSlots(object, context);
  if (slots.kind === "unresolved") {
    return slots;
  }
  const order = stack === "AsyncDisposableStack" ? [...NATIVE_DISPOSAL_KEYS].reverse() : [NATIVE_DISPOSAL_KEYS[0]];
  for (const key of order) {
    const property = slots.value.get(key);
    if (property === undefined) {
      continue;
    }
    const values = resourceDisposalValue(property, resource, context);
    if (values.kind === "unresolved") {
      return values;
    }
    if (values.value.every(nullishResource)) {
      continue;
    }
    return values.value.length > 0 && values.value.every((source) => source.present && source.path.length === 0 && nativeDisposerReceiverClosed(source.value))
      ? values
      : context.services.refusal(property, "unsupported", "native resource disposal value has no closed actual callable");
  }
  return context.services.refusal(object, "missing", "native resource has no proven own disposal method");
}

/** Native use returns its argument, but retaining the disposal consumers is a separate lifetime obligation. */
export function readNativeResourceRegistration(
  call: CallExpression,
  context: ReturnedValueContext,
  services: NativeValueTransferServices,
): ReferenceFact<NativeResourceRegistration> | undefined {
  if (staticMemberAccess(call.getExpression())?.name !== "use") {
    return;
  }
  const native = { ...context, services };
  const method = nativeResourceMethod(call, native);
  if (method === undefined || method.name !== "use") {
    return;
  }
  if (context.program?.byCall.has(call.compilerNode) !== true || readCallReturnProgram(call, { programs: [context.program] }).kind !== "resolved") {
    return services.refusal(call, "missing", "native resource registration is outside its captured call epoch");
  }
  const argument = call.getArguments()[0];
  if (argument === undefined || call.getArguments().length !== 1 || N.isSpreadElement(argument)) {
    return services.refusal(call, "unsupported", "native resource use requires one actual argument");
  }
  const receivers = services.readValue(method.receiver, [], context);
  if (receivers.kind === "unresolved") {
    return receivers;
  }
  if (
    receivers.value.length === 0 ||
    receivers.value.some((source) => !source.present || source.path.length > 0 || nativeConstruction(source.value, native) !== method.stack) ||
    ![
      method.receiver,
      ...receivers.trace.declarations.flatMap((declaration) => (N.isVariableDeclaration(declaration) ? [declaration.getNameNode()] : [])),
    ].every((receiver) => resourceReceiverClosed(receiver, method.stack, native))
  ) {
    return services.refusal(call, "unsupported", "native resource receiver has no closed unchanged construction");
  }
  const resources = services.readValue(argument, [], context);
  if (resources.kind === "unresolved") {
    return resources;
  }
  if (resources.value.length === 0) {
    return services.refusal(argument, "missing", "native resource registration has no actual value alternatives");
  }
  const disposers = services.alternatives(
    argument,
    resources.value.map((resource) => resourceDisposers(resource, method.stack, native)),
  );
  return disposers.kind === "unresolved" ? disposers : { ...disposers, value: { argument, disposers: disposers.value } };
}
