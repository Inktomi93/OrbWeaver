// The catch-clause and promise-handler VERDICT predicates: is a catch clause unowned or a silent
// default-fallback recovery; does a promise handler (named, inline, or nested) discard, propagate, or
// return an owned failure. These compose the block-level `hasExplicitOwner` walk (caught-failure-scope.ts)
// with the value classifiers (caught-failure-outcome.ts) into the per-site verdicts the front door reports.
import type { Block, CatchClause, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { unwrapExpression } from "./ast-read.ts";
import { hasInterveningWrite, isFallback } from "./caught-failure-core.ts";
import { isExplicitOwnerCall, isFailureOutcome, isNativePromiseReject } from "./caught-failure-outcome.ts";
import { escapingDescendants, hasExplicitOwner } from "./caught-failure-scope.ts";

export function unownedCatch(clause: CatchClause): boolean {
  const block = clause.getBlock();
  const errorBinding = clause.getVariableDeclaration()?.getNameNode();
  if (hasExplicitOwner(block, errorBinding)) {
    return false;
  }
  const finallyBlock = clause.getParentIfKind(SyntaxKind.TryStatement)?.getFinallyBlock();
  return finallyBlock === undefined || !hasExplicitOwner(finallyBlock, errorBinding);
}

export function silentDefault(clause: CatchClause): boolean {
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

export function isDiscardingHandler(handler: Node): boolean {
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

export function isIgnoredPromiseHandler(handler: Node): boolean {
  const value = unwrapExpression(handler);
  return (
    ["undefined", "void 0", "null", "false", "true"].includes(value.getText()) ||
    value.isKind(SyntaxKind.NumericLiteral) ||
    value.isKind(SyntaxKind.StringLiteral) ||
    value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  );
}

export function handlerReturnsOwnedFailure(handler: Node): boolean {
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

export function handlerPropagatesRejection(handler: Node): boolean {
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
