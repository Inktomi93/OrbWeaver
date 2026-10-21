// The EXPLICIT governed sinks a statement can hand a caught binding to: a structured log line, the notify/toast
// door, an ambient stderr/reportError sink, a React setter, a named security event, or a zod refinement issue.
// Each is provenance-checked; the failure-VALUE vocabulary they reuse lives in caught-failure-outcome.ts.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import { COLLECTING_METHODS, collectionIsAggregated } from "./caught-failure-collection.ts";
import {
  ambientIdentifier,
  calleeName,
  FUNCTION_KINDS,
  hasInterveningWrite,
  importedName,
  literalMember,
  OBSERVABILITY_MODULES,
  originatesFromFactory,
  referencesBinding,
  sourceDeclaresName,
  sourceNameImports,
  staticStringValue,
} from "./caught-failure-core.ts";
import { carriesFailure, isFailureOutcome } from "./caught-failure-outcome.ts";
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

function canonicalLogReceiverStable(node: Node, reads?: CaughtFailureReadServices): boolean {
  let value = unwrapExpression(node);
  for (;;) {
    if (value.isKind(SyntaxKind.ThisKeyword)) {
      return true;
    }
    const declaration = rawFailureDeclarations(value, reads)[0];
    if (declaration !== undefined && hasInterveningWrite(value, declaration, reads)) {
      return false;
    }
    const member = literalMember(value, reads);
    if (member === undefined) {
      return value.isKind(SyntaxKind.Identifier) && declaration !== undefined;
    }
    value = member.receiver;
  }
}

function isStructuredLog(call: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const name = calleeName(call, reads);
  if (name === undefined || !LOG_METHODS.has(name) || errorBinding === undefined) {
    return false;
  }
  const member = literalMember(call.getExpression(), reads);
  const inferenceLog = rawFailureDeclarations(call.getExpression(), reads, true).some(
    (declaration) =>
      declaration.getSourceFile().getFilePath().endsWith("/packages/inference/src/contract/runtime.ts") &&
      declaration.getParentIfKind(SyntaxKind.InterfaceDeclaration)?.getName() === "InferenceLog",
  );
  if (
    member === undefined ||
    !((inferenceLog && canonicalLogReceiverStable(member.receiver, reads)) || loggerReceiverOwns(member.receiver, undefined, reads))
  ) {
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

/** A locally shadowed native name cannot lend the built-in constructor or imported port its contract. */
function shadowedNative(source: Node, name: string): boolean {
  return sourceDeclaresName(source.getSourceFile(), name);
}

/** The controller parameter of a native stream's own source callback, not a controller-shaped argument. */
function nativeStreamController(receiver: Node, reads?: CaughtFailureReadServices): boolean {
  const parameter = rawFailureDeclarations(receiver, reads)[0]?.asKind(SyntaxKind.Parameter);
  const callback = parameter?.getParentIfKind(SyntaxKind.MethodDeclaration);
  const source = callback?.getParentIfKind(SyntaxKind.ObjectLiteralExpression);
  const construct = source?.getParentIfKind(SyntaxKind.NewExpression);
  if (callback === undefined || construct === undefined) {
    return false;
  }
  return (
    parameter !== undefined &&
    !hasInterveningWrite(receiver, parameter, reads) &&
    parameter === callback.getParameters()[0] &&
    ["pull", "start"].includes(callback.getName()) &&
    construct?.getArguments()[0] === source &&
    construct.getExpression().getText() === "ReadableStream" &&
    !shadowedNative(construct.getSourceFile(), "ReadableStream") &&
    sourceNameImports(construct.getSourceFile(), "ReadableStream").every(
      (declaration) =>
        declaration.getModuleSpecifierValue() === "node:stream/web" &&
        declaration.getNamedImports().some((specifier) => specifier.getName() === "ReadableStream" && specifier.getAliasNode() === undefined),
    )
  );
}

function streamErrorOwns(call: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const member = literalMember(call.getExpression(), reads);
  return (
    member?.name === "error" &&
    errorBinding !== undefined &&
    call.getArguments().some((argument) => carriesFailure(argument, errorBinding, reads)) &&
    nativeStreamController(member.receiver, reads)
  );
}

const DNS_LOOKUP_CALLBACK_INDEX = 2;

/** The native LookupFunction error slot, established by the returned callback's explicit Node port. */
function nativeLookupCallback(call: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  if (errorBinding === undefined || !call.getExpression().isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const parameter = rawFailureDeclarations(call.getExpression(), reads)[0]?.asKind(SyntaxKind.Parameter);
  const callback = parameter?.getParentIfKind(SyntaxKind.ArrowFunction);
  const returned = callback?.getParentIfKind(SyntaxKind.ReturnStatement);
  const owner = returned?.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
  const type = owner?.getReturnTypeNode()?.asKind(SyntaxKind.TypeReference);
  const port = type?.getTypeName().getText();
  const first = call.getArguments()[0];
  return (
    callback !== undefined &&
    parameter !== undefined &&
    !hasInterveningWrite(call.getExpression(), parameter, reads) &&
    parameter === callback.getParameters()[DNS_LOOKUP_CALLBACK_INDEX] &&
    returned?.getExpression() === callback &&
    port !== undefined &&
    first !== undefined &&
    carriesFailure(first, errorBinding, reads) &&
    !shadowedNative(call.getSourceFile(), port) &&
    call
      .getSourceFile()
      .getImportDeclarations()
      .some(
        (declaration) =>
          declaration.getModuleSpecifierValue() === "node:net" &&
          declaration
            .getNamedImports()
            .some((specifier) => specifier.getName() === "LookupFunction" && (specifier.getAliasNode() ?? specifier.getNameNode()).getText() === port),
      )
  );
}

export function isExplicitOwnerCall(call: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  if (isSkippableCall(call)) {
    return false;
  }
  const name = calleeName(call, reads);
  if (name === undefined) {
    return false;
  }
  if (
    isStructuredLog(call, errorBinding, reads) ||
    securityEventOwns(call, reads) ||
    nativeLookupCallback(call, errorBinding, reads) ||
    streamErrorOwns(call, errorBinding, reads)
  ) {
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
