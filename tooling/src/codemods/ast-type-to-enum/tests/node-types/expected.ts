import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

export function describe(node: TSESTree.Node, other?: TSESTree.Node): string {
  if (node.type === AST_NODE_TYPES.Identifier && other?.type !== AST_NODE_TYPES.Literal) {
    return "name";
  }
  if (AST_NODE_TYPES.CallExpression === node.type) {
    return "call";
  }
  switch (node.type) {
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.ChainExpression:
      return "member";
    default:
      return "other";
  }
}

export const isThis = ({ type }: TSESTree.Node): boolean => type === AST_NODE_TYPES.ThisExpression;
