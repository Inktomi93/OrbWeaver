import { relative } from "node:path";
import type { RuleVisitor } from "@eslint/core";
import { AST_TOKEN_TYPES } from "@typescript-eslint/utils";
import { checkerCites, enforcementClaims, foldLineComments, isCheckerSource } from "./cites.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { posixPath } from "./syntax.ts";

/** Refuses a comment sentence that claims a checker enforces a fact without naming the checker, so a reader opens the
 *  checker instead of trusting the sentence. `tests/tooling/doc/comment-path-citations.repo.int.test.ts` resolves the
 *  name a claim carries. */
export const enforcementClaimRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const inChecker = isCheckerSource(posixPath(relative(context.cwd, context.filename)));
    return {
      Program: () => {
        const spans = context.sourceCode.getAllComments().map((comment) => ({
          line: comment.loc.start.line,
          text: comment.type === AST_TOKEN_TYPES.Line ? `//${comment.value}` : `/*${comment.value}*/`,
        }));
        for (const span of foldLineComments(spans)) {
          for (const claim of enforcementClaims(span.text, inChecker)) {
            if (checkerCites(claim.sentence).length === 0) {
              context.report({
                loc: { line: span.line + claim.line, column: 0 },
                message: `This comment claims a checker enforces something without naming it: "${claim.sentence}". Name the test by its tracked path or the rule by its id, or state the rule without the claim (.claude/rules/comments.md).`,
              });
            }
          }
        }
      },
    };
  },
};
