import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type ts from "typescript";
import type { Restatement } from "../unwired/index.ts";
import { memberLabel, passesDbHandle, RELATION, restatementsAt, runtimeTypes } from "../unwired/index.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

function messageFor(found: Restatement): string {
  const restating = memberLabel(found.restating);
  const owner = memberLabel(found.owner);
  if (found.foreign === null && found.relation === RELATION.params) {
    return `${restating} hand-copies the parameters of ${owner}: derive them (\`Parameters<Owner["member"]>\`) and narrow only the return.`;
  }
  if (found.foreign === null) {
    return `${restating} hand-restates ${owner}: derive it from the owner (\`Owner["member"]\`, or \`Pick<Owner, …>\` for a whole port) so the reference stays linked.`;
  }
  if (passesDbHandle(found.foreign)) {
    return `${restating} passes a db handle (${found.foreign.db.join(", ")}) across domains from ${owner}: a ledger-ruled joint batch assembles at the composition root; an unruled one is a defect to redesign.`;
  }
  if (runtimeTypes(found.foreign).length > 0) {
    return `${restating} restates ${owner} across domains with domain data (${found.foreign.server.join(", ")}): move that data to packages/contracts; the runtime types stay with their owners and the signature stays in this domain's contract.`;
  }
  return `${restating} restates ${owner} across domains, and no domain imports another: move the shape to packages/contracts and derive both members from it.`;
}

/** Refuses a port member whose hand-written function type is identical to the member flowing into it.
 *  The restating member is the higher-tier one. A cross-domain pair has no legal derive: its data moves to contracts,
 *  and a signature left naming only contracts data and runtime types is the consumer's own contract. */
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
        if (found.relation === RELATION.narrowed) {
          continue;
        }
        context.report({ node, message: messageFor(found) });
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
