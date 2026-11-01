import type { TSESTree } from "@typescript-eslint/utils";

export const sameKind = (a: TSESTree.Node, b: TSESTree.Node): boolean => a.type === b.type;
export const lower = (event: { readonly type: string }): boolean => event.type === "click";
export const notType = (kind: string): boolean => kind === "Identifier";
export const loose = (node: TSESTree.Node): boolean => node.type == "Identifier";
