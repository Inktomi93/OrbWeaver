// D336: TypeScript strings spell no colour recipe over an intent or tone colour; the tone roles and `orb.pigments` own them.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { intentColorRecipe } from "./css/intent-color-recipe.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// An interpolation reads as a space, so a recipe split around one still reads as one string and names no colour of its own.
const HOLE = " ";

function message(recipe: string): string {
  return `\`${recipe}\` mixes an intent or tone colour by hand (D336); paint a *-tone-* role under the element's tone, or add a pigment in tokens.json.`;
}

/** The rule over the intent colour names (the D336 tones that carry a base `--color-*` token). */
export function intentColorRecipeRule(intents: readonly string[]): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const check = (node: TSESTree.Node, text: string): void => {
        const recipe = intentColorRecipe(text, intents);
        if (recipe !== undefined) {
          context.report({ node, message: message(recipe) });
        }
      };
      return {
        "Literal:exit"(node: TSESTree.Literal): void {
          if (typeof node.value === "string") {
            check(node, node.value);
          }
        },
        "TemplateLiteral:exit"(node: TSESTree.TemplateLiteral): void {
          check(node, node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(HOLE));
        },
        "JSXText:exit"(node: TSESTree.JSXText): void {
          check(node, node.value);
        },
      };
    },
  };
}
