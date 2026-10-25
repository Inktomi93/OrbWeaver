import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { staticTextValue, unwrapTsValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { calledMember, effectiveArguments } from "./ui-dom.ts";

// The attributes and classes a sealed library stamps on its own DOM: cmdk's `cmdk-*` attributes, Base UI's
// `data-base-ui-*` hooks and `base-ui-*` ids, Radix's `data-radix-*`, CodeMirror's `.cm-*` classes. A selector that
// names one reaches past the @orb/ui seal and breaks on a library upgrade.
const SEALED_INTERNAL = /(?:^|[\s.[,>+~=:("'])(?:cmdk-[a-z]|data-base-ui-|base-ui-[a-z]|data-radix-)|\.cm-[a-z]/u;

const SEALED_INTERNAL_MESSAGE =
  "A string names a sealed library's internal attribute or class (cmdk-*, data-base-ui-*, .cm-*). Expose what you need from the @orb/ui seal (a prop, a ref, a part) instead of reaching into its DOM.";

const CLASS_LOOKUP = "getElementsByClassName";
const SELECTOR_LOOKUPS = new Set(["querySelector", "querySelectorAll", "closest", "matches"]);

function argumentText(context: OrbRuleContext, node: TSESTree.Node): string | undefined {
  const value = staticTextValue(context, node);
  if (typeof value === "string") {
    return value;
  }
  const expression = unwrapTsValue(node);
  return expression.type === "TemplateLiteral" ? expression.quasis.map((quasi) => quasi.value.cooked ?? "").join("\u0000") : undefined;
}

/** Judges selector-shaped strings and DOM selector arguments; prose may name a vendor without addressing its DOM. */
export const noSealedInternalsRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const addressed = new WeakSet<TSESTree.Node>();
    const judge = (node: TSESTree.Node, text: string | null | undefined, method?: string): void => {
      if (text === null || text === undefined) {
        return;
      }
      const selector = SELECTOR_LOOKUPS.has(method ?? "") || /^(?:[.#[:]|[a-z][\w-]*[.#[:])/u.test(text.trim());
      if ((selector && SEALED_INTERNAL.test(text)) || (method === CLASS_LOOKUP && /(?:^|\s)cm-[a-z]/u.test(text))) {
        context.report({ node, message: SEALED_INTERNAL_MESSAGE });
      }
    };
    const judgeLiteral = (node: TSESTree.Node, text: string | null | undefined): void => {
      if (text === null || text === undefined) {
        return;
      }
      for (let current: TSESTree.Node | null | undefined = node; current; current = current.parent) {
        if (addressed.has(current)) {
          return;
        }
      }
      judge(node, text);
    };
    return {
      CallExpression: (node: TSESTree.CallExpression): void => {
        const method = calledMember(context, node.callee)?.name;
        if (method !== CLASS_LOOKUP && !SELECTOR_LOOKUPS.has(method ?? "")) {
          return;
        }
        const argument = effectiveArguments(context, node)[0];
        if (argument === undefined || argument === null) {
          return;
        }
        const text = argumentText(context, argument);
        if (text === undefined) {
          return;
        }
        addressed.add(argument);
        judge(argument, text, method);
      },
      Literal: (node: TSESTree.Literal): void => judgeLiteral(node, typeof node.value === "string" ? node.value : undefined),
      TemplateElement: (node: TSESTree.TemplateElement): void => judgeLiteral(node, node.value.cooked),
    };
  },
};
