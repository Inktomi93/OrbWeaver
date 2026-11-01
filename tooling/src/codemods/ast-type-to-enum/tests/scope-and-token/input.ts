import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

export function judge(definition: TSESLint.Scope.Definition, scope: TSESLint.Scope.Scope, comment: TSESTree.Comment, clause: TSESTree.Node): boolean {
  if (definition.type === "Variable" || definition.type === "CatchClause") {
    return true;
  }
  if (scope.type === "function-expression-name" || scope.type === "module") {
    return comment.type === "Line";
  }
  return clause.type === "CatchClause";
}
