// Request-body grammar shared by the occurrence policy and its population-health sibling.
// Alias identity comes from sealed native lexical declarations; only same-file const initializers qualify.
// Handler attribution climbs ancestors from each visited body read, never descends through handlers.
import type { CallExpression, Node } from "ts-morph";
import { Node as TsNode, VariableDeclarationKind } from "ts-morph";
import type { TypeProjectionPlan } from "../../floor/code-facts/type-projection-contract.ts";
import { typeProjectionFacet } from "../../floor/code-facts/type-projection-contract.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { nativeTypeProjection, prepareNativeTypeProjection } from "./native-value-projection.ts";

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);
const BODY_READ_METHODS = new Set(["json", "parseBody", "formData", "arrayBuffer", "blob", "text"]);
const CAP_MIDDLEWARE = new Set(["bodyLimit", "bodyCap"]);
const CAP_NAME_RE = /(?:^|_)MAX(?:_[A-Z0-9]+)*_BYTES$/u;
const LEXICAL_PLAN: TypeProjectionPlan = { facets: ["lexical"], properties: [] };

/** Close same-file alias questions during the ordinary visitor pass. */
export function prepareBodyCapOrigin(ctx: Pick<GatePolicyContext, "nativeTypes">, node: Node): void {
  if (TsNode.isIdentifier(node)) {
    prepareNativeTypeProjection(ctx, node, LEXICAL_PLAN);
  }
}

/** Read only the sealed native lexical set; binding grammar remains this reader's judgment. */
export function bodyCapDeclarations(ctx: Pick<GatePolicyContext, "nativeTypes">, node: Node): readonly Node[] {
  return typeProjectionFacet(nativeTypeProjection(ctx, node, LEXICAL_PLAN), "lexical").declarations ?? [];
}

function localDeclarations(node: Node): readonly Node[] {
  return node.getSymbol()?.getDeclarations() ?? [];
}

function sameFileConstInitializer(node: Node, declaration: Node): Node | undefined {
  return declaration.getSourceFile() === node.getSourceFile() &&
    TsNode.isVariableDeclaration(declaration) &&
    declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const
    ? declaration.getInitializer()
    : undefined;
}

function followsConstOrigin(node: Node, matches: (value: Node) => boolean, declarations: (value: Node) => readonly Node[]): boolean {
  const pending = [node];
  const visited = new Set<Node>();
  for (const value of pending) {
    if (visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (matches(value)) {
      return true;
    }
    if (!TsNode.isIdentifier(value)) {
      continue;
    }
    for (const declaration of declarations(value)) {
      const initializer = sameFileConstInitializer(value, declaration);
      if (initializer !== undefined) {
        pending.push(initializer);
      }
    }
  }
  return false;
}

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
function isRawRequestBody(node: Node, declarations: (value: Node) => readonly Node[]): boolean {
  return followsConstOrigin(node, isRawBodyPropertyAccess, declarations);
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

export function resolvesCapMiddleware(node: Node, declarations: (value: Node) => readonly Node[] = localDeclarations): boolean {
  return followsConstOrigin(
    node,
    (value) => {
      const callee = TsNode.isCallExpression(value) ? value.getExpression() : undefined;
      return callee !== undefined && TsNode.isIdentifier(callee) && CAP_MIDDLEWARE.has(callee.getText());
    },
    declarations,
  );
}

/** `stageCapped(stream, path, CAP)` where `stream` resolves to the raw request body and `CAP` is an
 *  authored `*_MAX_*_BYTES` name — the incremental non-buffering cap arm. */
export function isCappedStreamCall(node: Node, declarations: (value: Node) => readonly Node[] = localDeclarations): boolean {
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
  return stream !== undefined && isRawRequestBody(stream, declarations) && cap !== undefined && CAP_NAME_RE.test(cap.getText());
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
