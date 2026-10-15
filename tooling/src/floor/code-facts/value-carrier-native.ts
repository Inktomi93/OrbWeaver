// Opted-in native callback/cache interpretation; the value carrier remains the only traversal.
import type { CallExpression, Node } from "ts-morph";
import { Node as N, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { readCallReturnProgram, runtimeUndefinedValue } from "./call-supplied.ts";
import { readStaticString, referenceResolutionServices, resolveGlobalMemberOrigin, staticMemberAccess } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import type { CallReturnProgram, NativeValueTransferServices, ReferenceFact, ReturnedValueContext, ReturnedValueSource } from "./reference-fact-contract.ts";
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

function nativeMapConstruction(value: Node, context: NativeTransferContext): string | undefined {
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
    ["Map", "WeakMap"].includes(origin.value.globalName) &&
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
    !origin.value.declarations.every((declaration) => program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode)) ||
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
  if (receivers.value.some((source) => !source.present || source.path.length > 0 || nativeMapConstruction(source.value, context) !== receiverKind)) {
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

function returnedNativeCallValue(
  call: CallExpression,
  path: readonly string[],
  context: NativeTransferContext,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  if (context.program?.byCall.has(call.compilerNode) !== true) {
    return context.services.refusal(call, "missing", "native value call was not captured");
  }
  if (nativeMemo(call, context)) {
    const factory = call.getArguments()[0];
    return factory === undefined
      ? context.services.refusal(call, "missing", "native memo has no supplied factory")
      : nativeCallbackValues(factory, undefined, path, { ...context, bindings: new Map() });
  }
  return returnedNativeMap(call, path, context);
}
