// The failure-VALUE vocabulary: is a returned/assigned value itself failure-shaped (`isFailureOutcome` and
// its mutually-recursive family — a returned governed-factory call, an object-literal outcome, a
// never-returning call), and the EXPLICIT governed sinks a statement can hand a caught binding to (a
// structured log line, the notify/toast door, an ambient stderr/reportError sink, a React setter, or a
// named security event). Both clusters are pure value/call classifiers with no statement-block walk.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import {
  ambientIdentifier,
  calleeName,
  declarationsOf,
  directlyCarriesBinding,
  hasInterveningWrite,
  importedName,
  literalMember,
  OBSERVABILITY_MODULES,
  originatesFromFactory,
  referencesBinding,
  resolvedFunction,
  staticStringValue,
} from "./caught-failure-core.ts";
import { failureNever, rawFailureDeclarations } from "./caught-failure-read.ts";

// ── the error-as-data outcome vocabulary ────────────────────────────────────────────────────────────────
// A returned VALUE owns a caught failure only when it is failure-VALUED. These are the two-sided halves: an
// explicit success discriminator REFUSES ownership outright (so `{ status: 'ok', error: err }` cannot launder
// it), a failure key owns only when its value carries the failure.
const SUCCESS_DISCRIMINATOR_RE = /^(?:ok\s*:\s*true\b|failed\s*:\s*false\b|(?:kind|status)\s*:\s*["'`](?:ok|ready|success)["'`])/iu;
const FAILED_TRUE_RE = /^failed\s*:\s*true\b/iu;
const OK_FALSE_RE = /^ok\s*:\s*false\b/iu;
const FAILURE_KEY_ASSIGNMENT_RE = /^(?:error|errors|failed|failure|navError|reason)\s*:/iu;
const FAILURE_KEY_SHORTHAND_RE = /^(?:error|errors|failed|failure|navError|reason)$/iu;
const FAILURE_DISCRIMINATOR_RE =
  /^(?:kind|status|step|verdict)\s*:\s*["'`](?:denied|error|failed|failure|invalid|rejected|refused|threw|unparseable|unproven|unreachable)/iu;
const FAILURE_WORD_RE = /error|fail|invalid|malformed|refus|unavailable|unreachable/iu;
const FAILURE_COPY_RE = /could(?:n['’]t| not)|error|fail|invalid|malformed|refus|unavailable|unreachable|not[- ]?found|not readable/iu;

function preservesFailureValue(node: Node, errorBinding: Node, reads?: CaughtFailureReadServices): boolean {
  const value = unwrapExpression(node);
  if (directlyCarriesBinding(value, errorBinding, reads)) {
    return true;
  }
  if (value.isKind(SyntaxKind.TemplateExpression)) {
    return referencesBinding(value, errorBinding, reads);
  }
  if (value.isKind(SyntaxKind.ConditionalExpression)) {
    return preservesFailureValue(value.getWhenTrue(), errorBinding, reads) && preservesFailureValue(value.getWhenFalse(), errorBinding, reads);
  }
  if (value.isKind(SyntaxKind.PropertyAccessExpression)) {
    return directlyCarriesBinding(value.getExpression(), errorBinding, reads) && /^(?:cause|code|message|name|stack)$/u.test(value.getName());
  }
  const onlyArgument = value.isKind(SyntaxKind.CallExpression) && value.getArguments().length === 1 ? value.getArguments()[0] : undefined;
  if (!value.isKind(SyntaxKind.CallExpression) || onlyArgument === undefined || !directlyCarriesBinding(onlyArgument, errorBinding, reads)) {
    return false;
  }
  const callee = unwrapExpression(value.getExpression());
  return (
    ambientIdentifier(callee, "String", new Set(), reads) ||
    importedName(callee, new Set(["@orb/kit/error-message", "#primitives/error-message"]), reads) === "errorMessage"
  );
}

/** One PROPERTY of a candidate outcome object. A failure-NAMED key is only failure-VALUED when its value
 *  carries the caught failure or reads as failure copy — `{ error: null }` is a cleared slot, not an owner. */
function failurePropertyOwns(property: Node, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const text = property.getText();
  if (FAILED_TRUE_RE.test(text)) {
    return true;
  }
  const assigned = FAILURE_KEY_ASSIGNMENT_RE.test(text) && property.isKind(SyntaxKind.PropertyAssignment) ? property.getInitializer() : undefined;
  if (assigned !== undefined) {
    const initializer = unwrapExpression(assigned);
    if (errorBinding !== undefined && preservesFailureValue(initializer, errorBinding, reads)) {
      return true;
    }
    const literal = initializer.isKind(SyntaxKind.StringLiteral) || initializer.isKind(SyntaxKind.NoSubstitutionTemplateLiteral);
    return literal && FAILURE_WORD_RE.test(initializer.getLiteralValue());
  }
  if (FAILURE_KEY_SHORTHAND_RE.test(text) && errorBinding !== undefined) {
    return directlyCarriesBinding(property, errorBinding, reads);
  }
  return OK_FALSE_RE.test(text) || FAILURE_DISCRIMINATOR_RE.test(text);
}

/** An object outcome. An explicit SUCCESS discriminator wins outright — carrying the caught error as
 *  incidental data beside `status: 'ok'` is exactly the laundering shape this gate exists to refuse. */
function objectIsFailureOutcome(value: Node, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const properties = value.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperties();
  if (properties.some((property) => SUCCESS_DISCRIMINATOR_RE.test(property.getText()))) {
    return false;
  }
  return properties.some((property) => failurePropertyOwns(property, errorBinding, reads));
}

/** A call that CANNOT RETURN — `never` (sync) or `Promise<never>` (async). Control can only leave it by
 *  throwing or rejecting, so it is PROPAGATION: the strongest ownership there is, and it does not depend on
 *  the catch having a binding. The sync half is why `return throwDecryptFailure(sealed)` — a `never`-typed
 *  helper that logs the typed error and throws it — is ownership rather than a swallow; without it the gate
 *  demanded a marker for the one shape it should reward most. */
function cannotReturn(node: Node, reads?: CaughtFailureReadServices): boolean {
  if (failureNever(node, reads)) {
    return true;
  }
  if (reads === undefined) {
    const type = node.getType();
    return type.getText().startsWith("Promise<") && type.getTypeArguments().some((argument) => argument.isNever());
  }
  const selector = nodeTypeSelector(node);
  return (
    reads.types.defaultDisplay(selector).startsWith("Promise<") &&
    reads.types.typeArguments(selector).some((argument) => {
      const selected = reads.types.select(argument);
      if (selected === null) {
        throw new Error("native caught-failure Type argument is absent");
      }
      return reads.types.type(selected).never;
    })
  );
}

export function isNativePromiseReject(call: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const member = literalMember(call.getExpression(), reads);
  if (member?.name !== "reject" || !member.receiver.isKind(SyntaxKind.Identifier) || member.receiver.getText() !== "Promise" || errorBinding === undefined) {
    return false;
  }
  const locallyShadowed = rawFailureDeclarations(member.receiver, reads).some(
    (declaration) => declaration.getSourceFile() === call.getSourceFile() && !declaration.getSourceFile().isDeclarationFile(),
  );
  return !locallyShadowed && call.getArguments().some((argument) => referencesBinding(argument, errorBinding, reads));
}

function callIsFailureOutcome(value: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const type = reads === undefined ? value.getType() : reads.types.select(nodeTypeSelector(value));
  if (type === null) {
    throw new Error("native caught-failure call Type is absent");
  }
  // A typed refusal owns without the caught binding: its type or single-return factory body is the proof.
  return (
    isNativePromiseReject(value, errorBinding, reads) ||
    cannotReturn(value, reads) ||
    typeIsFailureOutcome(value, reads) ||
    governedFailureFactoryCall(value, reads)
  );
}

export function isFailureOutcome(node: Node, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const value = unwrapExpression(node);
  if (errorBinding !== undefined && failureNever(value, reads) && referencesBinding(value, errorBinding, reads)) {
    return true;
  }
  if (value.isKind(SyntaxKind.ConditionalExpression)) {
    return isFailureOutcome(value.getWhenTrue(), errorBinding, reads) && isFailureOutcome(value.getWhenFalse(), errorBinding, reads);
  }
  if (value.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return objectIsFailureOutcome(value, errorBinding, reads);
  }
  if (value.isKind(SyntaxKind.CallExpression)) {
    return callIsFailureOutcome(value, errorBinding, reads);
  }
  if (errorBinding !== undefined && preservesFailureValue(value, errorBinding, reads)) {
    return true;
  }
  if (value.isKind(SyntaxKind.StringLiteral) || value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return FAILURE_COPY_RE.test(value.getLiteralValue());
  }
  return false;
}

/** A helper is a failure FACTORY only when EVERY path returns a failure-valued outcome — which a syntactic
 *  reader can only prove for a single-expression body or a single-return block. An implicit `undefined`
 *  fallthrough is a recovered success path, so the caller still absorbs. */
function factoryReturnsFailure(declaration: Node, callee: Node, reads?: CaughtFailureReadServices): boolean {
  if (callee.isKind(SyntaxKind.Identifier) && hasInterveningWrite(callee, declaration, reads)) {
    return false;
  }
  const fn = resolvedFunction(declaration);
  if (fn === undefined || !(fn.isKind(SyntaxKind.FunctionDeclaration) || fn.isKind(SyntaxKind.ArrowFunction))) {
    return false;
  }
  const errorBinding = fn.getParameters()[0]?.getNameNode();
  const body = fn.getBody();
  if (body === undefined) {
    return false;
  }
  if (!body.isKind(SyntaxKind.Block)) {
    return isFailureOutcome(body, errorBinding, reads);
  }
  const statements = body.getStatements();
  const only = statements.length === 1 ? statements[0] : undefined;
  const expression = only?.isKind(SyntaxKind.ReturnStatement) === true ? only.getExpression() : undefined;
  return expression !== undefined && isFailureOutcome(expression, errorBinding, reads);
}

function governedFailureFactoryCall(call: CallExpression, reads?: CaughtFailureReadServices): boolean {
  const callee = unwrapExpression(call.getExpression());
  return declarationsOf(call.getExpression(), reads).some((declaration) => factoryReturnsFailure(declaration, callee, reads));
}

function typeIsFailureOutcome(node: Node, reads?: CaughtFailureReadServices): boolean {
  const type = reads === undefined ? node.getType() : undefined;
  const propertyValues = (name: string): readonly unknown[] => {
    if (reads !== undefined) {
      const selector = { ...nodeTypeSelector(node), steps: [{ kind: "property" as const, name, at: node }] };
      if (reads.types.select(selector) === null) {
        return [];
      }
      const unions = reads.types.unions(selector);
      return (unions.length === 0 ? [selector] : unions).map((part) => reads.types.literalValue(part)).filter((value) => value !== undefined);
    }
    if (type === undefined) {
      throw new Error("native caught-failure property Type is absent");
    }
    const symbol = type.getProperty(name);
    if (symbol === undefined) {
      return [];
    }
    const propertyType = symbol.getTypeAtLocation(node);
    return (propertyType.isUnion() ? propertyType.getUnionTypes() : [propertyType])
      .map((part) => part.getLiteralValue())
      .filter((value) => value !== undefined);
  };
  const ok = propertyValues("ok");
  if (ok.length > 0 && ok.every((value) => value === false)) {
    return true;
  }
  const failureKinds = new Set(["error", "failed", "failure", "invalid", "rejected", "refused", "unparseable", "unproven", "unreachable", "threw", "denied"]);
  for (const name of ["kind", "status", "step", "verdict"]) {
    const values = propertyValues(name);
    if (values.length > 0 && values.every((value) => typeof value === "string" && failureKinds.has(value))) {
      return true;
    }
  }
  return false;
}

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
  return stateSetterOwns(call, name, errorBinding, reads);
}
