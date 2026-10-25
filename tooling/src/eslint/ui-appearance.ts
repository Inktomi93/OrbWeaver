// An appearance channel name spelled in a string (`--appearance-*`, `data-appearance-*`, an `appearance-*:` class
// variant) must be one the client manifest's channel writes, so a typo or a renamed key cannot read a value nothing
// sets. A class keyed on an OS-only preference variant is refused too: it ignores the app's `on` and `off`.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

/** The generated channel's names (`appearanceChannelVocabulary()` in `packages/client/appearance-channel.build.ts`). */
export interface AppearanceVocabulary {
  readonly properties: readonly string[];
  readonly attributes: readonly string[];
  readonly variants: readonly string[];
  /** Each OS-only preference variant → the resolved variant that honours the app over it. */
  readonly osVariants: Readonly<Record<string, string>>;
}

const APPEARANCE_NAME = /--appearance-[a-z0-9-]+|data-appearance-[a-z0-9-]+|(?<![\w-])appearance-[a-z0-9-]+(?=:)/gu;
// `motion-safe` is the negation of `motion-reduce`, which a two-arm resolved variant cannot express.
const OS_ONLY_VARIANT = /(?<![\w-])(?:not-)?(motion-safe|motion-reduce|transparency-reduce|contrast-more)(?=:)/gu;
const MOTION_SAFE = "motion-safe";

// @orb/ui compiles without the client's resolved variants, so a ui file is pointed at the guarded sheet form instead.
const UI_SOURCE = "/packages/ui/src/";

function osOnlyMessage(name: string, osVariants: AppearanceVocabulary["osVariants"], inUi: boolean): string {
  const resolved = osVariants[name];
  const lead = `"${name}:" follows the OS only and ignores the app's on and off;`;
  if (resolved === undefined) {
    return `${lead} let the reduced-motion floor remove the motion.`;
  }
  if (inUi) {
    return `${lead} key it in a ui sheet on ":root[data-${resolved}="on"]" and on "@variant ${name}" over ":root:not([data-${resolved}="off"])", as motion-floor.css does.`;
  }
  return `${lead} use "${resolved}".`;
}

/** Build the rule over the generated channel's vocabulary, read from the manifest, never a hand list. */
export function appearanceNameRule(vocabulary: AppearanceVocabulary): OrbRule {
  const known = new Set([...vocabulary.properties, ...vocabulary.attributes, ...vocabulary.variants]);
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const inUi = context.filename.includes(UI_SOURCE);
      const check = (node: TSESTree.Node, text: string): void => {
        for (const match of text.matchAll(APPEARANCE_NAME)) {
          if (!known.has(match[0])) {
            context.report({
              node,
              message: `"${match[0]}" is not an appearance channel name; the manifest (appearance-carrier-manifest.ts) declares every one.`,
            });
          }
        }
        for (const match of text.matchAll(OS_ONLY_VARIANT)) {
          const name = match[1] ?? MOTION_SAFE;
          context.report({ node, message: osOnlyMessage(name, vocabulary.osVariants, inUi) });
        }
      };
      return {
        "Literal[value=/appearance-|motion-|transparency-|contrast-/]": (node: TSESTree.Literal): void => {
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
