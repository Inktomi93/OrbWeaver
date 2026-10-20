// The failure-VALUE vocabulary: is a returned/assigned value itself failure-shaped (`isFailureOutcome` and
// its mutually-recursive family — a returned governed-factory call, an object-literal outcome, a
// never-returning call). A pure value/call classifier with no statement-block walk; the governed sinks that
// consume such a value live in caught-failure-sinks.ts.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { memberLiteralValues } from "../../floor/code-facts/member-type-reads.ts";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import {
  ambientIdentifier,
  declarationsOf,
  directlyCarriesBinding,
  hasInterveningWrite,
  importedName,
  literalMember,
  referencesBinding,
  resolvedFunction,
} from "./caught-failure-core.ts";
import { FAILURE_OUTCOME_DISCRIMINANTS, FAILURE_OUTCOME_OK_MEMBER, failureNever, rawFailureDeclarations } from "./caught-failure-read.ts";

// ── the error-as-data outcome vocabulary ────────────────────────────────────────────────────────────────
// A returned VALUE owns a caught failure only when it is failure-VALUED. These are the two-sided halves: an
// explicit success discriminator REFUSES ownership outright (so `{ status: 'ok', error: err }` cannot launder
// it), a failure key owns only when its value carries the failure.
const SUCCESS_DISCRIMINATOR_RE = /^(?:ok\s*:\s*true\b|failed\s*:\s*false\b|(?:kind|status)\s*:\s*["'`](?:ok|ready|success)["'`])/iu;
const FAILED_TRUE_RE = /^failed\s*:\s*true\b/iu;
const OK_FALSE_RE = /^ok\s*:\s*false\b/iu;
const FAILURE_KEY_ASSIGNMENT_RE = /^(?:error|errors|failed|failure|navError|reason|thrown)\s*:/iu;
const FAILURE_KEY_SHORTHAND_RE = /^(?:error|errors|failed|failure|navError|reason|thrown)$/iu;
const FAILURE_DISCRIMINATOR_RE =
  /^(?:kind|status|step|verdict)\s*:\s*["'`](?:denied|error|failed|failure|invalid|rejected|refused|threw|unparseable|unproven|unreachable)/iu;
const FAILURE_WORD_RE = /error|fail|invalid|malformed|refus|unavailable|unreachable/iu;
const FAILURE_COPY_RE = /could(?:n['’]t| not)|error|fail|invalid|malformed|refus|unavailable|unreachable|not[- ]?found|not readable/iu;

/** A one-expression helper (`messageOf(err)`) whose returned value preserves its first parameter preserves the
 *  binding it is passed. One hop: the helper's own body is read with `helpers` off, on every branch, so a
 *  self-recursive helper ends there instead of recursing. */
function preservingHelperCall(call: CallExpression, reads?: CaughtFailureReadServices): boolean {
  const callee = unwrapExpression(call.getExpression());
  const declarations = callee.isKind(SyntaxKind.Identifier) ? declarationsOf(callee, reads) : [];
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  if (
    declaration === undefined ||
    hasInterveningWrite(callee, declaration, reads) ||
    (declaration.isKind(SyntaxKind.VariableDeclaration) && declaration.getVariableStatement()?.getDeclarationKind() !== "const")
  ) {
    return false;
  }
  const fn = resolvedFunction(declaration);
  // An async or generator helper returns a promise or an iterator, never the preserved value itself.
  if (
    !(fn?.isKind(SyntaxKind.FunctionDeclaration) === true || fn?.isKind(SyntaxKind.ArrowFunction) === true) ||
    fn.isAsync() ||
    fn.asKind(SyntaxKind.FunctionDeclaration)?.isGenerator() === true
  ) {
    return false;
  }
  const parameter = fn.getParameters()[0]?.getNameNode();
  const body = fn.getBody();
  const only = body?.isKind(SyntaxKind.Block) === true && body.getStatements().length === 1 ? body.getStatements()[0] : undefined;
  const returned = body?.isKind(SyntaxKind.Block) === false ? body : only?.asKind(SyntaxKind.ReturnStatement)?.getExpression();
  return parameter?.isKind(SyntaxKind.Identifier) === true && returned !== undefined && preservesFailureValue(returned, parameter, reads, false);
}

function preservesFailureValue(node: Node, errorBinding: Node, reads?: CaughtFailureReadServices, helpers = true): boolean {
  const value = unwrapExpression(node);
  if (directlyCarriesBinding(value, errorBinding, reads)) {
    return true;
  }
  if (value.isKind(SyntaxKind.TemplateExpression)) {
    return referencesBinding(value, errorBinding, reads);
  }
  if (value.isKind(SyntaxKind.ConditionalExpression)) {
    return (
      preservesFailureValue(value.getWhenTrue(), errorBinding, reads, helpers) && preservesFailureValue(value.getWhenFalse(), errorBinding, reads, helpers)
    );
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
    importedName(callee, new Set(["@orb/kit/error-message", "#primitives/error-message"]), reads) === "errorMessage" ||
    (helpers && preservingHelperCall(value, reads))
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
    governedFailureFactoryCall(value, errorBinding, reads)
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
 *  fallthrough is a recovered success path, so the caller still absorbs. A body that is failure-valued only
 *  through its first parameter (`(v) => ({ error: v })`) owns only when the call passes the caught binding. */
function factoryReturnsFailure(declaration: Node, callee: Node, passesBinding: boolean, reads?: CaughtFailureReadServices): boolean {
  if (callee.isKind(SyntaxKind.Identifier) && hasInterveningWrite(callee, declaration, reads)) {
    return false;
  }
  const fn = resolvedFunction(declaration);
  if (fn === undefined || !(fn.isKind(SyntaxKind.FunctionDeclaration) || fn.isKind(SyntaxKind.ArrowFunction))) {
    return false;
  }
  const parameter = passesBinding ? fn.getParameters()[0]?.getNameNode() : undefined;
  const body = fn.getBody();
  const only = body?.isKind(SyntaxKind.Block) === true && body.getStatements().length === 1 ? body.getStatements()[0] : undefined;
  const expression = body?.isKind(SyntaxKind.Block) === false ? body : only?.asKind(SyntaxKind.ReturnStatement)?.getExpression();
  return (
    expression !== undefined && (isFailureOutcome(expression, undefined, reads) || (parameter !== undefined && isFailureOutcome(expression, parameter, reads)))
  );
}

function governedFailureFactoryCall(call: CallExpression, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const callee = unwrapExpression(call.getExpression());
  const first = call.getArguments()[0];
  const passesBinding = errorBinding !== undefined && first !== undefined && referencesBinding(first, errorBinding, reads);
  return declarationsOf(call.getExpression(), reads).some((declaration) => factoryReturnsFailure(declaration, callee, passesBinding, reads));
}

function typeIsFailureOutcome(node: Node, reads?: CaughtFailureReadServices): boolean {
  const type = reads === undefined ? node.getType() : undefined;
  const propertyValues = (name: string): readonly unknown[] => {
    if (reads !== undefined) {
      // A member with no literal value (a `number` status, an optional key's `undefined`) must fail `every`.
      return memberLiteralValues(reads.types, node, name);
    }
    if (type === undefined) {
      throw new Error("native caught-failure property Type is absent");
    }
    const symbol = type.getProperty(name);
    if (symbol === undefined) {
      return [];
    }
    const propertyType = symbol.getTypeAtLocation(node);
    return (propertyType.isUnion() ? propertyType.getUnionTypes() : [propertyType]).map((part) => part.getLiteralValue());
  };
  const ok = propertyValues(FAILURE_OUTCOME_OK_MEMBER);
  if (ok.length > 0 && ok.every((value) => value === false)) {
    return true;
  }
  const failureKinds = new Set(["error", "failed", "failure", "invalid", "rejected", "refused", "unparseable", "unproven", "unreachable", "threw", "denied"]);
  for (const name of FAILURE_OUTCOME_DISCRIMINANTS) {
    const values = propertyValues(name);
    if (values.length > 0 && values.every((value) => typeof value === "string" && failureKinds.has(value))) {
      return true;
    }
  }
  return false;
}
