import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// The attributes and classes a sealed library stamps on its own DOM: cmdk's `cmdk-*` attributes, Base UI's
// `data-base-ui-*` hooks and `base-ui-*` ids, Radix's `data-radix-*`, CodeMirror's `.cm-*` classes. A selector that
// names one reaches past the @orb/ui seal and breaks on a library upgrade.
const SEALED_INTERNAL = /(?:^|[\s.[,>+~=:("'])(?:cmdk-[a-z]|data-base-ui-|base-ui-[a-z]|data-radix-)|\.cm-[a-z]/u;

const SEALED_INTERNAL_MESSAGE =
  "A string names a sealed library's internal attribute or class (cmdk-*, data-base-ui-*, .cm-*). Expose what you need from the @orb/ui seal (a prop, a ref, a part) instead of reaching into its DOM.";

/** Judges every string a client file spells; `packages/ui/src` is outside it, because the seal is where the vendor DOM is named. */
export const noSealedInternalsRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const judge = (node: TSESTree.Node, text: string | null | undefined): void => {
      if (text !== null && text !== undefined && SEALED_INTERNAL.test(text)) {
        context.report({ node, message: SEALED_INTERNAL_MESSAGE });
      }
    };
    return {
      Literal: (node: TSESTree.Literal): void => judge(node, typeof node.value === "string" ? node.value : undefined),
      TemplateElement: (node: TSESTree.TemplateElement): void => judge(node, node.value.cooked),
    };
  },
};
