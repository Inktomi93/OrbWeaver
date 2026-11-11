// A registered site is a function named in a file: the Principal mint sites and the narrowed JSON mint are judged by
// the enclosing function's name, so a second function in the same file gets no exemption.

import { relative } from "node:path";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { OrbRuleContext } from "./syntax.ts";

/** A function in one file, named by its declaration, its variable or its object or class key. */
export interface FunctionSite {
  readonly path: string;
  readonly name: string;
}

type FunctionNode = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

export const isFunctionNode = (node: TSESTree.Node): node is FunctionNode =>
  node.type === AST_NODE_TYPES.FunctionDeclaration || node.type === AST_NODE_TYPES.FunctionExpression || node.type === AST_NODE_TYPES.ArrowFunctionExpression;

function functionName(fn: FunctionNode): string | null {
  if (fn.type !== AST_NODE_TYPES.ArrowFunctionExpression && fn.id?.type === AST_NODE_TYPES.Identifier) {
    return fn.id.name;
  }
  const { parent } = fn;
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return parent.id.type === AST_NODE_TYPES.Identifier ? parent.id.name : null;
  }
  const keyed = parent.type === AST_NODE_TYPES.Property || parent.type === AST_NODE_TYPES.MethodDefinition || parent.type === AST_NODE_TYPES.PropertyDefinition;
  return keyed && parent.key.type === AST_NODE_TYPES.Identifier ? parent.key.name : null;
}

/** True when `node` is, or sits inside, one of `sites`: the innermost enclosing function decides. */
export function inFunctionSite(context: OrbRuleContext, node: TSESTree.Node, sites: readonly FunctionSite[]): boolean {
  const path = relative(context.cwd, context.filename).replaceAll("\\", "/");
  const fn = isFunctionNode(node) ? node : context.sourceCode.getAncestors(node).findLast(isFunctionNode);
  const name = fn === undefined ? null : functionName(fn);
  return sites.some((site) => site.path === path && site.name === name);
}
