// Shared reader: the CAUGHT-FAILURE OWNERSHIP classifier. A SYNTACTICALLY handled rejection is not
// ownership. Given one delivered `CatchClause` or `CallExpression`, this reader answers whether the site
// absorbs a failure with no machine-visible owner, and WHERE a waiver marker must be anchored.
//
// ── WHY THIS IS A SHARED READER AND NOT A GATE-PRIVATE ONE (#1584, census blocker at
//    docs/reviews/gate-runtime/uncovered-gate-conversion-census.md:182: "must split reusable failure facts")
// TWO consumers read the SAME producer, and that is the whole point: `gates/caught-failure-ownership.ts`
// reports from it, and `ops/gen/caught-failure-population.ts` derives the durable census at
// docs/reviews/caught-failure-ownership/population.json from it. Two readers of one population is exactly
// how an artifact and a gate silently disagree, so there is ONE classifier and both call it.
//
// ── THE ARMS ────────────────────────────────────────────────────────────────────────────────────────────
//   promise   a `.catch(h)` / `.then(_, h)` — in ANY spelling: dot or bracket key (literal,
//             parenthesized, literal-typed, `+`-concatenated, same-file const), optional access, and
//             `call` / `apply` / `Reflect.apply` / a bound alias — whose handler discards the failure.
//   empty     a CatchClause whose block (and its `finally`) names no owner.
//   default   a catch whose only escape is a constant fallback (`return null` / `[]` / `{}` / `-1`).
//             The behaviour changed and nobody was told; the failure contract is unstated.
//
// ── WHAT PASSES, AND WHY IT IS ALL PROVENANCE ───────────────────────────────────────────────────────────
// Rethrow · a DISCRIMINATED rethrow (a narrowly-guarded early return beside an escaping `throw <the caught
// binding>`, or a typed wrapper chaining `{ cause: <the caught binding> }` — one documented case, every
// other failure propagates; fenced on binding IDENTITY, so a substituted value with NO cause, a lossy
// `String(err)` message, or a throw inside a nested function do NOT count) · a call that CANNOT
// RETURN (`never`, or `Promise<never>`) — control leaves only by throwing, so it is propagation, and it
// holds for a bindingless catch · `Promise.reject(err)` of the caught binding (the
// NATIVE one; a local object named `Promise` does not launder) · a structured contextual log on the
// governed pino/`getLog` logger · `securityEvent(<named event>)` at that same door (it owns without the
// caught binding by design — a reject seam must not leak the raw crypto error, so the NAMED reason is the
// trail) · the governed
// `notify`/toast manager carrying the failure with non-success copy · a genuine React `useState` SETTER
// slot (tuple element [1]) fed a failure-VALUED argument · TanStack query/form and `createEntityMutation`
// with a failure-valued `errorToast` · `withRequestSpan` · a named handler that itself owns · an
// error-as-data outcome that a real consumer reads. A success discriminator (`{ status: 'ok', error: err }`)
// REFUSES ownership: carrying the error as incidental data beside a success verdict is the laundering shape.
// Reassignment kills provenance — a governed initializer overwritten by `x = fake` owns nothing after.
//
// ── THE ANCHOR IS THE POSITION, AND THE POSITION IS AN EXACT SOURCE SLICE ────────────────────────────────
// The final ordinary-waiver engine narrows candidates TWICE: carrier containment, then
// `finding.token === marker.position` (lib/ordinary-waiver.ts:504,537), and `locateFinding` (:420,:428)
// additionally requires the finding's own line/column to point at that exact token IN AUTHORED CODE. So a
// position CANNOT be a synthetic label — the retired legacy vocabulary (`promise:save`, `empty:err`,
// `default:catch`) was exactly that, and there is no function from it to a source slice. Each site
// therefore carries its own `token`/`offset` pair, anchored inside its reported node:
//   · catch arms  → the caught BINDING's name (`err`, `error`, `e`), or the `catch` keyword when the clause
//                   is bindingless. One TryStatement holds one catch clause, so the binding name is unique
//                   inside the carrier the marker binds to.
//   · promise arm → the WORK's callee text, never the plumbing link: `save`, `a.save`, `cache.evict`, `p`.
//                   A member chain is a legitimate token (the precedent is `no-form-state-in-useeffect`,
//                   which reports `form.state.values`), and it is what keeps two same-named absorbers in
//                   one statement separately waivable — `a.save` and `b.save` differ where the retired
//                   vocabulary had to mint a `promise:save_2` suffix that no source slice could spell.
// When no clean anchor exists (an indirect `Reflect.apply` spelling whose work node lies outside the
// reported call, or text carrying a paren/newline the marker grammar's `[^()\r\n]+` position group cannot
// hold), the site declares NO token and the runtime derives one (policy-pass-context.ts:109). That is the
// honest fallback: an underivable anchor must not become an invented label.
//
// ── DECLARED LIMITS ─────────────────────────────────────────────────────────────────────────────────────
// A dynamically-keyed rejection link is unreadable, not assumed · zod's `.catch()` combinator is schema
// construction, not a promise · a rethrow or owner routed through an opaque helper is invisible to a
// syntactic reader. The POPULATION fence (which files carry a failure contract at all) is the consuming
// policy's declaration, not this reader's.
//
// Descendant reads here are bounded SUBTREE analysis of a delivered node plus same-file binding identity —
// the shared-reader layer's own job (gate-runtime-standardization.md §12.3: "binding identity, static-value
// unwrapping ... are shared primitives"). No Project, no workspace cache, no filesystem, no marker parser.
import type { BindingElement, Block, CallExpression, CatchClause, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureArm } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import { isWaivablePosition } from "./waivable-coordinate.ts";

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

/** `securityEvent(<event>, …)` from the governed observability door — one consistently-tagged `security:true`
 *  pino line, which IS the operator surface for a rejection. It owns WITHOUT the caught binding on purpose:
 *  the whole point of these seams (JWKS parse, JWT verify, credential decrypt) is that the raw error must not
 *  leak, so the NAMED reason is the evidence and the error object is deliberately dropped. Provenance-checked
 *  like every other owner, and the event name must be a readable non-empty literal — an unnamed event is not
 *  a greppable trail. */
function securityEventOwns(call: CallExpression): boolean {
  if (importedName(call.getExpression(), OBSERVABILITY_MODULES) !== "securityEvent") {
    return false;
  }
  const event = call.getArguments()[0];
  const name = event === undefined ? undefined : staticStringValue(event);
  return name !== undefined && name.trim().length > 0;
}

function isExplicitOwnerCall(call: CallExpression, errorBinding: Node | undefined): boolean {
  if (isSkippableCall(call)) {
    return false;
  }
  const name = calleeName(call);
  if (name === undefined) {
    return false;
  }
  if (isStructuredLog(call, errorBinding) || securityEventOwns(call)) {
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

/** A call that CANNOT RETURN — `never` (sync) or `Promise<never>` (async). Control can only leave it by
 *  throwing or rejecting, so it is PROPAGATION: the strongest ownership there is, and it does not depend on
 *  the catch having a binding. The sync half is why `return throwDecryptFailure(sealed)` — a `never`-typed
 *  helper that logs the typed error and throws it — is ownership rather than a swallow; without it the gate
 *  demanded a marker for the one shape it should reward most. */
function cannotReturn(type: ReturnType<CallExpression["getType"]>): boolean {
  if (type.isNever()) {
    return true;
  }
  return type.getText().startsWith("Promise<") && type.getTypeArguments().some((argument) => argument.isNever());
}

function callIsFailureOutcome(value: CallExpression, errorBinding: Node | undefined): boolean {
  const type = value.getType();
  if (isNativePromiseReject(value, errorBinding) || cannotReturn(type)) {
    return true;
  }
  if (errorBinding === undefined || !referencesBinding(value, errorBinding)) {
    return false;
  }
  return typeIsFailureOutcome(value) || governedFailureFactoryCall(value);
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

/** Does a `throw` ESCAPE this block, rather than being caught or returned somewhere inside it? A nested
 *  function's throw rejects that call, not this one; an inner catch clause absorbs; an inner `try` whose
 *  statement HAS a catch absorbs. */
function throwEscapes(thrown: Node, block: Block): boolean {
  let current: Node | undefined = thrown.getParent();
  while (current !== undefined && current !== block) {
    if (FUNCTION_KINDS.has(current.getKind()) || current.isKind(SyntaxKind.CatchClause)) {
      return false;
    }
    const parent = current.getParent();
    if (parent?.isKind(SyntaxKind.TryStatement) === true && parent.getTryBlock() === current && parent.getCatchClause() !== undefined) {
      return false;
    }
    current = parent;
  }
  return current === block;
}

/**
 * THE DISCRIMINATED-RETHROW CREDIT (#751, owner ruling — the "Arm 3" provable subset).
 *
 * `catch (error) { if (errnoIs(error, "ENOENT")) { return []; } throw error; }` is the tree's most common
 * CORRECT error handling: ONE narrowly-guarded documented case, and every other failure propagates
 * UNCHANGED. 81 of the 439 enforced sites are this shape. Without this credit the gate demanded a marker
 * for it — taxing the right idiom, which is the inverse of rewarding runtime ownership.
 *
 * THE FENCE IS BINDING IDENTITY, and it is the whole reason this is provable: the thrown value must BE the
 * caught binding. `throw new Error("refresh failed")` is loud but it destroys the original failure's
 * identity and cause chain, so it is NOT propagation of THIS failure and stays red. A throw that cannot
 * escape (nested function, inner catch) is not propagation either. Deliberately NOT generalized to
 * all-paths ownership: the conservative `escape` verdict is what keeps `if (skip) return; notify.error(err)`
 * red, and that row is pinned on both sides of this change.
 */
/** A typed wrapper that CHAINS the caught failure — `throw new CatalogUnavailableError(msg, { cause: err })`.
 *  The standard `cause` contract keeps the original error reachable, so the failure is re-typed for the
 *  caller rather than destroyed. Deliberately NARROW: only an explicit `cause` carrying the binding counts.
 *  `throw new Error(String(err))` keeps the message and drops the identity, stack and chain — that is lossy,
 *  so it stays red and its site owes a reason. */
function throwChainsCause(thrown: Node, errorBinding: Node): boolean {
  return thrown.getDescendantsOfKind(SyntaxKind.PropertyAssignment).some((property) => {
    const initializer = property.getInitializer();
    return property.getName() === "cause" && initializer !== undefined && directlyCarriesBinding(initializer, errorBinding);
  });
}

function rethrowsCaughtBinding(block: Block, errorBinding: Node | undefined): boolean {
  if (errorBinding === undefined) {
    return false;
  }
  return block.getDescendantsOfKind(SyntaxKind.ThrowStatement).some((thrown) => {
    if (!throwEscapes(thrown, block)) {
      return false;
    }
    const expression = thrown.getExpression();
    return directlyCarriesBinding(expression, errorBinding) || throwChainsCause(expression, errorBinding);
  });
}

function hasExplicitOwner(block: Block, errorBinding: Node | undefined, returnedOutcomeOwns = true): boolean {
  for (const statement of block.getStatements()) {
    const verdict = statementOwner(statement, errorBinding, returnedOutcomeOwns);
    if (verdict === "owner") {
      return true;
    }
    if (verdict === "escape") {
      // A guarded early exit only leaves a swallow path if the REST of the block absorbs. When the block
      // still rethrows the caught binding, the non-discriminated path propagates and every exit is owned.
      return rethrowsCaughtBinding(block, errorBinding);
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

/** The waiver position a site declares: an exact slice of the reported node's own text, at `offset` bytes
 *  from that node's start. `undefined` means "no clean anchor exists — let the runtime derive one". */
export interface CaughtFailureAnchor {
  readonly token: string;
  readonly offset: number;
}

/** A position the marker grammar can hold, PLUS this reader's own belt. The grammar half is DERIVED from
 *  `lib/ordinary-waiver.ts` through {@link isWaivablePosition} rather than respelled here (#1957) — a second
 *  copy of `[^()\r\n]+` is a rule that can drift from the parser it is supposed to mirror. The belt is the
 *  SOLIDUS: `locateFinding` re-reads the slice out of COMMENT-BLANKED source, so a token spanning internal
 *  trivia would not match itself, and no legitimate callee or caught-binding position contains one. */
function isAnchorableToken(token: string): boolean {
  return isWaivablePosition(token) && !token.includes("/");
}

function anchorWithin(reported: Node, anchor: Node): CaughtFailureAnchor | undefined {
  const offset = anchor.getStart() - reported.getStart();
  const token = anchor.getText();
  if (offset < 0 || !isAnchorableToken(token)) {
    return;
  }
  return reported.getText().slice(offset, offset + token.length) === token ? { token, offset } : undefined;
}

/** The NAME half of a member access, in either spelling — always a single clean token, which is what makes
 *  it the usable fallback when the whole callee chain carries a newline. */
function memberNameNode(node: Node): Node | undefined {
  const member = unwrapExpression(node);
  if (member.isKind(SyntaxKind.PropertyAccessExpression)) {
    return member.getNameNode();
  }
  return member.isKind(SyntaxKind.ElementAccessExpression) ? member.getArgumentExpression() : undefined;
}

/** One call's anchors, WIDEST identity first: the whole callee chain (`a.save`), then just its member name
 *  (`save`). The chain is preferred because it is what keeps two same-named siblings in one marker carrier
 *  separately waivable; the name is what survives a MULTI-LINE chain, which the marker grammar cannot hold. */
export function calleeAnchorCandidates(call: CallExpression): readonly Node[] {
  const callee = unwrapExpression(call.getExpression());
  const name = memberNameNode(callee);
  return name === undefined ? [callee] : [callee, name];
}

/** The WORK an absorber guards — never the plumbing link. Walks inward past `then`/`catch`/`finally` so
 *  `save().then(x).catch(h)` anchors on `save`, and `a.save().catch(h)` on the whole `a.save` chain. */
function workAnchorCandidates(call: CallExpression, invocation: PromiseRejectionInvocation): readonly Node[] {
  if (!invocation.direct) {
    const receiver = invocation.receiver;
    return receiver.isKind(SyntaxKind.CallExpression) ? calleeAnchorCandidates(receiver) : [receiver];
  }
  let cursor: Node = call;
  for (;;) {
    if (!cursor.isKind(SyntaxKind.CallExpression)) {
      return [cursor];
    }
    const member = literalMember(cursor.getExpression());
    if (member === undefined || !PROMISE_CHAIN_LINKS.has(member.name)) {
      return calleeAnchorCandidates(cursor);
    }
    cursor = member.receiver;
  }
}

/** The first candidate the marker grammar can actually hold. ONE TAIL RETURN over an accumulator — biome's
 *  `noUselessUndefined` deletes a trailing `return undefined;` and tsc's `noImplicitReturns` then reds the
 *  fall-through, and this is the sanctioned shape out of that pincer (.claude/rules/gates-and-tooling.md).
 *  `??=` still short-circuits, so a later candidate is never evaluated once one has anchored. */
export function firstAnchor(reported: Node, candidates: readonly Node[]): CaughtFailureAnchor | undefined {
  let found: CaughtFailureAnchor | undefined;
  for (const candidate of candidates) {
    found ??= anchorWithin(reported, candidate);
  }
  return found;
}

/** One PROMISE-shaped site: the absorber call, or undefined when the rejection is propagated, ignored,
 *  consumed as error-as-data, or owned by a governed framework surface. */
export function promiseAbsorberSite(call: CallExpression): CaughtFailureSite | undefined {
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
  const workCall = underlyingWorkCall(call, invocation);
  if (workCall !== undefined && frameworkOwns(workCall)) {
    return;
  }
  // The WORK is the position a reader would name, widest identity first. The later candidates are the
  // fallbacks that keep the position DERIVABLE rather than invented: a MULTI-LINE chain cannot hold its
  // whole callee in a position group, so the member NAME carries it; an indirect `Reflect.apply` /
  // bound-alias spelling has its work node OUTSIDE the reported call, so the ABSORBER's own callee — always
  // a prefix of the reported node — carries it, and its link name is the last resort. Only a wholly
  // parenthesized or computed callee leaves the anchor underivable, and the census REFUSES loudly on one.
  return {
    arm: "promise",
    node: call,
    anchor: firstAnchor(call, [...workAnchorCandidates(call, invocation), ...calleeAnchorCandidates(call)]),
  };
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

export interface CaughtFailureSite {
  readonly arm: CaughtFailureArm;
  /** The node a finding is reported ON — the catch clause, or the whole absorber call. */
  readonly node: Node;
  /** The exact-slice waiver position, or undefined when the runtime must derive one. */
  readonly anchor: CaughtFailureAnchor | undefined;
}

/** The catch arm's anchor: the caught BINDING's name, or the `catch` keyword when the clause is bindingless
 *  (always offset 0 of the clause, so it can never fail to anchor). */
export function catchAnchor(clause: CatchClause): CaughtFailureAnchor | undefined {
  const binding = clause.getVariableDeclaration()?.getNameNode();
  return (binding === undefined ? undefined : anchorWithin(clause, binding)) ?? { token: "catch", offset: 0 };
}

/** One CATCH-shaped site. `default` wins over `empty`: a catch that returns a fallback is a behaviour CHANGE
 *  nobody was told about, which is the sharper finding. A try block whose single statement is a governed
 *  TanStack/tracing owner is not a site at all — the same way a framework-owned promise absorber is not one. */
export function catchClauseSite(clause: CatchClause): CaughtFailureSite | undefined {
  if (silentDefault(clause)) {
    return { arm: "default", node: clause, anchor: catchAnchor(clause) };
  }
  if (!unownedCatch(clause)) {
    return;
  }
  const tryBlock = clause.getParentIfKind(SyntaxKind.TryStatement)?.getTryBlock();
  if (tryBlock !== undefined && hasFrameworkOwner(tryBlock)) {
    return;
  }
  return { arm: "empty", node: clause, anchor: catchAnchor(clause) };
}

/** Every caught-failure site in ONE file, in source order — the file-level door the durable census
 *  (`ops/gen/caught-failure-population.ts`) walks. The POLICY does not call this: its dispatcher delivers
 *  `CatchClause` and `CallExpression` nodes to `catchClauseSite`/`promiseAbsorberSite` directly, so the two
 *  consumers share the per-site verdict without sharing a walk. */
export function caughtFailureReviewSites(sf: SourceFile): readonly CaughtFailureSite[] {
  const sites: CaughtFailureSite[] = [];
  for (const clause of sf.getDescendantsOfKind(SyntaxKind.CatchClause)) {
    const site = catchClauseSite(clause);
    if (site !== undefined) {
      sites.push(site);
    }
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const site = promiseAbsorberSite(call);
    if (site !== undefined) {
      sites.push(site);
    }
  }
  return sites.toSorted((left, right) => left.node.getStart() - right.node.getStart());
}
