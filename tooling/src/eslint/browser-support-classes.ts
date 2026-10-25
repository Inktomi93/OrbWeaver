// The Tailwind half of orb/browser-support: a class string in `className`/`class` or a class helper (cva, cn, clsx, ...) is compiled
// to CSS, and each declaration goes through the same key check the Stylelint rule runs, so `field-sizing-content` and
// `[animation-timeline:scroll()]` are judged like the property they emit. A class whose CSS sits under `@supports` is guarded.

import type { RuleVisitor } from "@eslint/core";
import type { CssSupportIndex } from "@orb/tooling/browser-support";
import { refusedDeclaration } from "@orb/tooling/browser-support";
import type { TSESTree } from "@typescript-eslint/utils";
import type { CandidatesToCss } from "./ui-feature-classname.ts";

interface Refusal {
  readonly what: string;
  readonly lacking: readonly string[];
}

const CLASS_TOKEN = /^[!\w@[\]:&>*()/.%#,'"=~-]+$/u;
const DECLARATION = /^\s*([a-z][\w-]*)\s*:\s*([^{;]*);\s*$/gmu;
const CLASS_HOLDERS = "JSXAttribute[name.name=/^(className|class)$/][value], CallExpression[callee.name=/^(cva|cn|clsx|cx|tv|twMerge)$/]";

function childNodes(node: TSESTree.Node): TSESTree.Node[] {
  return Object.entries(node)
    .filter(([key]) => key !== "parent")
    .flatMap(([, child]) => (Array.isArray(child) ? child : [child]))
    .filter((item): item is TSESTree.Node => typeof item === "object" && item !== null && "type" in item);
}

/** The text of the `const` string an identifier names (`DIALOG_SCROLL_CLASS`), or `undefined` for anything else. */
export type ConstantText = (identifier: TSESTree.Identifier) => string | undefined;

const isPropertyName = (node: TSESTree.Identifier): boolean =>
  (node.parent.type === "MemberExpression" && node.parent.property === node && !node.parent.computed) ||
  (node.parent.type === "Property" && node.parent.key === node && !node.parent.computed);

/** Every string a class holder carries: literals, template pieces, named `const` strings and whatever they nest in (variant maps, ternaries, arrays). */
function* stringsIn(node: TSESTree.Node, constantText: ConstantText): Generator<{ readonly site: TSESTree.Node; readonly text: string }> {
  const named = node.type === "Identifier" && !isPropertyName(node) ? constantText(node) : undefined;
  if (named !== undefined) {
    yield { site: node, text: named };
  } else if (node.type === "Literal" && typeof node.value === "string") {
    yield { site: node, text: node.value };
  } else if (node.type === "TemplateElement") {
    yield { site: node, text: node.value.cooked ?? node.value.raw };
  } else {
    for (const child of childNodes(node)) {
      yield* stringsIn(child, constantText);
    }
  }
}

/** Visitors that judge the Tailwind classes in class holders against the CSS key index. */
export function classSupportVisitor(
  index: CssSupportIndex,
  candidatesToCss: CandidatesToCss,
  constantText: ConstantText,
  refuse: (node: TSESTree.Node, what: string, lacking: readonly string[]) => void,
): RuleVisitor {
  const refusals = new Map<string, Refusal | null>();
  const seen = new WeakSet<TSESTree.Node>();
  const refusalFor = (token: string): Refusal | null => {
    const cached = refusals.get(token);
    if (cached !== undefined) {
      return cached;
    }
    const css = CLASS_TOKEN.test(token) ? (candidatesToCss([token])[0] ?? "") : "";
    const declarations = css.includes("@supports") ? [] : [...css.matchAll(DECLARATION)];
    const refused = declarations.map(([, property = "", value = ""]) => refusedDeclaration(index, property, value)).find((found) => found !== null) ?? null;
    refusals.set(token, refused);
    return refused;
  };
  const check = (root: TSESTree.Node): void => {
    for (const { site, text } of stringsIn(root, constantText)) {
      if (!seen.has(site)) {
        seen.add(site);
        for (const token of text.split(/\s+/u).filter((word) => word !== "")) {
          const refused = refusalFor(token);
          if (refused !== null) {
            refuse(site, `The class \`${token}\` (${refused.what})`, refused.lacking);
          }
        }
      }
    }
  };
  return { [CLASS_HOLDERS]: check };
}
