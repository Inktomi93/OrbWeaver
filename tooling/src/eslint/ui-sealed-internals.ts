import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { accessedName, staticTextValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// The attributes and classes a sealed library stamps on its own DOM: cmdk's `cmdk-*` attributes, Base UI's
// `data-base-ui-*` hooks and `base-ui-*` ids, Radix's `data-radix-*`, CodeMirror's `.cm-*` classes. A selector that
// names one reaches past the @orb/ui seal and breaks on a library upgrade.
const SEALED_INTERNAL = /(?:^|[\s.[,>+~=:("'])(?:cmdk-[a-z]|data-base-ui-|base-ui-[a-z]|data-radix-)|\.cm-[a-z]/u;

const SEALED_INTERNAL_MESSAGE =
  "A string names a sealed library's internal attribute or class (cmdk-*, data-base-ui-*, .cm-*). Expose what you need from the @orb/ui seal (a prop, a ref, a part) instead of reaching into its DOM.";

/** Judges selector-shaped strings and DOM selector arguments; prose may name a vendor without addressing its DOM. */
export const noSealedInternalsRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const judge = (node: TSESTree.Node, text: string | null | undefined): void => {
      const call = node.parent;
      const classLookup =
        call?.type === "CallExpression" && call.callee.type === "MemberExpression" && accessedName(context, call.callee) === "getElementsByClassName";
      const selectorCall =
        call?.type === "CallExpression" &&
        call.callee.type === "MemberExpression" &&
        ["querySelector", "querySelectorAll", "closest", "matches"].includes(accessedName(context, call.callee) ?? "");
      const selector = text !== null && text !== undefined && (selectorCall || /^(?:[.#[:]|[a-z][\w-]*[.#[:])/u.test(text.trim()));
      if (text !== null && text !== undefined && ((selector && SEALED_INTERNAL.test(text)) || (classLookup && /(?:^|\s)cm-[a-z]/u.test(text)))) {
        context.report({ node, message: SEALED_INTERNAL_MESSAGE });
      }
    };
    return {
      CallExpression: (node: TSESTree.CallExpression): void => {
        const argument = node.arguments[0];
        if (argument?.type === "Identifier") {
          const value = staticTextValue(context, argument);
          judge(argument, typeof value === "string" ? value : undefined);
        }
      },
      Literal: (node: TSESTree.Literal): void => judge(node, typeof node.value === "string" ? node.value : undefined),
      TemplateElement: (node: TSESTree.TemplateElement): void => judge(node, node.value.cooked),
    };
  },
};
