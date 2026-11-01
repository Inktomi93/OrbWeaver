import type { TSESTree } from "@typescript-eslint/utils";

export function describe(node: TSESTree.Node, other?: TSESTree.Node): string {
  if (node.type === "Identifier" && other?.type !== "Literal") {
    return "name";
  }
  if ("CallExpression" === node.type) {
    return "call";
  }
  switch (node.type) {
    case "MemberExpression":
    case "ChainExpression":
      return "member";
    default:
      return "other";
  }
}

export const isThis = ({ type }: TSESTree.Node): boolean => type === "ThisExpression";
