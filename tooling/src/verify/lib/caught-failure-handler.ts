// The catch-clause and promise-handler VERDICT predicates: is a catch clause unowned or a silent
// default-fallback recovery; does a promise handler (named, inline, or nested) discard, propagate, or
// return an owned failure. These compose the block-level `hasExplicitOwner` walk (caught-failure-scope.ts)
// with the value classifiers (caught-failure-outcome.ts) and the governed sinks (caught-failure-sinks.ts) into
// the per-site verdicts the front door reports.
import type { Block, CatchClause, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import { hasInterveningWrite, isFallback } from "./caught-failure-core.ts";
import { isFailureOutcome, isNativePromiseReject } from "./caught-failure-outcome.ts";
import { rawFailureDeclarations } from "./caught-failure-read.ts";
import { rejectionForwardedToReturnedDeferred } from "./caught-failure-retained.ts";
import { escapingDescendants, forwardsToOwner, hasExplicitOwner } from "./caught-failure-scope.ts";
import { isExplicitOwnerCall, isNativeReportError } from "./caught-failure-sinks.ts";

export function unownedCatch(clause: CatchClause, reads?: CaughtFailureReadServices): boolean {
  const block = clause.getBlock();
  const errorBinding = clause.getVariableDeclaration()?.getNameNode();
  if (hasExplicitOwner(block, errorBinding, undefined, reads)) {
    return false;
  }
  const finallyBlock = clause.getParentIfKind(SyntaxKind.TryStatement)?.getFinallyBlock();
  return finallyBlock === undefined || !hasExplicitOwner(finallyBlock, errorBinding, undefined, reads);
}

export function silentDefault(clause: CatchClause, reads?: CaughtFailureReadServices): boolean {
  const block = clause.getBlock();
  const errorBinding = clause.getVariableDeclaration()?.getNameNode();
  if (hasExplicitOwner(block, errorBinding, undefined, reads)) {
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

/** The declarations a named handler resolves to through import aliases. One imported from another module must be a
 *  function or a `const`: the write guard reads only the importing file, and TypeScript refuses a write to a function. */
function handlerDeclarations(identifier: Node, reads?: CaughtFailureReadServices): readonly Node[] {
  const declarations = rawFailureDeclarations(identifier, reads, true);
  const foreignLet = declarations.some(
    (declaration) =>
      declaration.getSourceFile() !== identifier.getSourceFile() &&
      declaration.isKind(SyntaxKind.VariableDeclaration) &&
      declaration.getVariableStatement()?.getDeclarationKind() !== "const",
  );
  return foreignLet ? [] : declarations;
}

function namedHandlerDiscards(identifier: Node, reads?: CaughtFailureReadServices): boolean {
  if (!identifier.isKind(SyntaxKind.Identifier)) {
    return true;
  }
  const declarations = handlerDeclarations(identifier, reads);
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  if (declaration === undefined || hasInterveningWrite(identifier, declaration, reads)) {
    return true;
  }
  if (declaration.isKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    return initializer === undefined || isDiscardingHandler(initializer, reads);
  }
  if (!declaration.isKind(SyntaxKind.FunctionDeclaration)) {
    return true;
  }
  const body = declaration.getBody();
  if (body?.isKind(SyntaxKind.Block) !== true) {
    return true;
  }
  return !hasExplicitOwner(body, declaration.getParameters()[0]?.getNameNode(), false, reads);
}

export function isDiscardingHandler(handler: Node, reads?: CaughtFailureReadServices): boolean {
  const fn = unwrapExpression(handler);
  if (isNativeReportError(fn, reads)) {
    return false;
  }
  if (fn.isKind(SyntaxKind.Identifier)) {
    return namedHandlerDiscards(fn, reads);
  }
  if (!(fn.isKind(SyntaxKind.ArrowFunction) || fn.isKind(SyntaxKind.FunctionExpression))) {
    return true;
  }
  const body = fn.getBody();
  if (!body.isKind(SyntaxKind.Block)) {
    const binding = fn.getParameters()[0]?.getNameNode();
    return !(body.isKind(SyntaxKind.CallExpression) && (isExplicitOwnerCall(body, binding, reads) || forwardsToOwner(body, binding, reads)));
  }
  const errorBinding = fn.getParameters()[0]?.getNameNode();
  return !hasExplicitOwner(body, errorBinding, false, reads);
}

export function isIgnoredPromiseHandler(handler: Node): boolean {
  const value = unwrapExpression(handler);
  return (
    ["undefined", "void 0", "null", "false", "true"].includes(value.getText()) ||
    value.isKind(SyntaxKind.NumericLiteral) ||
    value.isKind(SyntaxKind.StringLiteral) ||
    value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  );
}

export function handlerReturnsOwnedFailure(handler: Node, reads?: CaughtFailureReadServices): boolean {
  const fn = unwrapExpression(handler);
  if (fn.isKind(SyntaxKind.Identifier)) {
    const declaration = handlerDeclarations(fn, reads)[0];
    if (declaration !== undefined && hasInterveningWrite(fn, declaration, reads)) {
      return false;
    }
    if (declaration?.isKind(SyntaxKind.FunctionDeclaration) === true) {
      const body = declaration.getBody();
      return body?.isKind(SyntaxKind.Block) === true && hasExplicitOwner(body, declaration.getParameters()[0]?.getNameNode(), true, reads);
    }
    const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
    return initializer !== undefined && handlerReturnsOwnedFailure(initializer, reads);
  }
  if (!(fn.isKind(SyntaxKind.ArrowFunction) || fn.isKind(SyntaxKind.FunctionExpression))) {
    return false;
  }
  const body = fn.getBody();
  const errorBinding = fn.getParameters()[0]?.getNameNode();
  return body.isKind(SyntaxKind.Block) ? hasExplicitOwner(body, errorBinding, true, reads) : isFailureOutcome(body, errorBinding, reads);
}

export function handlerPropagatesRejection(handler: Node, reads?: CaughtFailureReadServices): boolean {
  const fn = unwrapExpression(handler);
  if (fn.isKind(SyntaxKind.Identifier)) {
    const declaration = handlerDeclarations(fn, reads)[0];
    if (declaration !== undefined && hasInterveningWrite(fn, declaration, reads)) {
      return false;
    }
    if (declaration?.isKind(SyntaxKind.FunctionDeclaration) === true) {
      const body = declaration.getBody();
      return body?.isKind(SyntaxKind.Block) === true && blockUnconditionallyRejects(body, declaration.getParameters()[0]?.getNameNode(), reads);
    }
    const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getInitializer() : undefined;
    return initializer !== undefined && handlerPropagatesRejection(initializer, reads);
  }
  if (rejectionForwardedToReturnedDeferred(fn, reads)) {
    return true;
  }
  if (!(fn.isKind(SyntaxKind.ArrowFunction) || fn.isKind(SyntaxKind.FunctionExpression))) {
    return false;
  }
  const errorBinding = fn.getParameters()[0]?.getNameNode();
  const body = fn.getBody();
  if (body.isKind(SyntaxKind.CallExpression)) {
    return isNativePromiseReject(body, errorBinding, reads);
  }
  if (!body.isKind(SyntaxKind.Block)) {
    return false;
  }
  return blockUnconditionallyRejects(body, errorBinding, reads);
}

function blockUnconditionallyRejects(body: Block, errorBinding: Node | undefined, reads?: CaughtFailureReadServices): boolean {
  const statements = body.getStatements();
  const only = statements.length === 1 ? statements[0] : undefined;
  if (only?.isKind(SyntaxKind.ReturnStatement) !== true) {
    return false;
  }
  const expression = only.getExpression();
  return expression?.isKind(SyntaxKind.CallExpression) === true && isNativePromiseReject(expression, errorBinding, reads);
}
