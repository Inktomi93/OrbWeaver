import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type ts from "typescript";
import { memberLabel, RELATION, restatementsAt } from "../unwired/index.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

/** Refuses a port member whose hand-written function type is identical to the member flowing into it.
 *  The restating member is the higher-tier one; a cross-domain pair has no legal derive and moves to contracts. */
export const derivedPortMemberRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const services = context.sourceCode.parserServices;
    const toTsMap = services?.esTreeNodeToTSNodeMap;
    const program = services?.program ?? null;
    if (program === null || toTsMap === undefined) {
      return {};
    }
    const checker = program.getTypeChecker();
    const judge = (node: TSESTree.Node): void => {
      for (const found of restatementsAt(checker, toTsMap.get(node) as ts.Node)) {
        if (found.relation !== RELATION.identical) {
          continue;
        }
        const restating = memberLabel(found.restating);
        const owner = memberLabel(found.owner);
        context.report({
          node,
          message: found.crossDomain
            ? `${restating} restates ${owner} across domains, and no domain imports another: move the shape to packages/contracts and derive both members from it.`
            : `${restating} hand-restates ${owner}: derive it from the owner (\`Owner["member"]\`, or \`Pick<Owner, …>\` for a whole port) so the reference stays linked.`,
        });
      }
    };
    return {
      Property: judge,
      VariableDeclarator: judge,
      ReturnStatement: judge,
      CallExpression: judge,
      NewExpression: judge,
    };
  },
};
