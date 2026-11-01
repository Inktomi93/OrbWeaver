import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, AST_TOKEN_TYPES, TSESLint } from "@typescript-eslint/utils";

export function judge(definition: TSESLint.Scope.Definition, scope: TSESLint.Scope.Scope, comment: TSESTree.Comment, clause: TSESTree.Node): boolean {
  if (definition.type === TSESLint.Scope.DefinitionType.Variable || definition.type === TSESLint.Scope.DefinitionType.CatchClause) {
    return true;
  }
  if (scope.type === TSESLint.Scope.ScopeType.functionExpressionName || scope.type === TSESLint.Scope.ScopeType.module) {
    return comment.type === AST_TOKEN_TYPES.Line;
  }
  return clause.type === AST_NODE_TYPES.CatchClause;
}
