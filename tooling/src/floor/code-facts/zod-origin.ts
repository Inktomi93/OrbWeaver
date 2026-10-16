// Zod factory call provenance through the canonical module-member reader. Unresolved calls are not proven origins.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallReturnProgram } from "./call-supplied.ts";
import { readMemberReference, referenceResolutionServices, resolveModuleMemberOrigin, resolveStableExpression } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import { resolveCallableValueDeclaration } from "./reference-fact-call.ts";
import type { CallReturnProgram, NativeValueTransferServices, ReferenceFact, ReturnedValueContext, ReturnedValueSource } from "./reference-fact-contract.ts";
import { isReferenceWriteTarget, unprovenReferenceUse } from "./reference-fact-writes.ts";
import { readSchemaObjectMembers } from "./schema-object.ts";
import { readAuthoredArrayElements, readStaticAuthoredValue } from "./static-authored-value.ts";
import { declaredByPackage, matchesDeclaredCallTerminal, readCallMemberDeclarationOrigin, resolveTypeMemberOrigin } from "./type-member-origin.ts";
import { resolved, resolveTypePropertyOrigin, unresolved } from "./type-member-origin-core.ts";

/** The installed package door shared by shape and Zod ownership policies. */
export const ZOD_PACKAGE = "zod";
const ZOD_PARSE_METHODS: ReadonlySet<string> = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
const ZOD_FIELD_METHODS: ReadonlySet<string> = new Set(["default", "superRefine", "transform"]);

/** Parser ownership is not a grant of successful output or of the receiver's runtime schema. */
export function isZodParserCall(call: CallExpression): boolean {
  const callee = call.getExpression();
  if (!(Node.isPropertyAccessExpression(callee) && ZOD_PARSE_METHODS.has(callee.getName()))) {
    return false;
  }
  return matchesDeclaredCallTerminal(call, readCallMemberDeclarationOrigin(call).origin, {
    packageName: ZOD_PACKAGE,
    packageMethods: [...ZOD_PARSE_METHODS],
    projectHome: null,
    projectMethods: [],
  });
}

function sameParseResult(node: MorphNode, call: CallExpression): boolean {
  const value = resolveStableExpression(node);
  return (value.kind === "resolved" ? value.value : value.node).compilerNode === call.compilerNode;
}

function successGuardedData(member: MorphNode, call: CallExpression): boolean {
  const block = member.getFirstAncestorByKind(SyntaxKind.Block);
  if (block === undefined) {
    return false;
  }
  const ancestors = new Set(member.getAncestors());
  const statements = block.getStatements();
  const index = statements.findIndex((statement) => ancestors.has(statement));
  return statements.slice(0, index).some((statement) => {
    if (!Node.isIfStatement(statement) || statement.getElseStatement() !== undefined) {
      return false;
    }
    const condition = unwrapTarget(statement.getExpression());
    if (!Node.isPrefixUnaryExpression(condition) || condition.getOperatorToken() !== SyntaxKind.ExclamationToken) {
      return false;
    }
    const success = readMemberReference(condition.getOperand());
    if (success.kind !== "resolved" || success.value.name !== "success" || !sameParseResult(success.value.receiver, call)) {
      return false;
    }
    const branch = statement.getThenStatement();
    const exit = Node.isBlock(branch) && branch.getStatements().length === 1 ? branch.getStatements()[0] : branch;
    return Node.isThrowStatement(exit);
  });
}

function safeParseDataUses(call: CallExpression, path: readonly string[]): ReferenceFact<readonly MorphNode[]> {
  if (path[0] !== "data") {
    return unresolved("unsupported", call, "safe parser data requires an explicit data projection");
  }
  const declaration = call.getParent();
  const name = Node.isVariableDeclaration(declaration) && declaration.getInitializer() === call ? declaration.getNameNode() : undefined;
  if (!Node.isIdentifier(name) || referenceResolutionServices.inspectReferenceWrites(name).kind !== "resolved") {
    return unresolved("unsupported", call, "safe parser result has no stable ordinary binding");
  }
  const uses: MorphNode[] = [];
  const escaped = unprovenReferenceUse(name, (use) => {
    const parent = use.getParent();
    const member = parent === undefined ? undefined : readMemberReference(parent);
    if (member?.kind !== "resolved" || member.value.receiver !== use) {
      return false;
    }
    if (member.value.name === "success" || member.value.name === "error") {
      return true;
    }
    if (member.value.name !== "data" || !successGuardedData(member.value.access, call)) {
      return false;
    }
    uses.push(member.value.access);
    return true;
  });
  return escaped === undefined && uses.length > 0
    ? resolved(uses, call, [])
    : unresolved("unsupported", escaped ?? call, "safe parser data has no closed same-result success guard");
}

interface ZodValueServices extends NativeValueTransferServices {
  readonly returnPaths: (node: MorphNode) => ReferenceFact<readonly MorphNode[]>;
}

interface ZodFieldContext {
  readonly context: ReturnedValueContext;
  readonly services: ZodValueServices;
  readonly active: ReadonlySet<object>;
}

function schemaExpression(node: MorphNode): ReferenceFact<CallExpression> {
  const source = resolveStableExpression(node);
  if (source.kind === "unresolved" && source.reason !== "dynamic") {
    return source;
  }
  for (const declaration of source.trace.declarations) {
    const name = Node.isVariableDeclaration(declaration) ? declaration.getNameNode() : undefined;
    if (!Node.isIdentifier(name)) {
      continue;
    }
    const writes = referenceResolutionServices.inspectReferenceWrites(name);
    if (writes.kind === "unresolved") {
      return writes;
    }
    const escaped = unprovenReferenceUse(name, (use) => {
      if (use === node) {
        return true;
      }
      const member = use.getParent();
      const call = member?.getParent();
      if (!Node.isPropertyAccessExpression(member) || member.getExpression() !== use || !Node.isCallExpression(call) || call.getExpression() !== member) {
        return false;
      }
      if (isZodParserCall(call)) {
        return true;
      }
      const origin = resolveTypeMemberOrigin(member);
      return origin.kind === "resolved" && ZOD_FIELD_METHODS.has(origin.value.name) && declaredByPackage(origin.value.declarations, ZOD_PACKAGE);
    });
    if (escaped !== undefined) {
      return unresolved("unsupported", escaped, "runtime schema has an unclosed mutable or opaque consumer");
    }
  }
  const expression = unwrapTarget(source.kind === "resolved" ? source.value : source.node);
  return Node.isCallExpression(expression)
    ? { kind: "resolved", value: expression, trace: source.trace }
    : unresolved("unsupported", expression, "runtime field domain has no actual schema construction");
}

function enumFieldDomain(call: CallExpression, path: readonly string[], inputs: ZodFieldContext): ReferenceFact<readonly ReturnedValueSource[]> {
  const argument = call.getArguments()[0];
  if (path.length > 0 || argument === undefined) {
    return inputs.services.refusal(call, "unsupported", "enum field domain requires its actual scalar tuple");
  }
  const tuple = readAuthoredArrayElements(argument, new Set([argument]));
  if (tuple.kind === "unresolved") {
    return tuple;
  }
  const values = tuple.value.map((element) => {
    const scalar = readStaticAuthoredValue(element);
    if (scalar.kind === "unresolved") {
      return scalar;
    }
    return scalar.value.kind === "scalar" && typeof scalar.value.value === "string"
      ? inputs.services.leaf(scalar.value.node, [], inputs.context)
      : inputs.services.refusal(element, "unsupported", "enum field domain requires actual authored string values");
  });
  return values.length === 0 ? inputs.services.refusal(argument, "missing", "enum field domain is empty") : inputs.services.alternatives(call, values);
}

function objectFieldDomain(call: CallExpression, path: readonly string[], inputs: ZodFieldContext): ReferenceFact<readonly ReturnedValueSource[]> {
  const name = path[0];
  const argument = call.getArguments()[0];
  if (name === undefined || argument === undefined) {
    return inputs.services.refusal(call, "unsupported", "parsed object requires an explicit demanded field");
  }
  const members = readSchemaObjectMembers(argument);
  if (members.kind === "unresolved") {
    return members;
  }
  const object = members.value.object;
  if (!Node.isObjectLiteralExpression(object) || object.getProperties().some(Node.isSpreadAssignment)) {
    return inputs.services.refusal(argument, "unsupported", "runtime schema shape spreads have no closed source-use proof");
  }
  for (const declaration of members.trace.declarations) {
    const binding = Node.isVariableDeclaration(declaration) ? declaration.getNameNode() : undefined;
    if (!Node.isIdentifier(binding)) {
      continue;
    }
    const escaped = unprovenReferenceUse(binding, new Set([argument]));
    if (escaped !== undefined) {
      return inputs.services.refusal(escaped, "unsupported", "runtime schema shape has an unclosed alias or opaque consumer");
    }
  }
  // Zod fills a plain object by assignment; even a required slot can hit an inherited setter.
  const effects = inputs.services.inheritedEffects(call, inputs.context);
  if (effects.kind === "unresolved") {
    return { ...effects, detail: `parsed object output requires closed inherited assignment effects: ${effects.detail}` };
  }
  const entry = members.value.entries.findLast((member) => member.name === name);
  return entry === undefined || members.value.entries.some((member) => member.name === "__proto__")
    ? inputs.services.refusal(argument, "unsupported", "parsed field has no ordinary authored schema slot")
    : schemaFieldDomain(entry.value, path.slice(1), inputs);
}

function defaultFieldDomain(
  call: CallExpression,
  inner: MorphNode,
  path: readonly string[],
  inputs: ZodFieldContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  const fallback = call.getArguments()[0];
  if (fallback === undefined || call.getArguments().length !== 1) {
    return inputs.services.refusal(call, "unsupported", "schema default has no one actual value");
  }
  const value = resolveStableExpression(fallback);
  const actual = value.kind === "resolved" ? value.value : value.node;
  if (Node.isArrowFunction(actual) || Node.isFunctionExpression(actual) || Node.isFunctionDeclaration(actual)) {
    return inputs.services.refusal(actual, "unsupported", "a computed schema default requires its own runtime output proof");
  }
  // Zod defaults bypass the inner validator, so the authored default contributes its own alternative.
  return inputs.services.alternatives(call, [schemaFieldDomain(inner, path, inputs), inputs.services.readValue(fallback, path, inputs.context)]);
}

interface ParsedCallbackInput {
  readonly program: CallReturnProgram;
  readonly fields: ReadonlyMap<string, MorphNode>;
  readonly returnedCopies: ReadonlySet<object>;
  readonly inputs: ZodFieldContext;
  readonly path: readonly string[];
  readonly domain: readonly ReturnedValueSource[];
}

function nativeArrayRead(node: MorphNode, method: string, program: CallReturnProgram): boolean {
  const origin = resolveTypeMemberOrigin(node);
  return (
    origin.kind === "resolved" &&
    origin.value.name === method &&
    origin.value.declarations.length > 0 &&
    origin.value.declarations.every((declaration) => program.program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode)) &&
    referenceResolutionServices.inspectSymbolWrites(origin.value.symbol, node).kind === "resolved"
  );
}

function callbackArrayValues(node: MorphNode, inputs: ParsedCallbackInput): ReferenceFact<readonly MorphNode[]> {
  return readAuthoredArrayElements(node, (use) => {
    if (use === node) {
      return true;
    }
    const member = use.getParent();
    const call = member?.getParent();
    return (
      member !== undefined &&
      Node.isCallExpression(call) &&
      call.getExpression() === member &&
      Node.isPropertyAccessExpression(member) &&
      member.getExpression() === use &&
      nativeArrayRead(member, "includes", inputs.program)
    );
  });
}

function stringValues(nodes: readonly MorphNode[]): readonly string[] | undefined {
  const values = nodes.map(readStaticAuthoredValue);
  if (values.some((value) => value.kind === "unresolved" || value.value.kind !== "scalar" || typeof value.value.value !== "string")) {
    return;
  }
  return values.flatMap((value) =>
    value.kind === "resolved" && value.value.kind === "scalar" && typeof value.value.value === "string" ? [value.value.value] : [],
  );
}

function callbackLoopKeys(expression: MorphNode, binding: import("ts-morph").Identifier, inputs: ParsedCallbackInput): readonly string[] | undefined {
  if (!Node.isElementAccessExpression(expression) || inputs.path.length !== 1) {
    return;
  }
  const key = expression.getArgumentExpression();
  const member = key === undefined ? undefined : readMemberReference(key);
  if (
    member?.kind !== "resolved" ||
    member.value.name !== inputs.path[0] ||
    !Node.isIdentifier(member.value.receiver) ||
    lexicalReferenceSymbol(member.value.receiver)?.compilerSymbol !== lexicalReferenceSymbol(binding)?.compilerSymbol
  ) {
    return;
  }
  const table = expression.getExpression();
  if (!Node.isIdentifier(table) || unprovenReferenceUse(table, new Set([table])) !== undefined) {
    return;
  }
  const shape = readSchemaObjectMembers(table);
  const selectors = stringValues(inputs.domain.map((value) => value.value));
  if (shape.kind === "unresolved" || selectors === undefined) {
    return;
  }
  const values: MorphNode[] = [];
  for (const selector of selectors) {
    const entry = shape.value.entries.findLast((candidate) => candidate.name === selector);
    if (entry === undefined) {
      return;
    }
    const array = callbackArrayValues(entry.value, inputs);
    if (array.kind === "unresolved") {
      return;
    }
    values.push(...array.value);
  }
  return stringValues(values);
}

function callbackReadKeys(node: MorphNode, binding: import("ts-morph").Identifier, inputs: ParsedCallbackInput): readonly string[] | undefined {
  const constant = readStaticAuthoredValue(node);
  if (constant.kind === "resolved" && constant.value.kind === "scalar" && typeof constant.value.value === "string") {
    return [constant.value.value];
  }
  if (!Node.isIdentifier(node)) {
    return;
  }
  const declaration = lexicalReferenceSymbol(node)?.getValueDeclaration();
  if (Node.isVariableDeclaration(declaration)) {
    const loop = declaration.getParent().getParent();
    return Node.isForOfStatement(loop) ? callbackLoopKeys(loop.getExpression(), binding, inputs) : undefined;
  }
  if (!Node.isParameterDeclaration(declaration) || declaration.isRestParameter() || declaration.getInitializer() !== undefined) {
    return;
  }
  const owner = declaration.getParent();
  const call = owner.getParent();
  if (!Node.isArrowFunction(owner) || owner.getParameters()[0] !== declaration || !Node.isCallExpression(call) || call.getArguments()[0] !== owner) {
    return;
  }
  const member = call.getExpression();
  if (!(Node.isPropertyAccessExpression(member) && nativeArrayRead(member, "filter", inputs.program))) {
    return;
  }
  const array = callbackArrayValues(member.getExpression(), inputs);
  return array.kind === "resolved" ? stringValues(array.value) : undefined;
}

function callbackDataRead(use: MorphNode, binding: import("ts-morph").Identifier, inputs: ParsedCallbackInput): ReferenceFact<true> | undefined {
  const parent = use.getParent();
  if (
    !(Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) ||
    parent.getExpression() !== use ||
    isReferenceWriteTarget(parent)
  ) {
    return;
  }
  const outer = parent.getParent();
  if ((Node.isCallExpression(outer) || Node.isNewExpression(outer)) && outer.getExpression() === parent) {
    return;
  }
  const key = Node.isElementAccessExpression(parent) ? parent.getArgumentExpression() : undefined;
  const computed = key === undefined ? undefined : callbackReadKeys(key, binding, inputs);
  const names = Node.isPropertyAccessExpression(parent) ? [parent.getName()] : computed;
  if (names === undefined || names.length === 0) {
    return unresolved("unsupported", parent, "schema callback read has no closed actual property keys");
  }
  if (!names.every((name) => inputs.fields.has(name))) {
    return unresolved("unsupported", parent, "schema callback reads outside its authored record fields");
  }
  const inherited = inputs.inputs.services.inheritedEffects(parent, inputs.inputs.context);
  return inherited.kind === "unresolved"
    ? {
        ...inherited,
        detail: `schema callback read ${names.join(", ")} may be absent: ${inherited.detail}`,
      }
    : resolved(true, parent, []);
}

function synchronousCallback(
  node: MorphNode,
): node is import("ts-morph").FunctionDeclaration | import("ts-morph").FunctionExpression | import("ts-morph").ArrowFunction {
  return (
    (Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isArrowFunction(node)) &&
    !node.isAsync() &&
    (Node.isArrowFunction(node) || !node.isGenerator()) &&
    node.getBody() !== undefined
  );
}

function callbackIssueUse(use: MorphNode): boolean {
  const member = use.getParent();
  if (!Node.isPropertyAccessExpression(member) || member.getExpression() !== use || member.getName() !== "addIssue") {
    return false;
  }
  const call = member.getParent();
  const origin = resolveTypeMemberOrigin(member);
  return (
    Node.isCallExpression(call) && call.getExpression() === member && origin.kind === "resolved" && declaredByPackage(origin.value.declarations, ZOD_PACKAGE)
  );
}

function callbackForwardedUse(use: MorphNode, inputs: ParsedCallbackInput, contextParameter: boolean, active: ReadonlySet<object>): ReferenceFact<true> {
  const call = use.getParent();
  if (!(Node.isCallExpression(call) && Node.isIdentifier(call.getExpression()))) {
    return unresolved("unsupported", use, "schema callback input has an unclosed consumer");
  }
  const index = call.getArguments().indexOf(use);
  const observation = inputs.program.byCall.get(call.compilerNode);
  if (index < 0 || observation?.targets.kind !== "resolved" || observation.targets.value.length === 0) {
    return unresolved("unsupported", use, "schema callback helper has no actual captured targets");
  }
  for (const target of observation.targets.value) {
    if (!synchronousCallback(target)) {
      return unresolved("unsupported", target, "schema callback helper has no synchronous authored body");
    }
    const formal = target.getParameters()[index];
    if (formal === undefined) {
      return unresolved("missing", target, "schema callback helper has no matching formal");
    }
    const closed = callbackParameterClosed(formal, inputs, contextParameter, active);
    if (closed.kind === "unresolved") {
      return closed;
    }
  }
  return resolved(true, use, []);
}

function callbackKnownUse(
  use: MorphNode,
  binding: import("ts-morph").Identifier,
  inputs: ParsedCallbackInput,
  contextParameter: boolean,
): ReferenceFact<true> | undefined {
  const parent = use.getParent();
  if (parent === undefined) {
    return unresolved("unsupported", use, "schema callback use has no containing syntax");
  }
  if (!contextParameter) {
    const read = callbackDataRead(use, binding, inputs);
    if (read !== undefined) {
      return read;
    }
    if (Node.isSpreadAssignment(parent) && parent.getExpression() === use && inputs.returnedCopies.has(parent.getParent().compilerNode)) {
      return resolved(true, use, []);
    }
  }
  return contextParameter && callbackIssueUse(use) ? resolved(true, use, []) : undefined;
}

function callbackParameterClosed(
  parameter: import("ts-morph").ParameterDeclaration,
  inputs: ParsedCallbackInput,
  contextParameter: boolean,
  active: ReadonlySet<object> = new Set(),
): ReferenceFact<true> {
  if (active.has(parameter.compilerNode)) {
    return unresolved("cycle", parameter, "schema callback revisits an active formal input");
  }
  const admitted = readCallReturnProgram(parameter, { programs: [inputs.program] });
  if (admitted.kind === "unresolved") {
    return admitted;
  }
  const name = parameter.getNameNode();
  if (
    !Node.isIdentifier(name) ||
    parameter.isRestParameter() ||
    parameter.getInitializer() !== undefined ||
    referenceResolutionServices.inspectReferenceWrites(name).kind !== "resolved"
  ) {
    return unresolved("unsupported", parameter, "schema callback parameter is not a stable ordinary input");
  }
  let refusal: ReferenceFact<true> | undefined;
  const next = new Set(active).add(parameter.compilerNode);
  const unproven = unprovenReferenceUse(name, (use, binding) => {
    const closed = callbackKnownUse(use, binding, inputs, contextParameter) ?? callbackForwardedUse(use, inputs, contextParameter, next);
    if (closed.kind === "unresolved") {
      refusal = closed;
    }
    return closed.kind === "resolved";
  });
  return unproven === undefined
    ? resolved(true, parameter, [])
    : (refusal ?? unresolved("unsupported", unproven, "schema callback input has an unclosed write, read, or escape"));
}

function schemaRecordFields(node: MorphNode, active = new Set<object>()): ReferenceFact<ReadonlyMap<string, MorphNode>> {
  const expression = schemaExpression(node);
  if (expression.kind === "unresolved") {
    return expression;
  }
  const call = expression.value;
  if (active.has(call.compilerNode)) {
    return unresolved("cycle", call, "schema record shape revisits its constructor");
  }
  const next = new Set(active).add(call.compilerNode);
  if (isFactoryCallFromPackage(call, new Set(["object", "strictObject", "looseObject"]), ZOD_PACKAGE)) {
    const argument = call.getArguments()[0];
    const members = argument === undefined ? undefined : readSchemaObjectMembers(argument);
    if (members?.kind !== "resolved" || members.value.entries.some((entry) => entry.name === "__proto__")) {
      return unresolved("unsupported", call, "callback input has no ordinary parsed record shape");
    }
    return resolved(new Map(members.value.entries.map((entry) => [entry.name, entry.value])), call, members.trace.declarations);
  }
  const member = resolveTypeMemberOrigin(call.getExpression());
  return member.kind === "resolved" && declaredByPackage(member.value.declarations, ZOD_PACKAGE) && member.value.name === "superRefine"
    ? schemaRecordFields(member.value.receiver, next)
    : unresolved("unsupported", call, "callback input record has an unsupported preceding transformation");
}

function callbackFieldDomain(
  call: CallExpression,
  member: import("./type-member-origin-contract.ts").TypeMemberOrigin,
  path: readonly string[],
  inputs: ZodFieldContext,
): ReferenceFact<readonly ReturnedValueSource[]> {
  if (path.length > 1) {
    return inputs.services.refusal(call, "unsupported", "schema callbacks have no closed nested-output alias proof");
  }
  const inner = member.receiver;
  const domain = schemaFieldDomain(inner, path, inputs);
  if (domain.kind === "unresolved") {
    return domain;
  }
  const fields = schemaRecordFields(inner);
  if (fields.kind === "unresolved") {
    return fields;
  }
  const program = inputs.context.program;
  const argument = call.getArguments()[0];
  if (program === undefined || argument === undefined || call.getArguments().length !== 1) {
    return inputs.services.refusal(call, "unsupported", "schema callback has no actual captured input");
  }
  const callable = resolveCallableValueDeclaration(argument, { programs: [program] });
  if (callable.kind === "unresolved") {
    return callable;
  }
  const fn = callable.value.declaration;
  if (!synchronousCallback(fn)) {
    return inputs.services.refusal(fn, "unsupported", "schema callback has no synchronous authored body");
  }
  const parameters = fn.getParameters();
  const value = parameters[0];
  const ctx = parameters[1];
  const returns = member.name === "transform" ? inputs.services.returnPaths(fn) : undefined;
  if (returns?.kind === "unresolved") {
    return returns;
  }
  const returnedCopies = new Set(returns?.value.map((returned) => unwrapTarget(returned).compilerNode));
  const callbackInputs = { program, fields: fields.value, returnedCopies, inputs, path, domain: domain.value };
  if (value === undefined || parameters.length > 2) {
    return inputs.services.refusal(fn, "unsupported", "schema callback has no supported ordinary parameter list");
  }
  const valueClosed = callbackParameterClosed(value, callbackInputs, false);
  if (valueClosed.kind === "unresolved") {
    return valueClosed;
  }
  const contextClosed = ctx === undefined ? undefined : callbackParameterClosed(ctx, callbackInputs, true);
  if (contextClosed?.kind === "unresolved") {
    return contextClosed;
  }
  if (returns === undefined) {
    return domain;
  }
  return inputs.services.alternatives(
    call,
    returns.value.map((returned) => {
      const object = unwrapTarget(returned);
      if (
        !Node.isObjectLiteralExpression(object) ||
        object
          .getProperties()
          .some((property) => !(Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property) || Node.isSpreadAssignment(property)))
      ) {
        return inputs.services.refusal(returned, "unsupported", "schema transform does not return an ordinary authored record");
      }
      const { callableValues: _callableValues, ...ordinary } = inputs.context;
      const projected = inputs.services.readValue(returned, path, { ...ordinary, nativeValueTransfers: false });
      if (projected.kind === "unresolved") {
        return projected;
      }
      return inputs.services.alternatives(
        returned,
        projected.value.map((source) => {
          if (
            source.present &&
            source.path.length === path.length &&
            source.path.every((part, index) => part === path[index]) &&
            Node.isIdentifier(source.value) &&
            lexicalReferenceSymbol(source.value)?.getValueDeclaration()?.compilerNode === value.compilerNode
          ) {
            return domain;
          }
          return source.present && source.path.length === 0
            ? { ...projected, value: [source] }
            : inputs.services.refusal(source.value, "unsupported", "schema transform does not preserve or replace the demanded field");
        }),
      );
    }),
  );
}

function schemaFieldDomain(node: MorphNode, path: readonly string[], inputs: ZodFieldContext): ReferenceFact<readonly ReturnedValueSource[]> {
  const expression = schemaExpression(node);
  if (expression.kind === "unresolved") {
    return expression;
  }
  const call = expression.value;
  if (inputs.active.has(call.compilerNode)) {
    return inputs.services.refusal(call, "cycle", "schema field traversal revisits its constructor");
  }
  const next = { ...inputs, active: new Set(inputs.active).add(call.compilerNode) };
  if (isFactoryCallFromPackage(call, "enum", ZOD_PACKAGE)) {
    return enumFieldDomain(call, path, next);
  }
  if (isFactoryCallFromPackage(call, new Set(["object", "strictObject", "looseObject"]), ZOD_PACKAGE)) {
    return objectFieldDomain(call, path, next);
  }
  const member = resolveTypeMemberOrigin(call.getExpression());
  if (member.kind === "resolved" && declaredByPackage(member.value.declarations, ZOD_PACKAGE) && member.value.name === "default") {
    return defaultFieldDomain(call, member.value.receiver, path, next);
  }
  if (member.kind === "resolved" && declaredByPackage(member.value.declarations, ZOD_PACKAGE) && ["superRefine", "transform"].includes(member.value.name)) {
    return callbackFieldDomain(call, member.value, path, next);
  }
  return inputs.services.refusal(call, "unsupported", "schema operation has no supported runtime field-domain transfer");
}

/** Project successful installed parser outputs from authored schemas, never from their inferred output type. */
export function readZodParsedValue(
  call: CallExpression,
  path: readonly string[],
  context: ReturnedValueContext,
  services: ZodValueServices,
): ReferenceFact<readonly ReturnedValueSource[]> | undefined {
  if (!isZodParserCall(call)) {
    return;
  }
  const member = readMemberReference(call.getExpression());
  if (member.kind === "unresolved") {
    return member;
  }
  const program = context.program === undefined ? undefined : readCallReturnProgram(call, { programs: [context.program] });
  if (program?.kind !== "resolved" || call.getArguments().length !== 1 || call.hasQuestionDotToken()) {
    return services.refusal(call, "unsupported", "parser output requires one actual synchronous captured invocation");
  }
  const safe = member.value.name === "safeParse";
  if (!safe && member.value.name !== "parse") {
    return services.refusal(call, "unsupported", "parser output has no synchronous field-domain transfer");
  }
  const uses = safe ? safeParseDataUses(call, path) : resolved([call], call, []);
  if (uses.kind === "unresolved") {
    return uses;
  }
  const selectedPath = safe ? path.slice(1) : path;
  const domain = schemaFieldDomain(member.value.receiver, selectedPath, { context, services, active: new Set() });
  if (domain.kind === "unresolved") {
    return domain;
  }
  for (const use of uses.value) {
    const closed = services.outputUse(use, selectedPath, context, domain.value);
    if (closed.kind === "unresolved") {
      return closed;
    }
  }
  return domain;
}

/** The member a candidate call names, with the node a finding anchors on — a prefilter, never the verdict. */
export interface ZodCandidateCall {
  readonly name: string;
  readonly nameNode: MorphNode;
}

/** Candidate factory name and authored anchor; resolution still decides package ownership. */
export function zodCandidateCall(node: MorphNode): ZodCandidateCall | undefined {
  const expression = referenceResolutionServices.unwrapExpression(node);
  if (!Node.isCallExpression(expression)) {
    return;
  }
  const callee = referenceResolutionServices.unwrapExpression(expression.getExpression());
  if (Node.isIdentifier(callee)) {
    return { name: callee.getText(), nameNode: callee };
  }
  const member = readMemberReference(callee);
  return member.kind === "resolved" ? { name: member.value.name, nameNode: member.value.nameNode } : undefined;
}

/** Canonical factory ownership preserves unresolved module and nested-property provenance separately from another identity. */
export function resolveFactoryCallFromPackage(node: MorphNode, method: string | ReadonlySet<string>, packageName: string): ReferenceFact<boolean> {
  const expression = referenceResolutionServices.unwrapExpression(node);
  if (!Node.isCallExpression(expression)) {
    return resolved(false, expression, []);
  }
  const origin = resolveModuleMemberOrigin(expression.getExpression());
  if (origin.kind === "unresolved") {
    return origin;
  }
  if (origin.value.canonical.kind !== "project") {
    return unresolved("missing", expression, `the checker resolved no factory declaration through package door ${origin.value.canonical.moduleSpecifier}`);
  }
  const { memberPath, canonical } = origin.value;
  const terminal = memberPath.at(-1) ?? canonical.exportedName;
  if (!(typeof method === "string" ? terminal === method : method.has(terminal))) {
    return { ...origin, value: false };
  }
  const property = memberPath.length === 0 ? undefined : resolveTypePropertyOrigin(canonical.declaration, memberPath);
  if (property?.kind === "unresolved") {
    return property;
  }
  const declarations = property?.value ?? [canonical.declaration];
  return resolved(
    declaredByPackage(declarations, packageName) &&
      declarations.every((declaration) => !Node.isSourceFile(declaration) && declaration.getType().getCallSignatures().length > 0),
    expression,
    [...origin.trace.declarations, ...declarations],
  );
}

/** Positive-only consumers require proven ownership; false is not a negative provenance fact. */
export function isFactoryCallFromPackage(node: MorphNode, method: string | ReadonlySet<string>, packageName: string): boolean {
  const fact = resolveFactoryCallFromPackage(node, method, packageName);
  return fact.kind === "resolved" && fact.value;
}
