// An appearance channel name spelled in a string (`--appearance-*`, `data-appearance-*`, an `appearance-*:` class
// variant) must be one the client manifest's channel writes, so a typo or a renamed key cannot read a value nothing sets.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const APPEARANCE_NAME = /--appearance-[a-z0-9-]+|data-appearance-[a-z0-9-]+|(?<![\w-])appearance-[a-z0-9-]+(?=:)/gu;

/** Build the rule over the generated channel's vocabulary, read from the manifest, never a hand list. */
export function appearanceNameRule(known: ReadonlySet<string>): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const check = (node: TSESTree.Node, text: string): void => {
        for (const match of text.matchAll(APPEARANCE_NAME)) {
          if (!known.has(match[0])) {
            context.report({
              node,
              message: `"${match[0]}" is not an appearance channel name; the manifest (appearance-carrier-manifest.ts) declares every one.`,
            });
          }
        }
      };
      return {
        "Literal[value=/appearance-/]": (node: TSESTree.Literal): void => {
          if (typeof node.value === "string") {
            check(node, node.value);
          }
        },
        "TemplateLiteral > TemplateElement": (node: TSESTree.TemplateElement): void => {
          check(node, node.value.cooked ?? node.value.raw);
        },
      };
    },
  };
}
