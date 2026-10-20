// The EXPLICIT governed sinks a statement can hand a caught binding to: a structured log line, the notify/toast
// door, an ambient stderr/reportError sink, a React setter, a named security event, or a zod refinement issue.
// Each is provenance-checked; the failure-VALUE vocabulary they reuse lives in caught-failure-outcome.ts.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import {
  ambientIdentifier,
  calleeName,
  directlyCarriesBinding,
  FUNCTION_KINDS,
  hasInterveningWrite,
  importedName,
  literalMember,
  OBSERVABILITY_MODULES,
  originatesFromFactory,
  referencesBinding,
  staticStringValue,
} from "./caught-failure-core.ts";
import { isFailureOutcome } from "./caught-failure-outcome.ts";
import { rawFailureDeclarations } from "./caught-failure-read.ts";

// ── the EXPLICIT governed-sink recognizers ─────────────────────────────────────────────────────────────
const LOG_METHODS: ReadonlySet<string> = new Set(["error", "fatal", "warn"]);
/** The GOVERNED operator-logger doors. A log-shaped method on an arbitrary object proves nothing — provenance
 *  is what separates the repo's observable operator surface from a local `{ warn() {} }` stand-in. */
const LOGGER_MODULES: ReadonlySet<string> = new Set(["#foundation/observability", "#foundation/observability/logging", "./logger.ts"]);
const NOTICE_RECEIVER_RE = /(?:^|\.)(?:notify|toast)$/u;
/** Copy that says the operation SUCCEEDED. A notice reading "Saved successfully." cannot be the owner of the
 *  failure it is displayed for, no matter what it carries in its metadata. */
const SUCCESS_COPY_RE = /^(?:done|ready|saved(?: successfully)?|success|succeeded|completed successfully)[.!]?$/iu;
const PROCESS_STDERR_RE = /(?:^|\.)process\.stderr$/u;
const SETTER_NAME_RE = /^set[A-Z]/u;
const FAILURE_SUFFIX_RE = /(?:Error|Failed|Failure)$/u;

function contextualLogMessage(node: Node | undefined): boolean {
  if (node?.isKind(SyntaxKind.StringLiteral) !== true && node?.isKind(SyntaxKind.NoSubstitutionTemplateLiteral) !== true) {
    return false;
  }
  const message = node.getLiteralValue().trim();
  return message.length > 0 && !/^(?:error|failed|failure|exception)$/iu.test(message) && (message.split(/\s+/u).length > 1 || /[:./-]/u.test(message));
}

function isStructuredLog(call: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const name = calleeName(call, reads);
  if (name === undefined || !LOG_METHODS.has(name) || errorBinding === undefined) {
    return false;
  }
  const member = literalMember(call.getExpression(), reads);
  if (member === undefined || !loggerReceiverOwns(member.receiver, undefined, reads)) {
    return false;
  }
  const [context, message] = call.getArguments();
  return context?.isKind(SyntaxKind.ObjectLiteralExpression) === true && referencesBinding(context, errorBinding, reads) && contextualLogMessage(message);
}

function parameterHasLoggerProvenance(parameter: Node): boolean {
  if (!parameter.isKind(SyntaxKind.Parameter)) {
    return false;
  }
  const typeNode = parameter.getTypeNode();
  if (typeNode === undefined) {
    return false;
  }
  const text = typeNode.getText();
  if (text !== "pino.Logger") {
    return false;
  }
  return typeNode
    .getSourceFile()
    .getImportDeclarations()
    .some((declaration) => {
      if (declaration.getModuleSpecifierValue() !== "pino") {
        return false;
      }
      return declaration.getDefaultImport()?.getText() === "pino";
    });
}

function identifierLoggerOwns(value: Node, nextSeen: ReadonlySet<Node>, reads?: CaughtFailureReadServices): boolean {
  const declaration = rawFailureDeclarations(value, reads)[0];
  if (declaration !== undefined && hasInterveningWrite(value, declaration, reads)) {
    return false;
  }
  if (declaration?.isKind(SyntaxKind.Parameter) === true) {
    return parameterHasLoggerProvenance(declaration);
  }
  if (declaration?.isKind(SyntaxKind.ImportSpecifier) === true) {
    const module = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
    return declaration.getName() === "logger" && module !== undefined && LOGGER_MODULES.has(module);
  }
  const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
  return initializer !== undefined && loggerReceiverOwns(initializer, nextSeen, reads);
}

function loggerReceiverOwns(node: Node, seen: ReadonlySet<Node> = new Set(), reads?: CaughtFailureReadServices): boolean {
  const value = unwrapExpression(node);
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen).add(value);
  if (value.isKind(SyntaxKind.Identifier)) {
    return identifierLoggerOwns(value, nextSeen, reads);
  }
  if (value.isKind(SyntaxKind.CallExpression)) {
    const callee = unwrapExpression(value.getExpression());
    if (importedName(callee, LOGGER_MODULES, reads) === "getLog") {
      return true;
    }
    const member = literalMember(callee, reads);
    return member?.name === "child" && loggerReceiverOwns(member.receiver, nextSeen, reads);
  }
  const member = literalMember(value, reads);
  return member !== undefined && loggerReceiverOwns(member.receiver, nextSeen, reads);
}

/** An OPTIONAL call (`notify?.error(err)`, `globalThis.reportError?.(err)`) can be skipped at runtime, so it
 *  does not DOMINATE the absorb path and cannot be the owner. */
function isSkippableCall(call: CallExpression): boolean {
  const rawCallee = call.getExpression();
  const optionalMember =
    (rawCallee.isKind(SyntaxKind.PropertyAccessExpression) || rawCallee.isKind(SyntaxKind.ElementAccessExpression)) &&
    rawCallee.getQuestionDotTokenNode() !== undefined;
  return call.getQuestionDotTokenNode() !== undefined || optionalMember;
}

function noticeReceiverOwns(node: Node, reads?: CaughtFailureReadServices): boolean {
  const value = unwrapExpression(node);
  if (!value.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const declaration = rawFailureDeclarations(value, reads)[0];
  if (declaration?.isKind(SyntaxKind.Parameter) === true) {
    return false;
  }
  if (declaration?.isKind(SyntaxKind.ImportSpecifier) === true) {
    const module = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
    return declaration.getName() === "notify" && (module === "#lib" || module?.endsWith("/notify.ts") === true);
  }
  return originatesFromFactory(value, new Set(["@orb/ui/toast"]), new Set(["useToastManager"]), reads);
}

/** The USER-VISIBLE surface: the governed `notify`/toast manager only, carrying either the caught binding or —
 *  when the catch is bindingless — failure-valued copy. Success copy is not an owner even beside a `cause`. */
function noticeOwns(call: CallExpression, member: { readonly receiver: Node }, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  if (!(NOTICE_RECEIVER_RE.test(member.receiver.getText()) && noticeReceiverOwns(member.receiver, reads))) {
    return false;
  }
  const primary = call.getArguments()[0];
  if (primary?.isKind(SyntaxKind.StringLiteral) === true && SUCCESS_COPY_RE.test(primary.getLiteralValue().trim())) {
    return false;
  }
  return errorBinding === undefined
    ? call.getArguments().some((argument) => isFailureOutcome(argument, undefined, reads))
    : referencesBinding(call, errorBinding, reads);
}

/** The two AMBIENT operator sinks. Both are provenance-checked: a parameter named `process`/`globalThis` does
 *  not inherit the real boundary. */
function ambientSinkOwns(
  call: CallExpression,
  member: { readonly name: string; readonly receiver: Node },
  errorBinding: Node | undefined,
  reads?: CaughtFailureReadServices,
): boolean {
  if (errorBinding === undefined || !referencesBinding(call, errorBinding, reads)) {
    return false;
  }
  if (member.name === "write" && PROCESS_STDERR_RE.test(member.receiver.getText())) {
    const processId = member.receiver.getFirstDescendantByKind(SyntaxKind.Identifier);
    return processId !== undefined && ambientIdentifier(processId, "process", new Set(["node:process"]), reads);
  }
  return isNativeReportError(call.getExpression(), reads);
}

/** The native exception reporter, not a reporter-shaped member on a local or optional receiver. */
export function isNativeReportError(node: Node, reads?: CaughtFailureReadServices): boolean {
  const value = unwrapExpression(node);
  const optionalMember =
    (value.isKind(SyntaxKind.PropertyAccessExpression) || value.isKind(SyntaxKind.ElementAccessExpression)) && value.getQuestionDotTokenNode() !== undefined;
  const member = literalMember(value, reads);
  return !optionalMember && member?.name === "reportError" && ambientIdentifier(member.receiver, "globalThis", new Set(), reads);
}

/** A genuine React setter slot fed a failure-valued argument — the observable-state owner. The `Error`/`Failed`
 *  name suffix admits the boolean flag spelling; a merely setter-SHAPED local does not qualify. */
function stateSetterOwns(call: CallExpression, name: string, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  if (!(SETTER_NAME_RE.test(name) && originatesFromFactory(call.getExpression(), new Set(["react"]), new Set(["useState"]), reads))) {
    return false;
  }
  if (call.getArguments().some((argument) => isFailureOutcome(argument, errorBinding, reads))) {
    return true;
  }
  return FAILURE_SUFFIX_RE.test(name) && call.getArguments().some((argument) => unwrapExpression(argument).getText() === "true");
}

/** `securityEvent(<event>, …)` from the governed observability door — one consistently-tagged `security:true`
 *  pino line, which IS the operator surface for a rejection. It owns WITHOUT the caught binding on purpose:
 *  the whole point of these seams (JWKS parse, JWT verify, credential decrypt) is that the raw error must not
 *  leak, so the NAMED reason is the evidence and the error object is deliberately dropped. Provenance-checked
 *  like every other owner, and the event name must be a readable non-empty literal — an unnamed event is not
 *  a greppable trail. */
function securityEventOwns(call: CallExpression, reads?: CaughtFailureReadServices): boolean {
  if (importedName(call.getExpression(), OBSERVABILITY_MODULES, reads) !== "securityEvent") {
    return false;
  }
  const event = call.getArguments()[0];
  const name = event === undefined ? undefined : staticStringValue(event, reads);
  return name !== undefined && name.trim().length > 0;
}

export function isExplicitOwnerCall(call: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  if (isSkippableCall(call)) {
    return false;
  }
  const name = calleeName(call, reads);
  if (name === undefined) {
    return false;
  }
  if (isStructuredLog(call, errorBinding, reads) || securityEventOwns(call, reads)) {
    return true;
  }
  const member = literalMember(call.getExpression(), reads);
  if (member !== undefined && (name === "error" || name === "warning")) {
    return noticeOwns(call, member, errorBinding, reads);
  }
  if (member !== undefined && (name === "write" || name === "reportError")) {
    return ambientSinkOwns(call, member, errorBinding, reads);
  }
  if (member !== undefined && name === ZOD_ISSUE_METHOD) {
    return zodIssueOwns(call, member.receiver, reads);
  }
  if (member !== undefined && COLLECTING_METHODS.has(name)) {
    return (
      errorBinding !== undefined &&
      call.getArguments().some((argument) => carriesFailure(argument, errorBinding, reads)) &&
      collectionIsAggregated(call, member.receiver, reads)
    );
  }
  return stateSetterOwns(call, name, errorBinding, reads);
}

const ZOD_ISSUE_METHOD = "addIssue";
/** The zod schema methods whose callback context fails the parse when it receives an issue. */
const ZOD_REFINEMENT_METHODS: ReadonlySet<string> = new Set(["superRefine", "transform"]);
const ZOD_MODULE = "zod";

/** The chain root of `z.object(…).strict().superRefine` is `z` when every link is a call or member read. */
function chainRoot(node: Node): Node {
  const value = unwrapExpression(node);
  if (value.isKind(SyntaxKind.CallExpression) || value.isKind(SyntaxKind.PropertyAccessExpression)) {
    return chainRoot(value.getExpression());
  }
  return value;
}

/** A root named by this file's own `zod` import, declared nowhere else in the file. Syntax only: the chain sits
 *  outside the catch, so its symbols lie beyond the site's native closure. */
function namesZodImport(root: Node): boolean {
  if (!root.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const name = root.getText();
  const source = root.getSourceFile();
  const imported = source
    .getImportDeclarations()
    .some(
      (declaration) =>
        declaration.getModuleSpecifierValue() === ZOD_MODULE &&
        declaration.getNamedImports().some((specifier) => (specifier.getAliasNode() ?? specifier.getNameNode()).getText() === name),
    );
  const redeclared = [...source.getDescendantsOfKind(SyntaxKind.VariableDeclaration), ...source.getDescendantsOfKind(SyntaxKind.Parameter)].some(
    (declaration) => declaration.getNameNode().getText() === name,
  );
  return imported && !redeclared;
}

/** The nearest function around `node`. */
function enclosingFunction(node: Node): Node | undefined {
  return node.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()));
}

/** `ctx.addIssue(…)` on the context parameter of a synchronous zod `superRefine`/`transform` callback that makes the
 *  call itself: any issue fails the parse, so the caller receives the failure as the parse's ZodError whatever the
 *  issue says. A call deferred into a nested function runs after the parse has settled. */
function zodIssueOwns(call: CallExpression, receiver: Node, reads?: CaughtFailureReadServices): boolean {
  const context = unwrapExpression(receiver);
  const declaration = context.isKind(SyntaxKind.Identifier) ? rawFailureDeclarations(context, reads)[0] : undefined;
  const callback = declaration?.isKind(SyntaxKind.Parameter) === true ? declaration.getParent() : undefined;
  if (
    !(callback?.isKind(SyntaxKind.ArrowFunction) === true || callback?.isKind(SyntaxKind.FunctionExpression) === true) ||
    callback.getParameters()[1] !== declaration ||
    callback.isAsync() ||
    enclosingFunction(call) !== callback
  ) {
    return false;
  }
  const refinement = callback.getParentIfKind(SyntaxKind.CallExpression);
  const method = refinement?.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
  return (
    refinement?.getArguments()[0] === callback &&
    method !== undefined &&
    ZOD_REFINEMENT_METHODS.has(method.getName()) &&
    namesZodImport(chainRoot(method.getExpression()))
  );
}

const COLLECTING_METHODS: ReadonlySet<string> = new Set(["add", "push"]);
const AGGREGATE_ERROR = "AggregateError";
const COUNT_MEMBERS: ReadonlySet<string> = new Set(["length", "size"]);
const NONEMPTY_OPERATORS: ReadonlySet<string> = new Set([">", "!==", "!="]);
const EQUALITY_OPERATORS: ReadonlySet<string> = new Set(["===", "=="]);
const MANY_OPERATORS: ReadonlySet<string> = new Set([">"]);
const LEAVING_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ReturnStatement,
  SyntaxKind.ThrowStatement,
  SyntaxKind.BreakStatement,
  SyntaxKind.ContinueStatement,
]);

/** The caught binding itself, a wrapper chaining it as `cause`, or a conditional whose every arm is one of those. */
function carriesFailure(node: Node, errorBinding: Node, reads?: CaughtFailureReadServices): boolean {
  const value = unwrapExpression(node);
  if (directlyCarriesBinding(value, errorBinding, reads)) {
    return true;
  }
  if (value.isKind(SyntaxKind.ConditionalExpression)) {
    return carriesFailure(value.getWhenTrue(), errorBinding, reads) && carriesFailure(value.getWhenFalse(), errorBinding, reads);
  }
  const options = value.asKind(SyntaxKind.NewExpression)?.getArguments() ?? [];
  return options.some((argument) =>
    (argument.asKind(SyntaxKind.ObjectLiteralExpression)?.getProperties() ?? []).some((property) => {
      const cause = property.asKind(SyntaxKind.PropertyAssignment);
      const initializer = cause?.getInitializer();
      return cause?.getName() === "cause" && initializer !== undefined && directlyCarriesBinding(initializer, errorBinding, reads);
    }),
  );
}

/** `new AggregateError(failures, …)` or `new AggregateError([...failures], …)`. */
function aggregateOf(thrown: Node | undefined, name: string): boolean {
  const value = thrown === undefined ? undefined : unwrapExpression(thrown).asKind(SyntaxKind.NewExpression);
  const first = value?.getArguments()?.[0];
  if (value?.getExpression().getText() !== AGGREGATE_ERROR || first === undefined) {
    return false;
  }
  const collected = unwrapExpression(first);
  const spread = collected.asKind(SyntaxKind.ArrayLiteralExpression)?.getElements() ?? [];
  return collected.getText() === name || spread.some((element) => element.asKind(SyntaxKind.SpreadElement)?.getExpression().getText() === name);
}

/** `failures.length` or `failures.size`, compared against `bound` by one of `operators`. */
function countGuard(condition: Node, name: string, operators: ReadonlySet<string>, bound: string): boolean {
  const comparison = unwrapExpression(condition).asKind(SyntaxKind.BinaryExpression);
  const count = comparison === undefined ? undefined : unwrapExpression(comparison.getLeft()).asKind(SyntaxKind.PropertyAccessExpression);
  return (
    comparison !== undefined &&
    count !== undefined &&
    COUNT_MEMBERS.has(count.getName()) &&
    unwrapExpression(count.getExpression()).getText() === name &&
    operators.has(comparison.getOperatorToken().getText()) &&
    unwrapExpression(comparison.getRight()).getText() === bound
  );
}

/** The thrown expression of a branch that is exactly one `throw`. */
function onlyThrow(branch: Node | undefined): Node | undefined {
  if (branch === undefined) {
    return;
  }
  const statements = branch.isKind(SyntaxKind.Block) ? branch.getStatements() : [branch];
  return statements.length === 1 ? statements[0]?.asKind(SyntaxKind.ThrowStatement)?.getExpression() : undefined;
}

/** `if (<guard>) throw <value>` with no else, as the guard and the thrown value. */
function guardedThrow(statement: Node | undefined): { readonly guard: Node; readonly thrown: Node } | undefined {
  const branch = statement?.asKind(SyntaxKind.IfStatement);
  const thrown = branch === undefined || branch.getElseStatement() !== undefined ? undefined : onlyThrow(branch.getThenStatement());
  return branch === undefined || thrown === undefined ? undefined : { guard: branch.getExpression(), thrown };
}

/** Does this statement (with its successor) throw the collection on every nonempty count? `throw new AggregateError`
 *  outright, behind `.length > 0` / `!== 0` (or `.size`), or the pair `=== 1 → throw c[0]` then `> 1 → aggregate`. */
function throwsEveryFailure(statement: Node, next: Node | undefined, name: string): boolean {
  if (aggregateOf(statement.asKind(SyntaxKind.ThrowStatement)?.getExpression(), name)) {
    return true;
  }
  const guarded = guardedThrow(statement);
  if (guarded !== undefined && countGuard(guarded.guard, name, NONEMPTY_OPERATORS, "0") && aggregateOf(guarded.thrown, name)) {
    return true;
  }
  const single =
    guarded !== undefined && countGuard(guarded.guard, name, EQUALITY_OPERATORS, "1") && unwrapExpression(guarded.thrown).getText() === `${name}[0]`;
  const rest = guardedThrow(next);
  return single && rest !== undefined && countGuard(rest.guard, name, MANY_OPERATORS, "1") && aggregateOf(rest.thrown, name);
}

/** Can control leave `statement` (outside any nested function) by return, throw, break or continue? */
function canLeave(statement: Node): boolean {
  return [statement, ...statement.getDescendants()].some(
    (node) => LEAVING_KINDS.has(node.getKind()) && (node === statement || enclosingFunction(node) === enclosingFunction(statement)),
  );
}

/** A RETAINED failure: a `const` collection, pushed to in the very function that declares it, which a later
 *  top-level statement of that function throws as an `AggregateError` on every nonempty count, with nothing
 *  between the push and that throw able to leave. The throw sits outside the catch, so it is read by name inside
 *  that one function, where nothing else declares the name. */
function collectionIsAggregated(call: CallExpression, receiver: Node, reads?: CaughtFailureReadServices): boolean {
  const collection = unwrapExpression(receiver);
  const declaration = collection.isKind(SyntaxKind.Identifier) ? rawFailureDeclarations(collection, reads)[0] : undefined;
  if (declaration?.isKind(SyntaxKind.VariableDeclaration) !== true || declaration.getVariableStatement()?.getDeclarationKind() !== "const") {
    return false;
  }
  const scope = enclosingFunction(declaration);
  const body = scope?.getChildrenOfKind(SyntaxKind.Block)[0];
  if (scope === undefined || body === undefined || enclosingFunction(call) !== scope) {
    return false;
  }
  const name = collection.getText();
  const shadowed = [...scope.getDescendantsOfKind(SyntaxKind.VariableDeclaration), ...scope.getDescendantsOfKind(SyntaxKind.Parameter)].some(
    (other) => other !== declaration && other.getNameNode().getText() === name,
  );
  const source = declaration.getSourceFile();
  const localAggregate = [...source.getDescendantsOfKind(SyntaxKind.ClassDeclaration), ...source.getDescendantsOfKind(SyntaxKind.VariableDeclaration)].some(
    (other) => other.getNameNode()?.getText() === AGGREGATE_ERROR,
  );
  const statements = body.getStatements();
  const at = statements.findIndex((statement) => statement.getStart() <= call.getStart() && statement.getEnd() >= call.getEnd());
  if (shadowed || localAggregate || at < 0) {
    return false;
  }
  for (let index = at + 1; index < statements.length; index += 1) {
    const statement = statements[index];
    if (statement !== undefined && throwsEveryFailure(statement, statements[index + 1], name)) {
      return !statements.slice(at, index).some(canLeave);
    }
  }
  return false;
}
