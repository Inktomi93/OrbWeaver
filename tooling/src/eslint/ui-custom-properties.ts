// A custom property a string reads (`var(--x, 1)`, Tailwind's `(--x)`), a CSS text string writes (`{ --x: 1 }`), or a style
// call names (`setProperty("--x")`) must be one the sheets, a runtime writer or a vendor declares; else the read is always
// its fallback and the write sets nothing.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// `var(--x`, a Tailwind `(--x)` arbitrary value, and a declaration inside CSS text (`{ --x:` or `; --x:`).
const NAMED_PROPERTY = /\((--[a-z][a-z0-9-]*)(?=[,)])|[{;]\s*(--[a-z][a-z0-9-]*)\s*:/gu;
const STYLE_CALLS = new Set(["setProperty", "getPropertyValue", "removeProperty"]);

/** Build the rule over the declared-name set (`declaredCustomProperties`), the one home Stylelint reads too. */
export function customPropertyDeclaredRule(declared: ReadonlySet<string>): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const check = (node: TSESTree.Node, name: string): void => {
        if (!declared.has(name)) {
          context.report({
            node,
            message: `"${name}" is not declared by any sheet, runtime writer or vendor, so a read is always its fallback; declare it, list its writer in RUNTIME_CUSTOM_PROPERTIES, or fix the name.`,
          });
        }
      };
      const scan = (node: TSESTree.Node, text: string): void => {
        for (const match of text.matchAll(NAMED_PROPERTY)) {
          check(node, match[1] ?? match[2] ?? "");
        }
      };
      return {
        "Literal[value=/--/]": (node: TSESTree.Literal): void => {
          if (typeof node.value === "string") {
            scan(node, node.value);
          }
        },
        "TemplateElement[value.raw=/--/]": (node: TSESTree.TemplateElement): void => {
          scan(node, node.value.cooked ?? node.value.raw);
        },
        "CallExpression[callee.type='MemberExpression'][callee.computed=false]": (node: TSESTree.CallExpression): void => {
          const [first] = node.arguments;
          const callee = node.callee as TSESTree.MemberExpression;
          const calls = callee.property.type === "Identifier" && STYLE_CALLS.has(callee.property.name);
          if (calls && first?.type === "Literal" && typeof first.value === "string" && first.value.startsWith("--")) {
            check(first, first.value);
          }
        },
      };
    },
  };
}
