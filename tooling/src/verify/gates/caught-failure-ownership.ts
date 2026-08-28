// Gate: caught-failure-ownership — a SYNTACTICALLY handled rejection is not ownership. Reports UNPROVEN
// OWNERSHIP (never "bug") for three arms over `packages/*/src` + `tooling/src` (.ts AND .tsx): a discarded
// promise rejection handler, a catch with no owning continuation, and a silent DEFAULT return. The gate
// rewards RUNTIME ownership, not syntax cosplay — every owner is provenance-checked.
//
// ── THE ARMS ────────────────────────────────────────────────────────────────────────────────────────────
//   promise:<work>  a `.catch(h)` / `.then(_, h)` — in ANY spelling: dot or bracket key (literal,
//                   parenthesized, literal-typed, `+`-concatenated, same-file const), optional access, and
//                   `call` / `apply` / `Reflect.apply` / a bound alias — whose handler discards the failure.
//   empty:<binding> a CatchClause whose block (and its `finally`) names no owner.
//   default:<binding> a catch whose only escape is a constant fallback (`return null` / `[]` / `{}` / `-1`).
//                   The behaviour changed and nobody was told; the failure contract is unstated.
//
// ── WHAT PASSES, AND WHY IT IS ALL PROVENANCE ───────────────────────────────────────────────────────────
// Rethrow · `Promise.reject(err)` of the caught binding (the NATIVE one; a local object named `Promise`
// does not launder) · a structured contextual log on the governed pino/`getLog` logger · the governed
// `notify`/toast manager carrying the failure with non-success copy · a genuine React `useState` SETTER
// slot (tuple element [1]) fed a failure-VALUED argument · TanStack query/form and `createEntityMutation`
// with a failure-valued `errorToast` · `withRequestSpan` · a named handler that itself owns · an
// error-as-data outcome that a real consumer reads. A success discriminator (`{ status: 'ok', error: err }`)
// REFUSES ownership: carrying the error as incidental data beside a success verdict is the laundering shape.
// Reassignment kills provenance — a governed initializer overwritten by `x = fake` owns nothing after.
//
// ── EXEMPTION ───────────────────────────────────────────────────────────────────────────────────────────
// ONE adjacent `// @orb-gate-ignore caught-failure-ownership(<reported-position>): <owner/surface or why
// safe + end condition>`, stale-checked by `gate-ignore-inventory` (malformed / unregistered / stale /
// over-exempt). A LIVE exact-position `@swallowed-ok` already two-sided by `detached-work-traced` is
// accepted as existing machine-visible evidence; a wrong, malformed, or stale position is not.
//
// ── DECLARED LIMITS (each with a mustPass row) ──────────────────────────────────────────────────────────
// A dynamically-keyed rejection link is unreadable, not assumed · zod's `.catch()` combinator is schema
// construction, not a promise · package build/config files outside `packages/<name>/src` are out of the
// governed corpus · `tests/` and `scripts/` are outside this gate's scanRoot (the pinned harness boundary:
// tests are golden/cleanup behaviour, and `scripts/` carries no runtime failure contract) · a rethrow or
// owner routed through an opaque helper is invisible to a syntactic reader.
import type { BindingElement, Block, CallExpression, CatchClause, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { hasLiveDetachedSwallowOwner } from "./detached-work-traced.ts";

const LOG_METHODS: ReadonlySet<string> = new Set(["error", "fatal", "warn"]);
/** The GOVERNED operator-logger doors. A log-shaped method on an arbitrary object proves nothing — provenance
 *  is what separates the repo's observable operator surface from a local `{ warn() {} }` stand-in. */
const LOGGER_MODULES: ReadonlySet<string> = new Set(["#foundation/observability", "#foundation/observability/logging", "./logger.ts"]);
const OBSERVABILITY_MODULES: ReadonlySet<string> = new Set(["#foundation/observability", "#foundation/observability/logging"]);
const NOTICE_RECEIVER_RE = /(?:^|\.)(?:notify|toast)$/u;
/** Copy that says the operation SUCCEEDED. A notice reading "Saved successfully." cannot be the owner of the
 *  failure it is displayed for, no matter what it carries in its metadata. */
const SUCCESS_COPY_RE = /^(?:done|ready|saved(?: successfully)?|success|succeeded|completed successfully)[.!]?$/iu;
const PROCESS_STDERR_RE = /(?:^|\.)process\.stderr$/u;
const SETTER_NAME_RE = /^set[A-Z]/u;
const FAILURE_SUFFIX_RE = /(?:Error|Failed|Failure)$/u;

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
const FAILURE_WORD_RE = /(?:error|fail|invalid|malformed|refus|unavailable|unreachable)/iu;
const FAILURE_COPY_RE = /(?:could(?:n['’]t| not)|error|fail|invalid|malformed|refus|unavailable|unreachable|not[- ]?found|not readable)/iu;
const REJECTION_HANDLER_INDEX: ReadonlyMap<string, number> = new Map([
  ["catch", 0],
  ["then", 1],
]);
/** Chain PLUMBING — walked through to reach the work that actually produced the promise. */
const PROMISE_CHAIN_LINKS: ReadonlySet<string> = new Set(["catch", "finally", "then"]);
const NOOP_TEXT: ReadonlySet<string> = new Set(["undefined", "null", "false", "true", "0", "-1", '""', "''", "void 0"]);
const FUNCTION_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.MethodDeclaration,
]);

const MESSAGE =
  "UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced (tooling/src/verify/gates/GATE-AUTHORING.md §4).";
const FIX =
  "make the owner machine-visible: propagate; set error/terminal/form/query state; emit a contextual structured log/span; or route through a named owner boundary. For a deliberately safe fail-closed, cleanup, or outer-engine absorber, add `// @orb-gate-ignore caught-failure-ownership(<reported-position>): <owner/surface or why safe + end condition>` immediately above the guarded try/catch or promise statement. Do not add a comment where a real toast/state/log/terminal path is required.";

const DETACHED_TRACING_MODULE = "packages/server/src/foundation/observability/tracing.ts";
const DETACHED_TRACING_FIXTURE =
  "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
  "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n" +
  "}\n";

function literalMember(node: Node): { readonly name: string; readonly receiver: Node } | undefined {
  const member = unwrapExpression(node);
  if (member.isKind(SyntaxKind.PropertyAccessExpression)) {
    return { name: member.getName(), receiver: unwrapExpression(member.getExpression()) };
  }
  if (!member.isKind(SyntaxKind.ElementAccessExpression)) {
    return;
  }
  const key = member.getArgumentExpression();
  const name = key === undefined ? undefined : staticStringValue(key);
  return name === undefined ? undefined : { name, receiver: unwrapExpression(member.getExpression()) };
}

function staticStringValue(node: Node): string | undefined {
  const typedLiteral = node.getType().getLiteralValue();
  if (typeof typedLiteral === "string") {
    return typedLiteral;
  }
  const value = unwrapExpression(node);
  if (value.isKind(SyntaxKind.StringLiteral) || value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return value.getLiteralValue();
  }
  if (value.isKind(SyntaxKind.BinaryExpression) && value.getOperatorToken().getText() === "+") {
    const left = staticStringValue(value.getLeft());
    const right = staticStringValue(value.getRight());
    return left === undefined || right === undefined ? undefined : left + right;
  }
  const literal = value.getType().getLiteralValue();
  if (typeof literal === "string") {
    return literal;
  }
  if (!value.isKind(SyntaxKind.Identifier)) {
    return;
  }
  const declaration = value.getSymbol()?.getDeclarations()[0];
  if (declaration?.isKind(SyntaxKind.VariableDeclaration) !== true || declaration.getVariableStatement()?.getDeclarationKind() !== "const") {
    return;
  }
  const initializer = declaration.getInitializer();
  return initializer === undefined ? undefined : staticStringValue(initializer);
}

function calleeName(call: CallExpression): string | undefined {
  const callee = unwrapExpression(call.getExpression());
  const member = literalMember(callee);
  if (member !== undefined) {
    return member.name;
  }
  return callee.isKind(SyntaxKind.Identifier) ? callee.getText() : undefined;
}

function isFallback(node: Node): boolean {
  const value = unwrapExpression(node);
  if (NOOP_TEXT.has(value.getText())) {
    return true;
  }
  if (value.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return value.getElements().length === 0;
  }
  return value.isKind(SyntaxKind.ObjectLiteralExpression) && value.getProperties().length === 0;
}

function referencesBinding(node: Node, binding: Node): boolean {
  const symbol = binding.getSymbol();
  if (symbol === undefined) {
    return false;
  }
  const declaration = binding.getParent();
  if (declaration === undefined) {
    return false;
  }
  const matches = (candidate: Node): boolean =>
    candidate.getSourceFile().getFilePath() === declaration.getSourceFile().getFilePath() &&
    candidate.getStart() === declaration.getStart() &&
    candidate.getKind() === declaration.getKind();
  const identifierMatches = (identifier: Node): boolean =>
    identifier.isKind(SyntaxKind.Identifier) &&
    identifier.getDefinitions().some((definition) => {
      const candidate = definition.getDeclarationNode();
      return candidate !== undefined && matches(candidate);
    });
  return (node.isKind(SyntaxKind.Identifier) && identifierMatches(node)) || node.getDescendantsOfKind(SyntaxKind.Identifier).some(identifierMatches);
}

function isStructuredLog(call: CallExpression, errorBinding: Node | undefined): boolean {
  const name = calleeName(call);
  if (name === undefined || !LOG_METHODS.has(name) || errorBinding === undefined) {
    return false;
  }
  const member = literalMember(call.getExpression());
  if (member === undefined || !loggerReceiverOwns(member.receiver)) {
    return false;
  }
  const [context, message] = call.getArguments();
  return context?.isKind(SyntaxKind.ObjectLiteralExpression) === true && referencesBinding(context, errorBinding) && contextualLogMessage(message);
}

function contextualLogMessage(node: Node | undefined): boolean {
  if (node?.isKind(SyntaxKind.StringLiteral) !== true && node?.isKind(SyntaxKind.NoSubstitutionTemplateLiteral) !== true) {
    return false;
  }
  const message = node.getLiteralValue().trim();
  return message.length > 0 && !/^(?:error|failed|failure|exception)$/iu.test(message) && (message.split(/\s+/u).length > 1 || /[:./-]/u.test(message));
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

function identifierLoggerOwns(value: Node, nextSeen: ReadonlySet<Node>): boolean {
  const declaration = value.getSymbol()?.getDeclarations()[0];
  if (declaration !== undefined && hasInterveningWrite(value, declaration)) {
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
  return initializer !== undefined && loggerReceiverOwns(initializer, nextSeen);
}

function loggerReceiverOwns(node: Node, seen: ReadonlySet<Node> = new Set()): boolean {
  const value = unwrapExpression(node);
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen).add(value);
  if (value.isKind(SyntaxKind.Identifier)) {
    return identifierLoggerOwns(value, nextSeen);
  }
  if (value.isKind(SyntaxKind.CallExpression)) {
    const callee = unwrapExpression(value.getExpression());
    if (importedName(callee, LOGGER_MODULES) === "getLog") {
      return true;
    }
    const member = literalMember(callee);
    return member?.name === "child" && loggerReceiverOwns(member.receiver, nextSeen);
  }
  const member = literalMember(value);
  return member !== undefined && loggerReceiverOwns(member.receiver, nextSeen);
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

/** The USER-VISIBLE surface: the governed `notify`/toast manager only, carrying either the caught binding or —
 *  when the catch is bindingless — failure-valued copy. Success copy is not an owner even beside a `cause`. */
function noticeOwns(call: CallExpression, member: { readonly receiver: Node }, errorBinding: Node | undefined): boolean {
  if (!(NOTICE_RECEIVER_RE.test(member.receiver.getText()) && noticeReceiverOwns(member.receiver))) {
    return false;
  }
  const primary = call.getArguments()[0];
  if (primary?.isKind(SyntaxKind.StringLiteral) === true && SUCCESS_COPY_RE.test(primary.getLiteralValue().trim())) {
    return false;
  }
  return errorBinding === undefined ? call.getArguments().some((argument) => isFailureOutcome(argument, undefined)) : referencesBinding(call, errorBinding);
}

/** The two AMBIENT operator sinks. Both are provenance-checked: a parameter named `process`/`globalThis` does
 *  not inherit the real boundary. */
function ambientSinkOwns(call: CallExpression, name: string, member: { readonly receiver: Node }, errorBinding: Node | undefined): boolean {
  if (errorBinding === undefined || !referencesBinding(call, errorBinding)) {
    return false;
  }
  if (name === "write" && PROCESS_STDERR_RE.test(member.receiver.getText())) {
    const processId = member.receiver.getFirstDescendantByKind(SyntaxKind.Identifier);
    return processId !== undefined && ambientIdentifier(processId, "process", new Set(["node:process"]));
  }
  return name === "reportError" && member.receiver.getText() === "globalThis" && ambientIdentifier(member.receiver, "globalThis", new Set());
}

/** A genuine React setter slot fed a failure-valued argument — the observable-state owner. The `Error`/`Failed`
 *  name suffix admits the boolean flag spelling; a merely setter-SHAPED local does not qualify. */
function stateSetterOwns(call: CallExpression, name: string, errorBinding: Node | undefined): boolean {
  if (!(SETTER_NAME_RE.test(name) && originatesFromFactory(call.getExpression(), new Set(["react"]), new Set(["useState"])))) {
    return false;
  }
  if (call.getArguments().some((argument) => isFailureOutcome(argument, errorBinding))) {
    return true;
  }
  return FAILURE_SUFFIX_RE.test(name) && call.getArguments().some((argument) => unwrapExpression(argument).getText() === "true");
}

function isExplicitOwnerCall(call: CallExpression, errorBinding: Node | undefined): boolean {
  if (isSkippableCall(call)) {
    return false;
  }
  const name = calleeName(call);
  if (name === undefined) {
    return false;
  }
  if (isStructuredLog(call, errorBinding)) {
    return true;
  }
  const member = literalMember(call.getExpression());
  if (member !== undefined && (name === "error" || name === "warning")) {
    return noticeOwns(call, member, errorBinding);
  }
  if (member !== undefined && (name === "write" || name === "reportError")) {
    return ambientSinkOwns(call, name, member, errorBinding);
  }
  return stateSetterOwns(call, name, errorBinding);
}

function ambientIdentifier(node: Node, name: string, importModules: ReadonlySet<string>): boolean {
  if (!node.isKind(SyntaxKind.Identifier) || node.getText() !== name) {
    return false;
  }
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  return declarations.every((declaration) => {
    if (declaration.getSourceFile() !== node.getSourceFile() || declaration.getSourceFile().isDeclarationFile()) {
      return true;
    }
    const module = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
    return module !== undefined && importModules.has(module);
  });
}

function noticeReceiverOwns(node: Node): boolean {
  const value = unwrapExpression(node);
  if (!value.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const declaration = value.getSymbol()?.getDeclarations()[0];
  if (declaration?.isKind(SyntaxKind.Parameter) === true) {
    return false;
  }
  if (declaration?.isKind(SyntaxKind.ImportSpecifier) === true) {
    const module = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
    return declaration.getName() === "notify" && (module === "#lib" || module?.endsWith("/notify.ts") === true);
  }
  return originatesFromFactory(value, new Set(["@orb/ui/toast"]), new Set(["useToastManager"]));
}

function preservesFailureValue(node: Node, errorBinding: Node): boolean {
  const value = unwrapExpression(node);
  if (directlyCarriesBinding(value, errorBinding)) {
    return true;
  }
  if (value.isKind(SyntaxKind.TemplateExpression)) {
    return referencesBinding(value, errorBinding);
  }
  if (value.isKind(SyntaxKind.ConditionalExpression)) {
    return preservesFailureValue(value.getWhenTrue(), errorBinding) && preservesFailureValue(value.getWhenFalse(), errorBinding);
  }
  if (value.isKind(SyntaxKind.PropertyAccessExpression)) {
    return directlyCarriesBinding(value.getExpression(), errorBinding) && /^(?:cause|code|message|name|stack)$/u.test(value.getName());
  }
  const onlyArgument = value.isKind(SyntaxKind.CallExpression) && value.getArguments().length === 1 ? value.getArguments()[0] : undefined;
  if (!value.isKind(SyntaxKind.CallExpression) || onlyArgument === undefined || !directlyCarriesBinding(onlyArgument, errorBinding)) {
    return false;
  }
  const callee = unwrapExpression(value.getExpression());
  return ambientIdentifier(callee, "String", new Set()) || importedName(callee, new Set(["@orb/kit/error-message", "#kit/error-message"])) === "errorMessage";
}

/** One PROPERTY of a candidate outcome object. A failure-NAMED key is only failure-VALUED when its value
 *  carries the caught failure or reads as failure copy — `{ error: null }` is a cleared slot, not an owner. */
function failurePropertyOwns(property: Node, errorBinding: Node | undefined): boolean {
  const text = property.getText();
  if (FAILED_TRUE_RE.test(text)) {
    return true;
  }
  const assigned = FAILURE_KEY_ASSIGNMENT_RE.test(text) && property.isKind(SyntaxKind.PropertyAssignment) ? property.getInitializer() : undefined;
  if (assigned !== undefined) {
    const initializer = unwrapExpression(assigned);
    if (errorBinding !== undefined && preservesFailureValue(initializer, errorBinding)) {
      return true;
    }
    const literal = initializer.isKind(SyntaxKind.StringLiteral) || initializer.isKind(SyntaxKind.NoSubstitutionTemplateLiteral);
    return literal && FAILURE_WORD_RE.test(initializer.getLiteralValue());
  }
  if (FAILURE_KEY_SHORTHAND_RE.test(text) && errorBinding !== undefined) {
    return directlyCarriesBinding(property, errorBinding);
  }
  return OK_FALSE_RE.test(text) || FAILURE_DISCRIMINATOR_RE.test(text);
}

/** An object outcome. An explicit SUCCESS discriminator wins outright — carrying the caught error as
 *  incidental data beside `status: 'ok'` is exactly the laundering shape this gate exists to refuse. */
function objectIsFailureOutcome(value: Node, errorBinding: Node | undefined): boolean {
  const properties = value.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperties();
  if (properties.some((property) => SUCCESS_DISCRIMINATOR_RE.test(property.getText()))) {
    return false;
  }
  return properties.some((property) => failurePropertyOwns(property, errorBinding));
}

function callIsFailureOutcome(value: CallExpression, errorBinding: Node | undefined): boolean {
  const type = value.getType();
  const neverReturning = type.getText().startsWith("Promise<") && type.getTypeArguments().some((argument) => argument.isNever());
  if (isNativePromiseReject(value, errorBinding) || neverReturning) {
    return true;
  }
  if (errorBinding === undefined || !referencesBinding(value, errorBinding)) {
    return false;
  }
  return type.isNever() || typeIsFailureOutcome(value) || governedFailureFactoryCall(value);
}

function isFailureOutcome(node: Node, errorBinding: Node | undefined): boolean {
  const value = unwrapExpression(node);
  if (errorBinding !== undefined && value.getType().isNever() && referencesBinding(value, errorBinding)) {
    return true;
  }
  if (value.isKind(SyntaxKind.ConditionalExpression)) {
    return isFailureOutcome(value.getWhenTrue(), errorBinding) && isFailureOutcome(value.getWhenFalse(), errorBinding);
  }
  if (value.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return objectIsFailureOutcome(value, errorBinding);
  }
  if (value.isKind(SyntaxKind.CallExpression)) {
    return callIsFailureOutcome(value, errorBinding);
  }
  if (errorBinding !== undefined && preservesFailureValue(value, errorBinding)) {
    return true;
  }
  if (value.isKind(SyntaxKind.StringLiteral) || value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return FAILURE_COPY_RE.test(value.getLiteralValue());
  }
  return false;
}

/** The VALUE node of an object property, either spelling (`{ errorToast: x }` / `{ errorToast }`). */
function propertyValueNode(property: Node | undefined): Node | undefined {
  if (property?.isKind(SyntaxKind.PropertyAssignment) === true) {
    return property.getInitializer();
  }
  return property?.isKind(SyntaxKind.ShorthandPropertyAssignment) === true ? property.getNameNode() : undefined;
}

function directlyCarriesBinding(node: Node, binding: Node): boolean {
  const value = unwrapExpression(node);
  return value.isKind(SyntaxKind.Identifier) && referencesBinding(value, binding);
}

/** The function a call resolves to — a declaration, or a `const f = (…) => …` initializer. */
function resolvedFunction(declaration: Node): Node | undefined {
  if (declaration.isKind(SyntaxKind.FunctionDeclaration)) {
    return declaration;
  }
  return declaration.isKind(SyntaxKind.VariableDeclaration) ? declaration.getInitializer() : undefined;
}

/** A helper is a failure FACTORY only when EVERY path returns a failure-valued outcome — which a syntactic
 *  reader can only prove for a single-expression body or a single-return block. An implicit `undefined`
 *  fallthrough is a recovered success path, so the caller still absorbs. */
function factoryReturnsFailure(declaration: Node, callee: Node): boolean {
  if (callee.isKind(SyntaxKind.Identifier) && hasInterveningWrite(callee, declaration)) {
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
    return isFailureOutcome(body, errorBinding);
  }
  const statements = body.getStatements();
  const only = statements.length === 1 ? statements[0] : undefined;
  const expression = only?.isKind(SyntaxKind.ReturnStatement) === true ? only.getExpression() : undefined;
  return expression !== undefined && isFailureOutcome(expression, errorBinding);
}

function governedFailureFactoryCall(call: CallExpression): boolean {
  const callee = unwrapExpression(call.getExpression());
  return declarationsOf(call.getExpression()).some((declaration) => factoryReturnsFailure(declaration, callee));
}

function typeIsFailureOutcome(node: Node): boolean {
  const type = node.getType();
  const propertyValues = (name: string): readonly unknown[] => {
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

function isNativePromiseReject(call: CallExpression, errorBinding: Node | undefined): boolean {
  const member = literalMember(call.getExpression());
  if (member?.name !== "reject" || !member.receiver.isKind(SyntaxKind.Identifier) || member.receiver.getText() !== "Promise" || errorBinding === undefined) {
    return false;
  }
  const locallyShadowed = (member.receiver.getSymbol()?.getDeclarations() ?? []).some(
    (declaration) => declaration.getSourceFile() === call.getSourceFile() && !declaration.getSourceFile().isDeclarationFile(),
  );
  return !locallyShadowed && call.getArguments().some((argument) => referencesBinding(argument, errorBinding));
}

function insideNestedFunction(node: Node, boundary: Node): boolean {
  let current: Node | undefined = node.getParent();
  while (current !== undefined && current !== boundary) {
    if (FUNCTION_KINDS.has(current.getKind())) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}

function escapingDescendants<T extends Node>(block: Block, kind: SyntaxKind, nodes: readonly T[]): readonly T[] {
  return nodes.filter((node) => !insideNestedFunction(node, block) && node.getKind() === kind);
}

type OwnerVerdict = "escape" | "none" | "owner";

function hasNestedEscape(statement: Node): boolean {
  return [SyntaxKind.ReturnStatement, SyntaxKind.BreakStatement, SyntaxKind.ContinueStatement].some((kind) =>
    statement.getDescendants().some((node) => node.getKind() === kind && !insideNestedFunction(node, statement)),
  );
}

function assignmentOwns(expression: Node, errorBinding: Node | undefined): boolean {
  if (errorBinding === undefined || !expression.isKind(SyntaxKind.BinaryExpression)) {
    return false;
  }
  const left = expression.getLeft();
  const member = literalMember(left);
  if (member === undefined) {
    return false;
  }
  if (!(member.receiver.isKind(SyntaxKind.Identifier) || member.receiver.isKind(SyntaxKind.ThisKeyword))) {
    return false;
  }
  const receiverDeclaration = member.receiver.isKind(SyntaxKind.Identifier) ? member.receiver.getSymbol()?.getDeclarations()[0] : undefined;
  const discardedLocal = receiverDeclaration?.isKind(SyntaxKind.VariableDeclaration) === true;
  return (
    !discardedLocal &&
    /(?:^|\.)(?:error|failure)$/iu.test(expression.getLeft().getText()) &&
    expression.getOperatorToken().getText() === "=" &&
    directlyCarriesBinding(expression.getRight(), errorBinding)
  );
}

function statementOwner(statement: Node, errorBinding: Node | undefined, returnedOutcomeOwns: boolean): OwnerVerdict {
  if (hasNestedEscape(statement)) {
    return "escape";
  }
  if (statement.isKind(SyntaxKind.ThrowStatement)) {
    return "owner";
  }
  if (statement.isKind(SyntaxKind.BreakStatement) || statement.isKind(SyntaxKind.ContinueStatement)) {
    return "escape";
  }
  const returned = statement.isKind(SyntaxKind.ReturnStatement) ? statement.getExpression() : undefined;
  if (returnedOutcomeOwns && returned !== undefined && isFailureOutcome(returned, errorBinding)) {
    return "owner";
  }
  const rawExpression = statement.isKind(SyntaxKind.ExpressionStatement) ? statement.getExpression() : returned;
  if (rawExpression === undefined) {
    return statement.isKind(SyntaxKind.ReturnStatement) ? "escape" : "none";
  }
  const expression = unwrapExpression(rawExpression);
  if (assignmentOwns(expression, errorBinding)) {
    return "owner";
  }
  if (expression.isKind(SyntaxKind.CallExpression) && isExplicitOwnerCall(expression, errorBinding)) {
    return "owner";
  }
  return statement.isKind(SyntaxKind.ReturnStatement) ? "escape" : "none";
}

function hasExplicitOwner(block: Block, errorBinding: Node | undefined, returnedOutcomeOwns = true): boolean {
  for (const statement of block.getStatements()) {
    const verdict = statementOwner(statement, errorBinding, returnedOutcomeOwns);
    if (verdict !== "none") {
      return verdict === "owner";
    }
  }
  return false;
}

const QUERY_FACTORIES: ReadonlySet<string> = new Set(["useInfiniteQuery", "useQuery", "useQueryClient", "useSuspenseInfiniteQuery", "useSuspenseQuery"]);
const FORM_FACTORIES: ReadonlySet<string> = new Set(["useForm"]);

function importedName(node: Node, modules: ReadonlySet<string>): string | undefined {
  const value = unwrapExpression(node);
  if (!value.isKind(SyntaxKind.Identifier)) {
    return;
  }
  let imported: string | undefined;
  const declarations = value.getSymbol()?.getDeclarations() ?? [];
  for (const declaration of value.getSourceFile().getImportDeclarations()) {
    if (!modules.has(declaration.getModuleSpecifierValue())) {
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
      if (declarations.some((definition) => definition.getSourceFile() === specifier.getSourceFile() && definition.getStart() === specifier.getStart())) {
        imported = specifier.getName();
      }
    }
  }
  return imported;
}

function declarationsOf(node: Node): readonly Node[] {
  const value = unwrapExpression(node);
  if (!value.isKind(SyntaxKind.Identifier)) {
    return [];
  }
  const symbol = value.getSymbol();
  return symbol?.getAliasedSymbol()?.getDeclarations() ?? symbol?.getDeclarations() ?? [];
}

function hasInterveningWrite(use: Node, declaration: Node): boolean {
  const source = use.getSourceFile();
  const assignmentOperators = new Set(["=", "&&=", "||=", "??=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^="]);
  const writesDeclaration = (target: Node): boolean => {
    const left = unwrapExpression(target);
    const identifiers = left.isKind(SyntaxKind.Identifier) ? [left] : left.getDescendantsOfKind(SyntaxKind.Identifier);
    return identifiers.some((identifier) =>
      identifier.getDefinitions().some((definition) => {
        const candidate = definition.getDeclarationNode();
        return candidate !== undefined && candidate.getSourceFile() === declaration.getSourceFile() && candidate.getStart() === declaration.getStart();
      }),
    );
  };
  const binaryWrite = source.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((assignment) => {
    // Function declarations are hoisted, so a write may precede the declaration text while still replacing
    // the binding used below. Initializers are not BinaryExpression assignments; the only safe temporal
    // boundary is the use itself.
    if (assignment.getStart() >= use.getStart() || !assignmentOperators.has(assignment.getOperatorToken().getText())) {
      return false;
    }
    return writesDeclaration(assignment.getLeft());
  });
  if (binaryWrite) {
    return true;
  }
  return [...source.getDescendantsOfKind(SyntaxKind.ForOfStatement), ...source.getDescendantsOfKind(SyntaxKind.ForInStatement)].some(
    (statement) => statement.getStart() < use.getStart() && writesDeclaration(statement.getInitializer()),
  );
}

function entityMutationFactoryOwns(call: CallExpression): boolean {
  const callee = unwrapExpression(call.getExpression());
  return declarationsOf(callee).some((declaration) => {
    if (!declaration.isKind(SyntaxKind.VariableDeclaration)) {
      return false;
    }
    if (callee.isKind(SyntaxKind.Identifier) && hasInterveningWrite(callee, declaration)) {
      return false;
    }
    const initializer = declaration.getInitializerIfKind(SyntaxKind.CallExpression);
    const config = initializer?.getArguments()[0];
    if (initializer === undefined || config?.isKind(SyntaxKind.ObjectLiteralExpression) !== true) {
      return false;
    }
    const factoryDeclarations = declarationsOf(initializer.getExpression());
    const governedFactory =
      importedName(initializer.getExpression(), new Set(["#data", "./create-entity-mutation.ts"])) === "createEntityMutation" ||
      factoryDeclarations.some(
        (factory) =>
          factory.isKind(SyntaxKind.FunctionDeclaration) &&
          factory.getName() === "createEntityMutation" &&
          factory.getSourceFile().getFilePath().endsWith("/packages/client/src/data/create-entity-mutation.ts"),
      );
    const toastValue = propertyValueNode(config.getProperty("errorToast"));
    return governedFactory && toastValue !== undefined && isFailureOutcome(toastValue, undefined);
  });
}

/** React's tuple: only element [1] is the SETTER slot. A destructured value that merely LOOKS like a setter
 *  (`const [setError] = useState(...)`) is the state VALUE, and setting it observes nothing. */
function bindingElementIsSetterSlot(element: BindingElement, modules: ReadonlySet<string>, factories: ReadonlySet<string>): boolean {
  if (!(modules.has("react") && factories.has("useState"))) {
    return true;
  }
  const pattern = element.getParentIfKind(SyntaxKind.ArrayBindingPattern);
  return pattern !== undefined && pattern.getElements().indexOf(element) === 1;
}

function originatesFromFactory(node: Node, modules: ReadonlySet<string>, factories: ReadonlySet<string>, seen: ReadonlySet<Node> = new Set()): boolean {
  const value = unwrapExpression(node);
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen).add(value);
  if (value.isKind(SyntaxKind.CallExpression)) {
    const callee = unwrapExpression(value.getExpression());
    const imported = importedName(callee, modules);
    return imported !== undefined && factories.has(imported);
  }
  if (!value.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const valueDeclaration = value.getSymbol()?.getDeclarations()[0];
  if (valueDeclaration !== undefined && hasInterveningWrite(value, valueDeclaration)) {
    return false;
  }
  if (valueDeclaration?.isKind(SyntaxKind.Parameter) === true) {
    return false;
  }
  if (valueDeclaration?.isKind(SyntaxKind.BindingElement) === true) {
    if (!bindingElementIsSetterSlot(valueDeclaration, modules, factories)) {
      return false;
    }
    const initializer = valueDeclaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
    return initializer !== undefined && originatesFromFactory(initializer, modules, factories, nextSeen);
  }
  if (valueDeclaration?.isKind(SyntaxKind.VariableDeclaration) === true) {
    const initializer = valueDeclaration.getInitializer();
    return initializer !== undefined && originatesFromFactory(initializer, modules, factories, nextSeen);
  }
  const initializer = nearestPrecedingInitializer(value);
  return initializer !== undefined && originatesFromFactory(initializer, modules, factories, nextSeen);
}

/** The LAST declaration of this name textually before `value`, walking outward through enclosing function
 *  scopes. The fallback for a name the symbol table could not resolve — deliberately positional, so a later
 *  redeclaration cannot lend its provenance backwards. */
function nearestPrecedingInitializer(value: Node): Node | undefined {
  let boundary: Node | undefined = value.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind())) ?? value.getSourceFile();
  const text = value.getText();
  let found: Node | undefined;
  while (found === undefined && boundary !== undefined) {
    const declarations = boundary
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .filter((declaration) => declaration.getStart() < value.getStart() && declaresName(declaration.getNameNode(), text))
      .sort((left, right) => right.getStart() - left.getStart());
    found = declarations[0]?.getInitializer();
    boundary = boundary.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()) || ancestor.isKind(SyntaxKind.SourceFile));
  }
  return found;
}

function declaresName(name: Node, text: string): boolean {
  if (name.isKind(SyntaxKind.Identifier)) {
    return name.getText() === text;
  }
  return name.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === text);
}

function originatesFromOwnedEntityMutation(node: Node, seen: ReadonlySet<Node> = new Set()): boolean {
  const value = unwrapExpression(node);
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen).add(value);
  if (value.isKind(SyntaxKind.CallExpression)) {
    return entityMutationFactoryOwns(value);
  }
  if (!value.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const declaration = value.getSymbol()?.getDeclarations()[0];
  if (declaration !== undefined && hasInterveningWrite(value, declaration)) {
    return false;
  }
  if (declaration?.isKind(SyntaxKind.BindingElement) === true) {
    const initializer = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
    return initializer !== undefined && originatesFromOwnedEntityMutation(initializer, nextSeen);
  }
  const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
  return initializer !== undefined && originatesFromOwnedEntityMutation(initializer, nextSeen);
}

function frameworkOwns(call: CallExpression): boolean {
  const name = calleeName(call);
  const callee = unwrapExpression(call.getExpression());
  if (name === "withRequestSpan" && importedName(callee, new Set(["#foundation/observability", "#foundation/observability/tracing"])) === "withRequestSpan") {
    return true;
  }
  const member = literalMember(call.getExpression());
  const work = member === undefined ? callee : member.receiver;
  if (name === "fetchNextPage" || name === "fetchQuery" || name === "refetch" || name === "invalidateQueries" || name === "ensureQueryData") {
    return originatesFromFactory(work, new Set(["@tanstack/react-query"]), QUERY_FACTORIES);
  }
  if (name === "handleSubmit") {
    return originatesFromFactory(work, new Set(["@tanstack/react-form"]), FORM_FACTORIES);
  }
  if (name === "mutateAsync") {
    return originatesFromOwnedEntityMutation(work);
  }
  return false;
}

function hasFrameworkOwner(block: Block): boolean {
  if (block.getStatements().length !== 1) {
    return false;
  }
  const calls = block.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => !insideNestedFunction(call, block));
  const [onlyCall] = calls;
  return calls.length === 1 && onlyCall !== undefined && frameworkOwns(onlyCall);
}

function unownedCatch(clause: CatchClause): boolean {
  const block = clause.getBlock();
  const errorBinding = clause.getVariableDeclaration()?.getNameNode();
  if (hasExplicitOwner(block, errorBinding)) {
    return false;
  }
  const finallyBlock = clause.getParentIfKind(SyntaxKind.TryStatement)?.getFinallyBlock();
  return finallyBlock === undefined || !hasExplicitOwner(finallyBlock, errorBinding);
}

function silentDefault(clause: CatchClause): boolean {
  const block = clause.getBlock();
  const errorBinding = clause.getVariableDeclaration()?.getNameNode();
  if (hasExplicitOwner(block, errorBinding)) {
    return false;
  }
  const returns = escapingDescendants(block, SyntaxKind.ReturnStatement, block.getDescendantsOfKind(SyntaxKind.ReturnStatement));
  if (returns.length === 0) {
    return false;
  }
  return returns.every((statement) => {
    const value = statement.asKindOrThrow(SyntaxKind.ReturnStatement).getExpression();
    return value === undefined || isFallback(value);
  });
}

function promiseWorkName(call: CallExpression): string {
  let current: Node = call;
  while (current.isKind(SyntaxKind.CallExpression)) {
    const member = literalMember(current.getExpression());
    if (member === undefined) {
      return calleeName(current) ?? "promise";
    }
    if (member.name !== "catch" && member.name !== "then" && member.name !== "finally") {
      return member.name;
    }
    current = member.receiver;
  }
  return current.isKind(SyntaxKind.Identifier) ? current.getText() : "promise";
}

function namedHandlerDiscards(identifier: Node): boolean {
  if (!identifier.isKind(SyntaxKind.Identifier)) {
    return true;
  }
  const declarations = identifier.getSymbol()?.getDeclarations() ?? [];
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  if (declaration === undefined || hasInterveningWrite(identifier, declaration)) {
    return true;
  }
  if (declaration.isKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    return initializer === undefined || isDiscardingHandler(initializer);
  }
  if (!declaration.isKind(SyntaxKind.FunctionDeclaration)) {
    return true;
  }
  const body = declaration.getBody();
  if (body?.isKind(SyntaxKind.Block) !== true) {
    return true;
  }
  return !hasExplicitOwner(body, declaration.getParameters()[0]?.getNameNode(), false);
}

function isDiscardingHandler(handler: Node): boolean {
  const fn = unwrapExpression(handler);
  if (fn.isKind(SyntaxKind.Identifier)) {
    return namedHandlerDiscards(fn);
  }
  if (!(fn.isKind(SyntaxKind.ArrowFunction) || fn.isKind(SyntaxKind.FunctionExpression))) {
    return true;
  }
  const body = fn.getBody();
  if (!body.isKind(SyntaxKind.Block)) {
    return !(body.isKind(SyntaxKind.CallExpression) && isExplicitOwnerCall(body, fn.getParameters()[0]?.getNameNode()));
  }
  const errorBinding = fn.getParameters()[0]?.getNameNode();
  return !hasExplicitOwner(body, errorBinding, false);
}

function isIgnoredPromiseHandler(handler: Node): boolean {
  const value = unwrapExpression(handler);
  return (
    ["undefined", "void 0", "null", "false", "true"].includes(value.getText()) ||
    value.isKind(SyntaxKind.NumericLiteral) ||
    value.isKind(SyntaxKind.StringLiteral) ||
    value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  );
}

function handlerReturnsOwnedFailure(handler: Node): boolean {
  const fn = unwrapExpression(handler);
  if (fn.isKind(SyntaxKind.Identifier)) {
    const declaration = fn.getSymbol()?.getDeclarations()[0];
    if (declaration !== undefined && hasInterveningWrite(fn, declaration)) {
      return false;
    }
    if (declaration?.isKind(SyntaxKind.FunctionDeclaration) === true) {
      const body = declaration.getBody();
      return body?.isKind(SyntaxKind.Block) === true && hasExplicitOwner(body, declaration.getParameters()[0]?.getNameNode(), true);
    }
    const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
    return initializer !== undefined && handlerReturnsOwnedFailure(initializer);
  }
  if (!(fn.isKind(SyntaxKind.ArrowFunction) || fn.isKind(SyntaxKind.FunctionExpression))) {
    return false;
  }
  const body = fn.getBody();
  const errorBinding = fn.getParameters()[0]?.getNameNode();
  return body.isKind(SyntaxKind.Block) ? hasExplicitOwner(body, errorBinding, true) : isFailureOutcome(body, errorBinding);
}

function handlerPropagatesRejection(handler: Node): boolean {
  const fn = unwrapExpression(handler);
  if (fn.isKind(SyntaxKind.Identifier)) {
    const declaration = fn.getSymbol()?.getDeclarations()[0];
    if (declaration !== undefined && hasInterveningWrite(fn, declaration)) {
      return false;
    }
    if (declaration?.isKind(SyntaxKind.FunctionDeclaration) === true) {
      const body = declaration.getBody();
      return body?.isKind(SyntaxKind.Block) === true && blockUnconditionallyRejects(body, declaration.getParameters()[0]?.getNameNode());
    }
    const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
    return initializer !== undefined && handlerPropagatesRejection(initializer);
  }
  if (!(fn.isKind(SyntaxKind.ArrowFunction) || fn.isKind(SyntaxKind.FunctionExpression))) {
    return false;
  }
  const errorBinding = fn.getParameters()[0]?.getNameNode();
  const body = fn.getBody();
  if (body.isKind(SyntaxKind.CallExpression)) {
    return isNativePromiseReject(body, errorBinding);
  }
  if (!body.isKind(SyntaxKind.Block)) {
    return false;
  }
  return blockUnconditionallyRejects(body, errorBinding);
}

function blockUnconditionallyRejects(body: Block, errorBinding: Node | undefined): boolean {
  const statements = body.getStatements();
  const only = statements.length === 1 ? statements[0] : undefined;
  if (only?.isKind(SyntaxKind.ReturnStatement) !== true) {
    return false;
  }
  const expression = only.getExpression();
  return expression?.isKind(SyntaxKind.CallExpression) === true && isNativePromiseReject(expression, errorBinding);
}

function promiseLikeValue(receiver: Node): boolean {
  if (isZodSchemaExpression(receiver)) {
    return false;
  }
  const type = receiver.getType();
  const constituents = type.isUnion() ? type.getUnionTypes() : [type];
  const nonNullish = constituents.filter((part) => !["null", "undefined"].includes(part.getText()));
  return nonNullish.length > 0 && nonNullish.every((part) => ["any", "unknown"].includes(part.getText()) || part.getProperty("then") !== undefined);
}

interface PromiseRejectionInvocation {
  readonly handler: Node;
  readonly link: "catch" | "then";
  readonly receiver: Node;
  readonly direct: boolean;
}

type RejectionLink = "catch" | "then";

function rejectionLink(name: string | undefined): RejectionLink | undefined {
  return name === "catch" || name === "then" ? name : undefined;
}

/** `p.catch(h)` / `p.then(_, h)` — the direct spelling, and the only one that owns a whole chain. */
function directRejection(call: CallExpression, member: { readonly name: string; readonly receiver: Node }): PromiseRejectionInvocation | undefined {
  const link = rejectionLink(member.name);
  if (link === undefined) {
    return;
  }
  const handler = call.getArguments()[REJECTION_HANDLER_INDEX.get(link) ?? -1];
  return handler === undefined ? undefined : { handler, link, receiver: member.receiver, direct: true };
}

/** `p.catch.call(p, h)` / `Promise.prototype.catch.call(p, h)` — the same absorb, one argument to the right. */
function calledRejection(call: CallExpression, member: { readonly name: string; readonly receiver: Node }): PromiseRejectionInvocation | undefined {
  const link = member.name === "call" ? rejectionLink(literalMember(member.receiver)?.name) : undefined;
  if (link === undefined) {
    return;
  }
  const receiver = call.getArguments()[0];
  const handler = call.getArguments()[(REJECTION_HANDLER_INDEX.get(link) ?? -2) + 1];
  return receiver === undefined || handler === undefined ? undefined : { handler, link, receiver, direct: false };
}

/** `p.catch.apply(p, [h])` and `Reflect.apply(p.catch, p, [h])` — the handler moves into the array literal. */
function appliedRejection(call: CallExpression, member: { readonly name: string; readonly receiver: Node }): PromiseRejectionInvocation | undefined {
  if (member.name !== "apply") {
    return;
  }
  const reflect = ambientIdentifier(member.receiver, "Reflect", new Set());
  const rejectionNode = reflect ? call.getArguments()[0] : member.receiver;
  const receiver = call.getArguments()[reflect ? 1 : 0];
  const args = call.getArguments()[reflect ? 2 : 1];
  const link = rejectionNode === undefined ? undefined : rejectionLink(literalMember(rejectionNode)?.name);
  if (link === undefined || receiver === undefined || args?.isKind(SyntaxKind.ArrayLiteralExpression) !== true) {
    return;
  }
  const handler = args.getElements()[REJECTION_HANDLER_INDEX.get(link) ?? -1];
  return handler === undefined ? undefined : { handler, link, receiver, direct: false };
}

/** `const recover = p.catch.bind(p); recover(h)` — the absorb one hop behind a const. */
function boundRejection(call: CallExpression, callee: Node): PromiseRejectionInvocation | undefined {
  if (!callee.isKind(SyntaxKind.Identifier)) {
    return;
  }
  const declaration = callee.getSymbol()?.getDeclarations()[0];
  if (declaration?.isKind(SyntaxKind.VariableDeclaration) !== true || hasInterveningWrite(callee, declaration)) {
    return;
  }
  const initializer = declaration.getInitializerIfKind(SyntaxKind.CallExpression);
  const bind = initializer === undefined ? undefined : literalMember(initializer.getExpression());
  if (initializer === undefined || bind?.name !== "bind") {
    return;
  }
  const link = rejectionLink(literalMember(bind.receiver)?.name);
  if (link === undefined) {
    return;
  }
  const receiver = initializer.getArguments()[0];
  const handler = call.getArguments()[REJECTION_HANDLER_INDEX.get(link) ?? -1];
  return receiver === undefined || handler === undefined ? undefined : { handler, link, receiver, direct: false };
}

/** Every way to hand a promise a REJECTION HANDLER. Method syntax is only the most common one — a reader that
 *  stops there leaves `call`/`apply`/`Reflect.apply`/`bind` as silent laundering routes for the same absorb. */
function promiseRejectionInvocation(call: CallExpression): PromiseRejectionInvocation | undefined {
  const callee = unwrapExpression(call.getExpression());
  const member = literalMember(callee);
  if (member === undefined) {
    return boundRejection(call, callee);
  }
  return directRejection(call, member) ?? calledRejection(call, member) ?? appliedRejection(call, member) ?? boundRejection(call, callee);
}

function isZodSchemaExpression(node: Node, seen: ReadonlySet<Node> = new Set()): boolean {
  const value = unwrapExpression(node);
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen).add(value);
  if (value.isKind(SyntaxKind.Identifier)) {
    if (importedName(value, new Set(["zod"])) !== undefined) {
      return true;
    }
    const declaration = value.getSymbol()?.getDeclarations()[0];
    const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
    return initializer !== undefined && isZodSchemaExpression(initializer, nextSeen);
  }
  if (value.isKind(SyntaxKind.CallExpression)) {
    const callee = unwrapExpression(value.getExpression());
    if (callee.isKind(SyntaxKind.Identifier) && importedName(callee, new Set(["zod"])) !== undefined) {
      return true;
    }
    const member = literalMember(callee);
    return member !== undefined && isZodSchemaExpression(member.receiver, nextSeen);
  }
  const member = literalMember(value);
  return member !== undefined && isZodSchemaExpression(member.receiver, nextSeen);
}

/** Kinds that WRAP a value without giving anyone a handle on it — the whole wrapper is discarded exactly when
 *  its content is. Property access is handled separately (it may continue into an outer call). */
const TRANSPARENT_WRAPPER_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ArrayLiteralExpression,
  SyntaxKind.AsExpression,
  SyntaxKind.AwaitExpression,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.NonNullExpression,
  SyntaxKind.ObjectLiteralExpression,
  SyntaxKind.ParenthesizedExpression,
  SyntaxKind.PrefixUnaryExpression,
  SyntaxKind.TemplateExpression,
  SyntaxKind.TemplateSpan,
  SyntaxKind.VoidExpression,
]);
/** Binary operators that PASS THE VALUE THROUGH rather than storing it. `=` is deliberately absent: an
 *  assignment gives a caller a handle, so the recovered value is retained, not discarded. */
const TRANSPARENT_BINARY_OPERATORS: ReadonlySet<string> = new Set([",", "&&", "||", "??"]);

/** The next node up that the recovered value flows into, or undefined when the chain leaves this reader. */
function transparentParent(current: Node): Node | undefined {
  const parent = current.getParent();
  if (parent === undefined) {
    return;
  }
  if (TRANSPARENT_WRAPPER_KINDS.has(parent.getKind())) {
    return parent;
  }
  if (parent.isKind(SyntaxKind.PropertyAssignment) && parent.getInitializer() === current) {
    return parent;
  }
  if (parent.isKind(SyntaxKind.BinaryExpression) && TRANSPARENT_BINARY_OPERATORS.has(parent.getOperatorToken().getText())) {
    return parent;
  }
  if (parent.isKind(SyntaxKind.CallExpression) && parent.getArguments().some((argument) => argument === current) && isNativePromiseAggregate(parent)) {
    return parent;
  }
  const memberRead = parent.isKind(SyntaxKind.PropertyAccessExpression) || parent.isKind(SyntaxKind.ElementAccessExpression);
  if (!(memberRead && parent.getExpression() === current)) {
    return;
  }
  return parent.getParentIfKind(SyntaxKind.CallExpression) ?? parent;
}

/** Does this recovered promise reach a STATEMENT with nobody holding it? Wrapping it in an object, an array,
 *  a template, an aggregate, or a derived property does not create a consumer for its failure value. */
function isDiscardedExpression(call: CallExpression): boolean {
  let current: Node = call;
  for (;;) {
    if (current.getParent()?.isKind(SyntaxKind.ExpressionStatement) === true) {
      return true;
    }
    const next = transparentParent(current);
    if (next === undefined) {
      return false;
    }
    current = next;
  }
}

function isNativePromiseAggregate(call: CallExpression): boolean {
  const member = literalMember(call.getExpression());
  if (
    member === undefined ||
    !new Set(["all", "allSettled", "any", "race"]).has(member.name) ||
    !member.receiver.isKind(SyntaxKind.Identifier) ||
    member.receiver.getText() !== "Promise"
  ) {
    return false;
  }
  return (member.receiver.getSymbol()?.getDeclarations() ?? []).every(
    (declaration) => declaration.getSourceFile() !== call.getSourceFile() || declaration.getSourceFile().isDeclarationFile(),
  );
}

function discardingPromise(call: CallExpression): { readonly discarded: boolean; readonly handler: Node; readonly position: string } | undefined {
  const invocation = promiseRejectionInvocation(call);
  if (invocation === undefined) {
    return;
  }
  const { handler, receiver } = invocation;
  if (
    isIgnoredPromiseHandler(handler) ||
    !promiseLikeValue(receiver) ||
    handlerPropagatesRejection(handler) ||
    !isDiscardingHandler(handler) ||
    (!isDiscardedExpression(call) && handlerReturnsOwnedFailure(handler) && recoveredFailureIsConsumed(call))
  ) {
    return;
  }
  const work = workPositionName(call, invocation);
  const workCall = underlyingWorkCall(call, invocation);
  if (workCall !== undefined && frameworkOwns(workCall)) {
    return;
  }
  return { discarded: isDiscardedExpression(call), handler, position: `promise:${work}` };
}

/** The name a marker would use for this absorber: the WORK, never the plumbing link. */
function workPositionName(call: CallExpression, invocation: PromiseRejectionInvocation): string {
  if (invocation.direct) {
    return promiseWorkName(call);
  }
  return invocation.receiver.isKind(SyntaxKind.CallExpression) ? promiseWorkName(invocation.receiver) : invocation.receiver.getText();
}

/** The call that produced the promise, walking inward past `then`/`catch`/`finally` — the node a framework
 *  owner (a TanStack query/mutation/form) has to be proven ON. */
function underlyingWorkCall(call: CallExpression, invocation: PromiseRejectionInvocation): CallExpression | undefined {
  if (!invocation.direct) {
    return invocation.receiver.isKind(SyntaxKind.CallExpression) ? invocation.receiver : undefined;
  }
  let workCall: CallExpression = call;
  let cursor: Node = call;
  let walking = true;
  while (walking && cursor.isKind(SyntaxKind.CallExpression)) {
    const cursorMember = literalMember(cursor.getExpression());
    if (cursorMember === undefined || !PROMISE_CHAIN_LINKS.has(cursorMember.name)) {
      workCall = cursor;
      walking = false;
    } else {
      cursor = cursorMember.receiver;
    }
  }
  return workCall;
}

function recoveredFailureIsConsumed(call: CallExpression): boolean {
  const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const initializer = declaration?.getInitializer();
  // The absorber must be INSIDE this declaration's initializer to be the value the binding holds; otherwise
  // the enclosing declaration is incidental and the chain is judged where it actually sits.
  const heldByBinding = initializer !== undefined && initializer.getStart() <= call.getStart() && initializer.getEnd() >= call.getEnd();
  if (declaration === undefined || !heldByBinding) {
    return valueHasMeaningfulConsumer(call);
  }
  return declaration
    .getNameNode()
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .concat(declaration.getNameNode().isKind(SyntaxKind.Identifier) ? [declaration.getNameNode().asKindOrThrow(SyntaxKind.Identifier)] : [])
    .some((identifier) =>
      identifier.findReferencesAsNodes().some((reference) => {
        if (reference.getStart() <= declaration.getEnd() || hasInterveningWrite(reference, declaration)) {
          return false;
        }
        const declarationBoundary = declaration.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()));
        const referenceBoundary = reference.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()));
        return declarationBoundary === referenceBoundary && valueHasMeaningfulConsumer(reference);
      }),
    );
}

/** Kinds that pass a value along without consuming it, on the CONSUMPTION walk. */
const CONSUMER_PASSTHROUGH_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.AsExpression,
  SyntaxKind.AwaitExpression,
  SyntaxKind.NonNullExpression,
  SyntaxKind.ParenthesizedExpression,
]);

function encloses(argument: Node, current: Node): boolean {
  return argument === current || (argument.getStart() <= current.getStart() && argument.getEnd() >= current.getEnd());
}

/** Does an error-as-data recovery value reach a REAL consumer? Only two shapes count: it is RETURNED to a
 *  caller, or it is handed to the governed observability sink. Being passed to a local no-op, voided, or
 *  dropped in statement position is not consumption — the recovered failure dies there. */
function valueHasMeaningfulConsumer(node: Node): boolean {
  let current = node;
  for (;;) {
    const here = current;
    const parent = here.getParent();
    if (parent === undefined || parent.isKind(SyntaxKind.VoidExpression) || parent.isKind(SyntaxKind.ExpressionStatement)) {
      return false;
    }
    if (parent.isKind(SyntaxKind.ReturnStatement)) {
      return true;
    }
    if (parent.isKind(SyntaxKind.CallExpression) && parent.getArguments().some((argument) => encloses(argument, here))) {
      return importedName(parent.getExpression(), OBSERVABILITY_MODULES) === "recordTurnOutcome";
    }
    const implicitReturn = parent.isKind(SyntaxKind.ArrowFunction) && parent.getBody() === here;
    if (!(implicitReturn || CONSUMER_PASSTHROUGH_KINDS.has(parent.getKind()))) {
      return false;
    }
    current = parent;
  }
}

interface ReviewSite {
  readonly enforced: boolean;
  readonly node: Node;
  readonly position: string;
}

/** One CATCH-shaped site, already classified. `silentDefault` wins over `unownedCatch`: a catch that returns a
 *  fallback is a behaviour CHANGE nobody was told about, which is the sharper finding. */
function catchReviewSite(clause: CatchClause): ReviewSite | undefined {
  const binding = clause.getVariableDeclaration()?.getName() ?? "catch";
  if (silentDefault(clause)) {
    return { enforced: true, node: clause, position: `default:${binding}` };
  }
  if (!unownedCatch(clause)) {
    return;
  }
  const tryBlock = clause.getParentIfKind(SyntaxKind.TryStatement)?.getTryBlock();
  const frameworkOwned = tryBlock !== undefined && hasFrameworkOwner(tryBlock);
  return {
    enforced: !(frameworkOwned || hasLiveDetachedSwallowOwner(clause, binding)),
    node: clause,
    position: `empty:${binding}`,
  };
}

/** Every caught-failure site in one file, with its ownership verdict. EXPORTED because the durable
 *  classification artifact and its conformance pin must read the SAME producer the gate reports from — two
 *  readers of one population is how an artifact and a gate silently disagree. */
export function caughtFailureReviewSites(sf: SourceFile): readonly ReviewSite[] {
  const sites: ReviewSite[] = [];
  for (const clause of sf.getDescendantsOfKind(SyntaxKind.CatchClause)) {
    const site = catchReviewSite(clause);
    if (site !== undefined) {
      sites.push(site);
    }
  }
  // A position must resolve to ONE absorber: two same-named promise absorbers in one statement would
  // otherwise share `promise:save`, and a single reason would absolve the sibling nobody reasoned about.
  const positionUses = new Map<string, number>();
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const site = discardingPromise(call);
    if (site === undefined) {
      continue;
    }
    const statement = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement) ?? call;
    const positionKey = `${statement.getStartLineNumber()}:${site.position}`;
    const seenCount = (positionUses.get(positionKey) ?? 0) + 1;
    positionUses.set(positionKey, seenCount);
    const position = seenCount === 1 ? site.position : `${site.position}_${seenCount}`;
    sites.push({ enforced: !hasLiveDetachedSwallowOwner(call, position.slice("promise:".length)), node: call, position });
  }
  return sites;
}

function scanFile(sf: SourceFile, report: (node: Node, position: string) => void): void {
  for (const site of caughtFailureReviewSites(sf)) {
    if (site.enforced) {
      report(site.node, site.position);
    }
  }
}

function inScope(path: string): boolean {
  return /^packages\/[^/]+\/src\//u.test(path) || path.startsWith("tooling/src/");
}

export const gate: GateDescriptor = {
  name: "caught-failure-ownership",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3 — caught-failure-ownership)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: inScope,
  visitFile: (sf, ctx) => {
    scanFile(sf, (node, position) => ctx.report(node, { token: position, offset: 0 }));
  },
  mustFlag: [
    {
      files: "export function raw(): void {\n  void save().catch(() => undefined);\n}\n",
      at: "packages/client/src/features/probe/raw.ts",
      expect: { count: 1, token: "promise:save" },
      why: "an unowned raw promise absorber is syntactically handled but has no failure owner",
    },
    {
      files:
        "export function bracket(p: Promise<void>): void {\n" +
        "  const link = 'catch' as const;\n" +
        "  let typedLink: 'catch' = 'catch';\n" +
        "  void p['catch'](() => undefined);\n" +
        "  void p['then'](undefined, () => undefined);\n" +
        "  void p?.['catch'](() => undefined);\n" +
        "  void p[('catch')](() => undefined);\n" +
        "  void p[link](() => undefined);\n" +
        "  void p[typedLink](() => undefined);\n" +
        "  void p[(('ca' + 'tch') as 'catch')](() => undefined);\n" +
        "  void p['ca' + 'tch'](() => undefined);\n" +
        "  void p['th' + 'en'](undefined, () => undefined);\n" +
        "}\n",
      at: "packages/client/src/features/probe/bracket.ts",
      expect: { count: 9, token: "promise:p" },
      why: "literal, parenthesized-literal, literal-typed, and optional-bracket rejection links are the same property reads as dot access; dynamic string keys remain out",
    },
    {
      files:
        "export function indirectInvocation(p: Promise<void>): void {\n" +
        "  p.catch.call(p, () => undefined);\n" +
        "  p.then.call(p, undefined, () => undefined);\n" +
        "  const recover = p.catch.bind(p);\n" +
        "  recover(() => undefined);\n" +
        "  Promise.prototype.catch.call(p, () => undefined);\n" +
        "  Reflect.apply(p.catch, p, [() => undefined]);\n" +
        "  p.catch.apply(p, [() => undefined]);\n" +
        "  p.then.apply(p, [undefined, () => undefined]);\n" +
        "}\n",
      at: "packages/server/src/domain/probe/indirect-promise-invocation.ts",
      expect: { count: 7, token: "promise:p" },
      why: "call/bind invocation of the native rejection link has the same absorbing semantics as direct method syntax",
    },
    {
      files:
        "export function nullablePromise(p: Promise<void> | undefined): void {\n" +
        "  void p?.catch(() => undefined);\n" +
        "  void p?.['catch'](() => undefined);\n" +
        "}\n",
      at: "packages/client/src/features/probe/nullable-promise.ts",
      expect: { count: 2, token: "promise:p" },
      why: "optional access changes whether the link runs, not whether a present Promise rejection is absorbed",
    },
    {
      files: "export function empty(): void {\n  try { risky(); } catch {}\n}\n",
      at: "packages/server/src/domain/probe/empty.ts",
      expect: { count: 1, token: "empty:catch" },
      why: "a reasonless empty catch proves only that the exception was erased",
    },
    {
      files: "export function continued(): void {\n  try { risky(); } catch {}\n  reportSuccess();\n}\n",
      at: "packages/server/src/domain/probe/continued.ts",
      expect: { count: 1, token: "empty:catch" },
      why: "an arbitrary following statement does not own the erased failure",
    },
    {
      files: "export function looped(): void {\n  for (;;) { try { risky(); } catch {} }\n}\n",
      at: "packages/server/src/domain/probe/looped.ts",
      expect: { count: 1, token: "empty:catch" },
      why: "loop continuation is control flow, not failure ownership",
    },
    {
      files: "export function fakeState(): void {\n  try { risky(); } catch (e) { sink = e; setStatus('ok'); }\n}\n",
      at: "packages/client/src/features/probe/fake-state.ts",
      expect: { count: 1, token: "empty:e" },
      why: "an arbitrary assignment or success setter cannot launder caught-failure ownership",
    },
    {
      files: "const ignore = (): void => undefined;\nexport function namedNoop(): void {\n  void save().catch(ignore);\n}\n",
      at: "packages/client/src/features/probe/named-noop.ts",
      expect: { count: 1, token: "promise:save" },
      why: "a named no-op handler is still an absorber, and unresolved names prove even less",
    },
    {
      files: "export function fakeQuery(arbitrary: A): void {\n  void arbitrary.refetch().catch(() => undefined);\n}\n",
      at: "packages/client/src/features/probe/fake-query.ts",
      expect: { count: 1, token: "promise:refetch" },
      why: "a TanStack-like method name on an arbitrary receiver is not framework ownership",
    },
    {
      files:
        "export function fakeHooks(): void {\n" +
        "  const fake = useFakeThing();\n" +
        "  const mutation = useMutation();\n" +
        "  void fake.refetch().catch(() => undefined);\n" +
        "  void mutation.mutateAsync().catch(() => undefined);\n" +
        "  void refetch().catch(() => undefined);\n" +
        "  void withRequestSpan().catch(() => undefined);\n" +
        "}\n",
      at: "packages/client/src/features/probe/fake-hooks.ts",
      expect: { count: 4 },
      why: "factory-like and framework-like spellings without their governed imports or owner configuration prove nothing",
    },
    {
      files: "export function metricOnly(): void {\n  void save().catch(() => { metrics.increment('ignored'); });\n}\n",
      at: "packages/client/src/features/probe/metric-only.ts",
      expect: { count: 1, token: "promise:save" },
      why: "arbitrary observable work is not an error owner unless it surfaces, propagates, or records the failure context",
    },
    {
      files:
        "const recover = (err: unknown): unknown => ({ status: 'failed', error: err });\n" +
        "export function discardedRecovery(): void {\n" +
        "  void save().catch((err) => { return { status: 'failed', error: err }; });\n" +
        "  void save().catch(recover);\n" +
        "}\n",
      at: "packages/client/src/features/probe/discarded-recovery.ts",
      expect: { count: 2 },
      why: "an error-as-data recovery value owns failure only when a caller consumes it; a discarded chain erases that value too",
    },
    {
      files:
        "export function returned(): Promise<void> { return save().catch(() => undefined); }\n" +
        "export async function returnedAwait(): Promise<void> { return await save().catch(() => undefined); }\n",
      at: "packages/client/src/features/probe/returned-absorbers.ts",
      expect: { count: 2, token: "promise:save" },
      why: "returning or awaiting a promise whose handler converts rejection to undefined preserves completion but still erases the failure",
    },
    {
      files: "export function containers(): void {\n  void (save().catch(() => undefined), 0);\n  void [save().catch(() => undefined)];\n}\n",
      at: "packages/client/src/features/probe/discarded-containers.ts",
      expect: { count: 2, token: "promise:save" },
      why: "sequence and array literals do not retain a nested recovered promise when the whole container is discarded",
    },
    {
      files:
        "export function derivedContainers(flag: boolean): void {\n" +
        "  void ({ result: save().catch(() => undefined) });\n" +
        "  void (flag ? save().catch(() => undefined) : undefined);\n" +
        "  void !save().catch(() => undefined);\n" +
        "  void [save().catch(() => undefined)].length;\n" +
        "}\n",
      at: "packages/client/src/features/probe/derived-discarded-containers.ts",
      expect: { count: 4 },
      why: "wrapping a recovered promise in an unused object, conditional, unary, or derived property does not create a consumer for its failure value",
    },
    {
      files:
        "export function recoveredContainers(p: Promise<void>, flag: boolean): void {\n" +
        "  void (p.catch((err) => ({ status: 'failed', error: err })) && flag);\n" +
        "  void `failure: ${p.catch((err) => ({ status: 'failed', error: err }))}`;\n" +
        "  void Promise.all([p.catch((err) => ({ status: 'failed', error: err }))]);\n" +
        "}\n",
      at: "packages/client/src/features/probe/discarded-recovered-containers.ts",
      expect: { count: 3, token: "promise:p" },
      why: "logical, template, and native Promise aggregate wrappers do not consume recovered failure data when their own value is discarded",
    },
    {
      files:
        "export function oneMarker(): void {\n" +
        "  // @orb-gate-ignore caught-failure-ownership(promise:save): the first save is owned elsewhere; ends when it is awaited.\n" +
        "  void [a.save().catch(() => undefined), b.save().catch(() => undefined)];\n" +
        "}\n",
      at: "packages/client/src/features/probe/repeated-position.ts",
      expect: { count: 1, token: "promise:save_2" },
      why: "two same-named promise absorbers in one guarded statement need distinct positions so one reason cannot absolve both",
    },
    {
      files: {
        [DETACHED_TRACING_MODULE]: DETACHED_TRACING_FIXTURE,
        "packages/server/src/domain/probe/repeated-detached-position.ts":
          "export function coupledMarker(a: A, b: B): void {\n" +
          "  // @swallowed-ok(cancel): the first stream is already closed. Ends if cancel becomes user-visible.\n" +
          "  void a.cancel().catch(() => undefined); void b.cancel().catch(() => undefined);\n" +
          "}\n",
      },
      at: "packages/server/src/domain/probe/repeated-detached-position.ts",
      expect: { count: 1, token: "promise:cancel_2" },
      why: "a live detached-work marker owns only one same-named site on its guarded line, never every matching sibling",
    },
    {
      files:
        "export function held(save: () => Promise<void>): Promise<void> {\n" +
        "  // @swallowed-ok(save): this marker cannot own a held recovery because detached-work-traced governs statement dispatch only.\n" +
        "  const recovered = save().catch(() => undefined);\n" +
        "  return recovered;\n" +
        "}\n",
      at: "packages/server/src/domain/probe/held-detached-marker.ts",
      expect: { count: 1, token: "promise:save" },
      why: "caught-failure ownership cannot accept a sibling marker that detached-work-traced itself classifies stale",
    },
    {
      files:
        "export async function successLaundering(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { notify('saved'); }\n" +
        "  try { await save(); } catch (err) { finish('ok'); }\n" +
        "  try { await save(); } catch (err) { setError(null); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/success-laundering.ts",
      expect: { count: 3 },
      why: "a success-valued notice, terminal, or cleared error slot cannot own the caught failure merely by callee name",
    },
    {
      files:
        "export async function noticeLaundering(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { notify.error('Saved successfully'); }\n" +
        "  try { await save(); } catch (err) { notify.error('Different operation failed'); }\n" +
        "  try { await save(); } catch (err) { notify.error('Saved successfully.', { cause: err }); }\n" +
        "  try { await save(); } catch (err) {} finally { notify.error('Different operation failed'); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/notice-laundering.ts",
      expect: { count: 4 },
      why: "a notice that neither carries the caught binding nor belongs to a bindingless failure contract cannot own this failure",
    },
    {
      files:
        "import { notify as importedNotify } from './noop.ts';\n" +
        "const notify = { error: (..._args: unknown[]): void => undefined };\n" +
        "export async function fakeNotices(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { notify.error(err); }\n" +
        "  try { await save(); } catch (err) { importedNotify.error(err); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/fake-notices.ts",
      expect: { count: 2 },
      why: "local or arbitrarily imported notice-shaped objects are not the governed user notification owner",
    },
    {
      files:
        "export async function successObject(): Promise<unknown> {\n  try { return await save(); } catch (err) { return { status: 'ok', reason: 'done' }; }\n}\n",
      at: "packages/server/src/domain/probe/success-object.ts",
      expect: { count: 1, token: "empty:err" },
      why: "a success outcome with a generic reason field does not encode the caught failure",
    },
    {
      files:
        "import { useState } from 'react';\n" +
        "export async function successWithError(): Promise<unknown> {\n" +
        "  const [, setError] = useState<unknown>();\n" +
        "  try { return await save(); } catch (err) { return { status: 'ok', error: err }; }\n" +
        "  try { await save(); } catch (err) { setError({ status: 'ok', error: err }); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/success-with-error.ts",
      expect: { count: 2 },
      why: "an explicit success outcome remains success even when it carries the caught error as incidental data",
    },
    {
      files:
        "export async function emptyFailureFields(): Promise<unknown> {\n" +
        "  try { return await save(); } catch (err) { return { error: null }; }\n" +
        "  try { return await save(); } catch (err) { return { failed: false }; }\n" +
        "  try { return await save(); } catch (err) { return { error: undefined, value: 'ok' }; }\n" +
        "}\n",
      at: "packages/server/src/domain/probe/empty-failure-fields.ts",
      expect: { count: 3 },
      why: "a failure-shaped property name does not preserve the caught failure when its value is null, undefined, or explicitly false",
    },
    {
      files:
        "export async function conditionalOwners(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { if (false) throw err; }\n" +
        "  try { await save(); } catch (err) { if (false) notify.error(err); }\n" +
        "  void save().catch((err) => { if (false) notify.error(err); });\n" +
        "}\n",
      at: "packages/client/src/features/probe/conditional-owners.ts",
      expect: { count: 3 },
      why: "an unreachable or conditional owner does not dominate the absorb path; mixed control flow needs positioned proof",
    },
    {
      files:
        "export async function escapedOwners(skip: boolean): Promise<void> {\n" +
        "  try { await save(); } catch (err) { if (skip) return; notify.error(err); }\n" +
        "  void save().catch((err) => { if (skip) return; notify.error(err); });\n" +
        "}\n",
      at: "packages/client/src/features/probe/escaped-owners.ts",
      expect: { count: 2 },
      why: "an earlier conditional escape leaves a swallow path that a later owner statement cannot dominate",
    },
    {
      files:
        "export async function shadowed(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { { const err = new Error('other'); notify.error(err); } }\n" +
        "}\n",
      at: "packages/client/src/features/probe/shadowed-owner.ts",
      expect: { count: 1, token: "empty:err" },
      why: "an owner call for a shadow binding is not ownership of the caught failure",
    },
    {
      files:
        "const recordError = (_err: unknown): void => undefined;\n" +
        "const finish = (_value: unknown): void => undefined;\n" +
        "export async function localOwnerNames(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { recordError(err); }\n" +
        "  void save().catch((err) => recordError(err));\n" +
        "  try { await save(); } catch (err) { finish(err); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/local-owner-names.ts",
      expect: { count: 3 },
      why: "a local no-op cannot become an owner by choosing an error- or terminal-shaped name",
    },
    {
      files:
        "interface P { then: unknown; catch: (handler: (err: unknown) => unknown) => P }\n" +
        "const Promise = { reject: (_err: unknown): undefined => undefined };\n" +
        "export function fakeReject(p: P): void { void p.catch((err) => Promise.reject(err)); }\n",
      at: "packages/client/src/features/probe/fake-promise-reject.ts",
      expect: { count: 1 },
      why: "a local object named Promise cannot launder a discarded rejection through a fake reject method",
    },
    {
      files:
        "const ignore = (_err: unknown): undefined => undefined;\n" +
        "const success = (_err: unknown): unknown => ({ status: 'ok' });\n" +
        "export async function returnedCalls(): Promise<unknown> {\n" +
        "  try { await save(); } catch (err) { return ignore(err); }\n" +
        "  try { await save(); } catch (err) { return success(err); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/returned-call-laundering.ts",
      expect: { count: 2 },
      why: "passing the caught binding into a local call does not prove that the returned value carries failure ownership",
    },
    {
      files:
        "export async function localSinks(): Promise<void> {\n" +
        "  const trash: any = {};\n" +
        "  const log = { warn: (..._args: unknown[]): void => undefined };\n" +
        "  try { await save(); } catch (err) { trash.error = err; }\n" +
        "  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/local-sinks.ts",
      expect: { count: 2 },
      why: "a discarded local property or fake log-shaped object is not an observable or governed failure owner",
    },
    {
      files:
        "let error: unknown; let failure: unknown;\n" +
        "export async function bareLocalSinks(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { error = err; }\n" +
        "  try { await save(); } catch (err) { failure = err; }\n" +
        "}\n",
      at: "packages/client/src/features/probe/bare-local-sinks.ts",
      expect: { count: 2 },
      why: "assigning a caught error to an unconsumed local binding is not an observable failure owner",
    },
    {
      files:
        "export async function shadowedGlobals(process: P, globalThis: G): Promise<void> {\n" +
        "  try { await save(); } catch (err) { process.stderr.write(err); }\n" +
        "  try { await save(); } catch (err) { globalThis.reportError(err); }\n" +
        "}\n",
      at: "packages/server/src/domain/probe/shadowed-globals.ts",
      expect: { count: 2 },
      why: "parameters named like ambient error sinks do not inherit the real process or globalThis ownership boundary",
    },
    {
      files:
        "import { log } from './noop.ts';\n" +
        "export async function fakeImportedLogger(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/fake-imported-logger.ts",
      expect: { count: 1 },
      why: "an arbitrary imported log-shaped object is not the repo's governed operator logger",
    },
    {
      files:
        "export async function fakeInjectedOwners(log: L, notify: N): Promise<void> {\n" +
        "  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n" +
        "  try { await save(); } catch (err) { notify.error(err); }\n" +
        "}\n",
      at: "packages/server/src/domain/probe/fake-injected-owners.ts",
      expect: { count: 2 },
      why: "an arbitrary parameter with a logger or notice-shaped method is not a governed failure surface",
    },
    {
      files:
        "import type pino from 'pino';\n" +
        "export async function missingContext(log: pino.Logger): Promise<void> {\n" +
        "  try { await save(); } catch (err) { log.warn({ err }, ''); }\n" +
        "  try { await save(); } catch (err) { log.warn({ err }, undefined); }\n" +
        "}\n",
      at: "packages/server/src/domain/probe/contextless-log.ts",
      expect: { count: 2 },
      why: "a structured log needs a non-empty operation message; bare error metadata has no operator context",
    },
    {
      files:
        "import { useQuery } from '@tanstack/react-query';\n" +
        "import { withRequestSpan } from '#foundation/observability';\n" +
        "export function shadows(useQuery: () => Q, withRequestSpan: () => Promise<void>): void {\n" +
        "  const query = useQuery();\n" +
        "  void query.refetch().catch(() => undefined);\n" +
        "  void withRequestSpan().catch(() => undefined);\n" +
        "}\n",
      at: "packages/client/src/features/probe/shadowed-framework-imports.ts",
      expect: { count: 2 },
      why: "a parameter shadowing a real import does not inherit that imported framework's ownership",
    },
    {
      files:
        "import { useQuery } from '@tanstack/react-query';\n" +
        "import { createEntityMutation } from '#data';\n" +
        "import { logger } from '#foundation/observability';\n" +
        "const useOwned = createEntityMutation({ options, errorToast: 'Could not save.' });\n" +
        "export async function reassignedOwners(fakeQuery: Q, fakeMutation: M, fakeLog: L): Promise<void> {\n" +
        "  let query = useQuery(options); query = fakeQuery;\n" +
        "  let mutation = useOwned(); mutation = fakeMutation;\n" +
        "  let log = logger; log = fakeLog;\n" +
        "  void query.refetch().catch(() => undefined);\n" +
        "  void mutation.mutateAsync(input).catch(() => undefined);\n" +
        "  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n" +
        "}\n",
      at: "packages/server/src/domain/probe/reassigned-owners.ts",
      expect: { count: 3 },
      why: "a governed initializer cannot own work after the binding is reassigned to an unproven implementation",
    },
    {
      files:
        "import { notify } from '#lib';\n" +
        "import { createEntityMutation } from '#data';\n" +
        "let own = (err: unknown): void => notify.error(err); own = () => undefined;\n" +
        "let logicalOwn = (err: unknown): void => notify.error(err); logicalOwn &&= () => undefined;\n" +
        "let propagate = (err: unknown): Promise<never> => Promise.reject(err); propagate = () => Promise.resolve(undefined as never);\n" +
        "let useOwned = createEntityMutation({ options, errorToast: 'Could not save.' }); useOwned = fakeHook;\n" +
        "let logicalUseOwned = createEntityMutation({ options, errorToast: 'Could not save.' }); logicalUseOwned &&= fakeHook;\n" +
        "let failureFactory = (err: unknown): unknown => ({ status: 'failed', error: err }); failureFactory = () => undefined;\n" +
        "export async function reassignedHandlerOwners(p: Promise<void>): Promise<unknown> {\n" +
        "  void p.catch(own);\n" +
        "  void p.catch(logicalOwn);\n" +
        "  void p.catch(propagate);\n" +
        "  void useOwned().mutateAsync(input).catch(() => undefined);\n" +
        "  void logicalUseOwned().mutateAsync(input).catch(() => undefined);\n" +
        "  try { await save(); } catch (err) { return failureFactory(err); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/reassigned-handler-owners.ts",
      expect: { count: 6 },
      why: "a named handler, propagation helper, mutation hook, or failure factory loses governed provenance after reassignment",
    },
    {
      files:
        "import { notify } from '#lib';\n" +
        "export function hoistedReassignedHandlers(p: Promise<void>): unknown {\n" +
        "  owned = () => undefined;\n" +
        "  propagate = () => Promise.resolve(undefined as never);\n" +
        "  failureFactory = () => ({ status: 'ok' });\n" +
        "  for (loopOwned of [() => undefined]) {}\n" +
        "  void p.catch(owned);\n" +
        "  void p.catch(loopOwned);\n" +
        "  void p.catch(propagate);\n" +
        "  try { risky(); } catch (err) { return failureFactory(err); }\n" +
        "}\n" +
        "function owned(err: unknown): void { notify.error(err); }\n" +
        "function loopOwned(err: unknown): void { notify.error(err); }\n" +
        "function propagate(err: unknown): Promise<never> { return Promise.reject(err); }\n" +
        "function failureFactory(err: unknown): unknown { return { status: 'failed', error: err }; }\n",
      at: "packages/client/src/features/probe/hoisted-reassigned-handlers.ts",
      expect: { count: 4 },
      why: "hoisting and loop assignment do not preserve an owner's implementation after an earlier write replaces the function binding",
    },
    {
      files:
        "const partial = (err: unknown): Promise<never> | undefined => { if (flag) return undefined; return Promise.reject(err); };\n" +
        "export function partialReject(p: Promise<void>): void {\n" +
        "  void p.catch((err) => { if (flag) return undefined; return Promise.reject(err); });\n" +
        "  void p.catch(partial);\n" +
        "}\n",
      at: "packages/server/src/domain/probe/partial-reject.ts",
      expect: { count: 2 },
      why: "Promise.reject owns only the path that reaches it; an earlier recovered path still absorbs the rejection",
    },
    {
      files:
        "const maybeFailure = (err: unknown): { status: 'failed'; error: unknown } | undefined => { if (flag) return { status: 'failed', error: err }; };\n" +
        "export async function partialFailureFactory(): Promise<unknown> {\n" +
        "  try { await save(); } catch (err) { return maybeFailure(err); }\n" +
        "}\n",
      at: "packages/server/src/domain/probe/partial-failure-factory.ts",
      expect: { count: 1, token: "empty:err" },
      why: "a local failure factory with an implicit success-valued fallthrough does not preserve failure ownership on every path",
    },
    {
      files:
        "import { notify } from '#lib';\n" +
        "export async function optionalOwners(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { globalThis.reportError?.(err); }\n" +
        "  try { await save(); } catch (err) { notify?.error(err); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/optional-owners.ts",
      expect: { count: 2 },
      why: "an optional owner call can be skipped and therefore does not dominate the swallow path",
    },
    {
      files:
        "import { metrics as log } from '#foundation/observability';\n" +
        "import { metrics as notify } from '#lib';\n" +
        "import type pino from 'pino';\n" +
        "type Fake<T> = { warn: (context: unknown, message: string) => void };\n" +
        "export async function fakeApprovedExports(logParam: Fake<pino.Logger>): Promise<void> {\n" +
        "  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n" +
        "  try { await save(); } catch (err) { notify.error(err); }\n" +
        "  try { await save(); } catch (err) { logParam.warn({ err }, 'save failed'); }\n" +
        "}\n",
      at: "packages/server/src/domain/probe/fake-approved-exports.ts",
      expect: { count: 3 },
      why: "an approved module or nested logger type does not govern arbitrary exports and wrapper parameters",
    },
    {
      files:
        "import { useState } from 'react';\n" +
        "export async function fakeSetterSlot(): Promise<void> {\n" +
        "  const [setError] = useState<(value: unknown) => void>(() => undefined);\n" +
        "  try { await save(); } catch (err) { setError(err); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/fake-setter-slot.ts",
      expect: { count: 1, token: "empty:err" },
      why: "a function-valued React state value named like a setter is not the tuple's observable setter slot",
    },
    {
      files:
        "import { notify } from '#lib';\n" +
        "import { useState } from 'react';\n" +
        "export async function erasedBindingReferences(state: S): Promise<unknown> {\n" +
        "  const [, setError] = useState<unknown>();\n" +
        "  try { await save(); } catch (err) { return err === undefined; }\n" +
        "  try { await save(); } catch (err) { setError(err === undefined); }\n" +
        "  try { await save(); } catch (err) { state.error = (void err, null); }\n" +
        "  try { await save(); } catch (err) { notify.error('Saved.', { cause: err }); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/erased-binding-references.ts",
      expect: { count: 4 },
      why: "incidental reference to a caught binding does not preserve the failure value, and success copy overrides metadata",
    },
    {
      files: "export function deadRecoveredLocal(): void {\n  const ignored = save().catch((err) => ({ status: 'failed', error: err }));\n}\n",
      at: "packages/client/src/features/probe/dead-recovered-local.ts",
      expect: { count: 1, token: "promise:save" },
      why: "retaining recovered failure data in an unread local does not create a consumer or owner",
    },
    {
      files:
        "const ignore = (_value: unknown): void => undefined;\n" +
        "export function vacuousRecoveryConsumers(): void {\n" +
        "  ignore(save().catch((err) => ({ status: 'failed', error: err })));\n" +
        "  const recovered = save().catch((err) => ({ status: 'failed', error: err }));\n" +
        "  void recovered;\n" +
        "}\n",
      at: "packages/client/src/features/probe/vacuous-recovery-consumers.ts",
      expect: { count: 2 },
      why: "a local no-op argument or void read does not consume a recovered failure outcome",
    },
    {
      files:
        "import { recordTurnOutcome } from '#foundation/observability';\n" +
        "export function counterfeitRecoveryConsumption(): unknown {\n" +
        "  let overwritten = save().catch((err) => ({ status: 'failed', error: err }));\n" +
        "  overwritten = Promise.resolve({ status: 'failed', error: new Error('other') });\n" +
        "  const deadReturn = save().catch((err) => ({ status: 'failed', error: err }));\n" +
        "  const readLater = (): unknown => deadReturn;\n" +
        "  const deadRecord = save().catch((err) => ({ status: 'failed', error: err }));\n" +
        "  const recordLater = (): void => recordTurnOutcome(deadRecord);\n" +
        "  return overwritten;\n" +
        "}\n",
      at: "packages/server/src/domain/probe/counterfeit-recovery-consumption.ts",
      expect: { count: 3 },
      why: "an overwritten value or reference trapped in an unconsumed closure does not consume the original recovered failure outcome",
    },
    {
      files:
        "export async function ephemeralAssignments(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { ({} as { error?: unknown }).error = err; }\n" +
        "  try { await save(); } catch (err) { makeScratch().error = err; }\n" +
        "}\n",
      at: "packages/client/src/features/probe/ephemeral-assignments.ts",
      expect: { count: 2 },
      why: "assigning a caught failure onto a temporary object that immediately dies is not observable state ownership",
    },
    {
      files:
        "import { useQuery } from '@tanstack/react-query';\n" +
        "export async function mixed(): Promise<void> {\n" +
        "  const query = useQuery(options);\n" +
        "  try { await risky(); await query.refetch(); } catch {}\n" +
        "}\n",
      at: "packages/client/src/features/probe/mixed-query-catch.ts",
      expect: { count: 1, token: "empty:catch" },
      why: "query state owns only its own refetch rejection, not an unrelated operation sharing the try block",
    },
    {
      files:
        "import { createEntityMutation } from '#data';\n" +
        "const useEmpty = createEntityMutation({ options, errorToast: '' });\n" +
        "const useMissing = createEntityMutation({ options, errorToast: undefined });\n" +
        "const useSuccess = createEntityMutation({ options, errorToast: 'Saved successfully.' });\n" +
        "export function invalidToasts(): void {\n" +
        "  void useEmpty().mutateAsync(input).catch(() => undefined);\n" +
        "  void useMissing().mutateAsync(input).catch(() => undefined);\n" +
        "  void useSuccess().mutateAsync(input).catch(() => undefined);\n" +
        "}\n",
      at: "packages/client/src/features/probe/invalid-mutation-toasts.ts",
      expect: { count: 3 },
      why: "an empty, undefined, or success-valued errorToast does not create a user-visible mutation owner",
    },
    {
      files:
        "export function control(xs: unknown[]): void {\n" +
        "  for (const x of xs) { try { risky(x); } catch { continue; } }\n" +
        "  for (const x of xs) { try { risky(x); } catch { break; } }\n" +
        "}\n" +
        "export function early(): void { try { risky(); } catch { return; } }\n",
      at: "packages/server/src/domain/probe/control.ts",
      expect: { count: 3, token: "empty:catch" },
      why: "continue, break, and bare return erase the failure through control flow without naming an owner",
    },
    {
      files: "export function fallback(): null {\n  try { return parse(); } catch { return null; }\n}\n",
      at: "packages/server/src/domain/probe/default.ts",
      expect: { count: 1, token: "default:catch" },
      why: "an undocumented silent default changes behavior without proving who owns the failure contract",
    },
    {
      files:
        "export function foreign(save: () => Promise<void>): void {\n" +
        "  // @swallowed-ok(save): a client marker is outside detached-work-traced's server scope.\n" +
        "  void save().catch(() => undefined);\n" +
        "}\n",
      at: "packages/client/src/features/probe/foreign-swallowed.ts",
      expect: { count: 1, token: "promise:save" },
      why: "only a marker governed at this exact path and position by detached-work-traced can carry coupled ownership",
    },
    {
      files:
        "export function evict(): void {\n  // @swallowed-ok(other): the wrong detached-work position must not launder this absorber.\n" +
        "  void cache.evict().catch(() => undefined);\n}\n",
      at: "packages/server/src/domain/probe/wrong-detached-owner.ts",
      expect: { count: 1, token: "promise:evict" },
      why: "a detached-work marker for a different position is not ownership evidence for this rejection",
    },
    {
      files: "export function evict(): void {\n  // @swallowed-ok(evict)\n  void cache.evict().catch(() => undefined);\n}\n",
      at: "packages/server/src/domain/probe/malformed-detached-owner.ts",
      expect: { count: 1, token: "promise:evict" },
      why: "a malformed detached-work marker with no reason suppresses nothing",
    },
  ],
  mustPass: [
    {
      files:
        "async function closeAfterFailure(primary: unknown): Promise<never> { throw primary; }\n" +
        "export async function ownedCleanup(): Promise<void> {\n" +
        "  try { await save(); } catch (err) { return await closeAfterFailure(err); }\n" +
        "}\n",
      at: "tooling/src/probe/never-returning-cleanup.ts",
      why: "a Promise<never> cleanup boundary preserves the primary failure and cannot recover the catch path",
    },
    {
      files:
        "export async function measured(): Promise<{ kind: 'absent' } | { kind: 'unproven'; reason: string }> {\n" +
        "  try { await probe(); return { kind: 'absent' }; } catch (err) { return { kind: 'unproven', reason: String(err) }; }\n" +
        "}\n",
      at: "tooling/src/probe/unproven-outcome.ts",
      why: "an explicit unproven result is failure-valued evidence that prevents the caller from treating a failed measurement as absence",
    },
    {
      files:
        "export async function failedStatus(): Promise<unknown> {\n  try { return await save(); } catch { return { status: 'failed', error: null }; }\n}\n",
      at: "packages/server/src/domain/probe/failed-status.ts",
      why: "an explicit failed status owns the failure-valued result even when no exception object is retained",
    },
    {
      files:
        "import { recordTurnOutcome } from '#foundation/observability';\n" +
        "export function consumedRecovery(p: Promise<void>): void {\n" +
        "  recordTurnOutcome(p.catch((err) => ({ status: 'failed', error: err })));\n" +
        "}\n",
      at: "packages/client/src/features/probe/consumed-recovery.ts",
      why: "the governed observability sink consumes the recovered failure outcome as an error-as-data contract",
    },
    {
      files:
        "export function propagatedReject(p: Promise<void>): void {\n" +
        "  void p.catch((err) => Promise.reject(err));\n" +
        "  void p.catch((err) => { return Promise.reject(err); });\n" +
        "}\n",
      at: "packages/server/src/domain/probe/propagated-reject.ts",
      why: "native Promise.reject of the caught binding preserves rejection even when the outer chain is not retained",
    },
    {
      files: "export async function reject(): Promise<never> { try { await save(); } catch (err) { return Promise.reject(err); } }\n",
      at: "packages/server/src/domain/probe/promise-reject.ts",
      why: "Promise.reject of the caught binding preserves rejection and therefore propagates ownership",
    },
    {
      files: "export function configProbe(): void { try { save(); } catch {} }\n",
      at: "packages/client/vite.config.ts",
      why: "package build and config files outside packages/<name>/src are explicitly outside the governed source corpus",
    },
    {
      files: "import { z } from 'zod';\nconst assigned = z.string().catch('fallback');\nexport const terminal = z.number().catch(0);\n",
      at: "packages/contracts/src/probe/zod-catch.ts",
      why: "Zod catch combinators are non-Promise schema construction and remain outside caught-rejection ownership",
    },
    {
      files:
        "export function propagatedHandlers(p: Promise<void>): void {\n" +
        "  void p.catch(undefined);\n" +
        "  void p.then(undefined, undefined);\n" +
        "  void p.catch(null as any);\n" +
        "  void p.catch(false as any);\n" +
        "  void p.then(undefined, 0 as any);\n" +
        "}\n",
      at: "packages/client/src/features/probe/propagated-handlers.ts",
      why: "an undefined Promise handler is not a catch: Promise semantics propagate the rejection unchanged",
    },
    {
      files:
        "import { createEntityMutation } from '#data';\n" +
        'const useSave = createEntityMutation({ options, busDriven: true, errorToast: "Couldn\'t save." });\n' +
        "export function mutate(): void {\n" +
        "  const mutation = useSave({ trpc, invalidation });\n" +
        "  void mutation.mutateAsync(input).catch(() => undefined);\n" +
        "}\n",
      at: "packages/client/src/features/probe/mutation.ts",
      why: "the governed entity-mutation factory's required errorToast owns the rejection",
    },
    {
      files:
        "import { useQuery } from '@tanstack/react-query';\n" +
        "export function query(): void {\n  const query = useQuery(options);\n  void query.refetch().catch(() => undefined);\n}\n",
      at: "packages/client/src/features/probe/query.ts",
      why: "TanStack query operations retain their failure in query state",
    },
    {
      files:
        "import { useForm } from '@tanstack/react-form';\n" +
        "export function form(): void {\n  const form = useForm(options);\n  void form.handleSubmit().catch(() => undefined);\n}\n",
      at: "packages/client/src/features/probe/form.ts",
      why: "the TanStack form submission state owns the rejection",
    },
    {
      files:
        "import { useState } from 'react';\n" +
        "export async function formError(): Promise<void> {\n" +
        "  const [, setError] = useState<string | null>(null);\n" +
        "  try { await save(); } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.'); }\n" +
        "}\n",
      at: "packages/client/src/features/probe/form-error.ts",
      why: "a genuine React setter owns a failure-valued message on every conditional arm",
    },
    {
      files:
        "export function allowed(raw: string): boolean {\n" +
        "  // @orb-gate-ignore caught-failure-ownership(default:err): fail-closed auth parser owns false as denial. Ends if callers distinguish malformed input.\n" +
        "  try { return parse(raw); } catch (err) { return false; }\n" +
        "}\n",
      at: "packages/server/src/infra/auth/parser.ts",
      why: "an irreducible fail-closed auth/parser contract can name its owner through the shared marker",
    },
    {
      files:
        "import type pino from 'pino';\nexport function logged(log: pino.Logger): void {\n  try { run(); } catch (err) { log.warn({ err, job: 'sync' }, 'sync failed'); }\n}\n",
      at: "packages/server/src/domain/probe/logged.ts",
      why: "a structured contextual operator log is machine-visible ownership",
    },
    {
      files:
        "export function cleanup(stream: S): void {\n  // @orb-gate-ignore caught-failure-ownership(promise:cancel): teardown has no user result; failure only leaves an already-closing stream for process exit. Ends if teardown becomes retryable.\n" +
        "  void stream.cancel().catch(() => undefined);\n}\n",
      at: "packages/server/src/infra/probe/cleanup.ts",
      why: "a cleanup/teardown absorber may be explicitly safe and stale-checked by the shared marker infrastructure",
    },
    {
      files: {
        [DETACHED_TRACING_MODULE]: DETACHED_TRACING_FIXTURE,
        "packages/server/src/domain/probe/live-detached-owner.ts":
          "export function evict(): void {\n  // @swallowed-ok(evict): detached-work-traced owns this cache eviction; failure only costs RAM until exit. Ends if eviction gains a caller.\n" +
          "  void cache.evict().catch(() => undefined);\n}\n",
      },
      at: "packages/server/src/domain/probe/live-detached-owner.ts",
      why: "a live exact-position detached-work marker is already stale-checked machine-visible ownership evidence",
    },
    {
      files: {
        [DETACHED_TRACING_MODULE]: DETACHED_TRACING_FIXTURE,
        "packages/server/src/domain/probe/live-detached-bracket-owner.ts":
          "export function evict(): void {\n  // @swallowed-ok(evict): detached-work-traced owns this bracket-linked eviction; failure only costs RAM until exit. Ends if eviction gains a caller.\n" +
          "  void cache.evict()['catch'](() => undefined);\n}\n",
      },
      at: "packages/server/src/domain/probe/live-detached-bracket-owner.ts",
      why: "caught ownership accepts a bracket-linked sibling marker only because detached-work-traced governs that exact site",
    },
    {
      files:
        "export function engine(): void {\n  // @orb-gate-ignore caught-failure-ownership(promise:runOuter): the engine records the terminal before this caller boundary. Ends if runOuter stops owning terminal state.\n" +
        "  void runOuter().catch(() => undefined);\n}\n",
      at: "packages/server/src/domain/probe/engine.ts",
      why: "a deliberate outer engine absorber names the terminal owner instead of relying on syntax",
    },
    {
      files: "import { notify } from '#lib';\nexport function surfaced(): void {\n  void save().catch((err) => notify.error(err));\n}\n",
      at: "packages/client/src/features/probe/surfaced.ts",
      why: "a direct user-visible error surface owns the rejection",
    },
    {
      files:
        "import { notify } from '#lib';\nexport function surfacedCopy(): void {\n  void save().catch((err) => notify.error(\"Couldn't save.\", { cause: err }));\n}\n",
      at: "packages/client/src/features/probe/surfaced-copy.ts",
      why: "failure-valued copy plus caught-error metadata is a contextual user-visible owner",
    },
    {
      files: "export async function propagated(): Promise<void> {\n  try { await save(); } catch (err) { throw err; }\n}\n",
      at: "packages/server/src/domain/probe/propagated.ts",
      why: "rethrowing preserves caller ownership",
    },
    {
      files:
        "import { notify } from '#lib';\nfunction reportSaveFailure(err: unknown): void { notify.error(err); }\nexport function named(): void {\n  void save().catch(reportSaveFailure);\n}\n",
      at: "packages/client/src/features/probe/named.ts",
      why: "a named rejection handler is a machine-visible owner boundary",
    },
  ],
};
