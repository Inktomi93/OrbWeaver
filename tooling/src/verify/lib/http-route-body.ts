// Shared route-handler / request-body origin reader for the `public-route-body-cap` family
// (`public-route-body-cap` the ordinary occurrence policy, `public-route-body-cap-health` the hard
// whole-population census tripwire). Every predicate here is a pure AST/same-file-symbol read — no
// `getDescendantsOfKind`/`getDescendantsOfKind`-shaped subtree walk, so both policies stay within the
// visitors-plus-ancestor-checks discipline (guide §12.3): a "does X occur anywhere inside this handler"
// question is answered by visiting X's OWN kind everywhere in the file and walking ANCESTORS from each hit
// back up to the enclosing route-registration call, never by descending into a handler's subtree.
import type { CallExpression, Node } from "ts-morph";
import { Node as TsNode, VariableDeclarationKind } from "ts-morph";

export const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);
const BODY_READ_METHODS = new Set(["json", "parseBody", "formData", "arrayBuffer", "blob", "text"]);
export const CAP_MIDDLEWARE = new Set(["bodyLimit", "bodyCap"]);
export const CAP_NAME_RE = /(?:^|_)MAX(?:_[A-Z0-9]+)*_BYTES$/u;
const MAX_RESOLUTION_DEPTH = 8;

/** A top-level mutating route registration (`app.post(...)` etc.) — its own method name, or undefined. */
export function routeMethod(node: Node): string | undefined {
  const callee = TsNode.isCallExpression(node) ? node.getExpression() : undefined;
  const name = callee !== undefined && TsNode.isPropertyAccessExpression(callee) ? callee.getName() : undefined;
  return name !== undefined && MUTATING_METHODS.has(name) ? name : undefined;
}

function isHonoRequest(node: Node): boolean {
  return TsNode.isPropertyAccessExpression(node) && node.getName() === "req";
}

function isRawRequest(node: Node): boolean {
  return TsNode.isPropertyAccessExpression(node) && node.getName() === "raw" && isHonoRequest(node.getExpression());
}

/** `c.req.raw.body`, or an identifier bound (same file, `const`, one hop at a time) to that exact shape. */
export function isRawRequestBody(node: Node, depth = 0): boolean {
  if (TsNode.isPropertyAccessExpression(node) && node.getName() === "body" && isRawRequest(node.getExpression())) {
    return true;
  }
  if (!TsNode.isIdentifier(node) || depth >= MAX_RESOLUTION_DEPTH) {
    return false;
  }
  return (node.getSymbol()?.getDeclarations() ?? []).some((declaration) => isRawRequestBodyBinding(node, declaration, depth));
}

function isRawRequestBodyBinding(node: Node, declaration: Node, depth: number): boolean {
  if (
    declaration.getSourceFile() !== node.getSourceFile() ||
    !TsNode.isVariableDeclaration(declaration) ||
    declaration.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const
  ) {
    return false;
  }
  const initializer = declaration.getInitializer();
  return initializer !== undefined && isRawRequestBody(initializer, depth + 1);
}

/** A `.json()/.parseBody()/.formData()/.arrayBuffer()/.blob()/.text()` call on the Hono request (or its
 *  `.raw`) — the CALL-shaped half of "reads the request body". */
export function isBodyReadCall(node: Node): boolean {
  if (!TsNode.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  if (!(TsNode.isPropertyAccessExpression(callee) && BODY_READ_METHODS.has(callee.getName()))) {
    return false;
  }
  const receiver = callee.getExpression();
  return isHonoRequest(receiver) || isRawRequest(receiver);
}

/** A DIRECT `c.req.raw.body` property access (not through an alias) — the non-call half, the bundle-import
 *  incremental-stream shape. */
export function isRawBodyPropertyAccess(node: Node): boolean {
  return TsNode.isPropertyAccessExpression(node) && node.getName() === "body" && isRawRequest(node.getExpression());
}

export function resolvesCapMiddleware(node: Node): boolean {
  if (TsNode.isCallExpression(node)) {
    const callee = node.getExpression();
    return TsNode.isIdentifier(callee) && CAP_MIDDLEWARE.has(callee.getText());
  }
  if (!TsNode.isIdentifier(node)) {
    return false;
  }
  return (node.getSymbol()?.getDeclarations() ?? []).some((declaration) => resolvesCapMiddlewareBinding(node, declaration));
}

function resolvesCapMiddlewareBinding(node: Node, declaration: Node): boolean {
  if (
    declaration.getSourceFile() !== node.getSourceFile() ||
    !TsNode.isVariableDeclaration(declaration) ||
    declaration.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const
  ) {
    return false;
  }
  const initializer = declaration.getInitializer();
  return initializer !== undefined && resolvesCapMiddleware(initializer);
}

/** `stageCapped(stream, path, CAP)` where `stream` resolves to the raw request body and `CAP` is an
 *  authored `*_MAX_*_BYTES` name — the incremental non-buffering cap arm. */
export function isCappedStreamCall(node: Node): boolean {
  if (!TsNode.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  if (!(TsNode.isIdentifier(callee) && callee.getText() === "stageCapped")) {
    return false;
  }
  const args = node.getArguments();
  const stream = args[0];
  const cap = args[2];
  return stream !== undefined && isRawRequestBody(stream) && cap !== undefined && CAP_NAME_RE.test(cap.getText());
}

export interface EnclosingRouteArg {
  readonly route: CallExpression;
  readonly argIndex: number;
}

/** Climb from ANY node to the nearest enclosing mutating-route CallExpression whose direct argument list
 *  contains an ancestor of this node, and report which argument index that is — the ancestor-walk
 *  replacement for "does X occur anywhere inside handler argument N". */
export function findEnclosingRouteArg(node: Node): EnclosingRouteArg | undefined {
  let current: Node = node;
  for (;;) {
    const parent = current.getParent();
    if (parent === undefined) {
      // biome-ignore lint/complexity/noUselessUndefined: tsconfig.base.json enables noImplicitReturns.
      return undefined;
    }
    if (TsNode.isCallExpression(parent) && routeMethod(parent) !== undefined) {
      const argIndex = parent.getArguments().indexOf(current);
      if (argIndex !== -1) {
        return { route: parent, argIndex };
      }
    }
    current = parent;
  }
}
