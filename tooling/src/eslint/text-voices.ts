// Client text chooses a semantic voice; UI alone composes its size, weight and transform axes.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { importedSymbol, jsxProperties } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const TEXT_DOOR = "@orb/ui/text";
const TEXT_PARTS = new Set(["Text", "Heading"]);
const INTERNAL_AXES = new Set(["size", "weight", "transform"]);
const MESSAGE = "Text and Heading take voice in client code; size, weight and transform are UI-internal axes. Semantic tone stays available.";

export const textVoiceOnlyRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "JSXOpeningElement:exit"(node: TSESTree.JSXOpeningElement): void {
        const imported = importedSymbol(context, node.name);
        if (imported?.source !== TEXT_DOOR || !TEXT_PARTS.has(imported.name)) {
          return;
        }
        for (const property of jsxProperties(context, node)) {
          if (INTERNAL_AXES.has(property.name)) {
            context.report({ node: property.node, message: MESSAGE });
          }
        }
      },
    };
  },
};
