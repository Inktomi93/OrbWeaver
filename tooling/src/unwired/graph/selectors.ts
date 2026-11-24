// The data-* selector spellings the DOM and variant passes read, and the sheets they read them from.
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CssNode } from "@eslint/css-tree";
import { parse, walk } from "@eslint/css-tree";
import type { Node, SourceFile } from "@typescript/native/ast";
import { isNoSubstitutionTemplateLiteral, isStringLiteral } from "@typescript/native/ast";
import { editorLineOf } from "../../floor/typescript/editor-lines.ts";
import type { NativeWorld } from "../native.ts";
import { isProduction } from "../worlds.ts";

/** The author sheets of every package. */
export const SHEETS = "packages/*/src/**/*.css";
export const NOT_SOURCE = ["**/node_modules/**"];
export const DATA = "data-";
/** Selector reads a string spells: `[data-x]`, `[data-x="v"]`, Tailwind's `data-[x=v]:` and `data-x:`. */
export const SELECTOR_READ = /\[(data-[a-z][\w-]*)(?:[~|^$*]?=["']?([\w:-]+))?/gu;
export const VARIANT_READ = /(?:^|[\s:])(?:group-|peer-|in-|not-|has-)?data-\[([a-z][\w-]*)(?:=([\w-]+))?\]/gu;
export const BARE_VARIANT_READ = /(?:^|[\s:])(?:group-|peer-|in-|not-|has-)?data-([a-z][\w-]*):/gu;

/** A selector that names one value of a data-* attribute exactly (`[data-tone="info"]`, `data-[tone=info]:`), at
 *  `file:line`. */
export interface ValueSelector {
  readonly attribute: string;
  readonly value: string;
  readonly at: string;
}

// The match of an operator that selects more than one value: `^=`, `~=` and their kin.
const PARTIAL_MATCH = /[~|^$*]=/u;

/** Every exact value selector the tree's sheets spell, and every one a product string spells. */
export function valueSelectors(root: string, world: NativeWorld): readonly ValueSelector[] {
  const out: ValueSelector[] = [];
  for (const sheet of globSync(SHEETS, { cwd: root, exclude: NOT_SOURCE })) {
    walk(parse(readFileSync(join(root, sheet), "utf8"), { parseAtrulePrelude: false, parseValue: false, positions: true }), {
      enter(node): void {
        const selector = sheetValueSelector(node, sheet);
        if (selector !== null) {
          out.push(selector);
        }
      },
    });
  }
  for (const source of world.files) {
    const file = world.fileOfSource(source);
    if (isProduction(file)) {
      out.push(...stringValueSelectors(file, source));
    }
  }
  return out;
}

function stringValueSelectors(file: string, source: SourceFile): readonly ValueSelector[] {
  const out: ValueSelector[] = [];
  const visit = (node: Node): void => {
    if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) {
      out.push(...textValueSelectors(node.text, `${file}:${String(editorLineOf(source, node.getStart(source)))}`));
    }
    node.forEachChild(visit);
  };
  visit(source);
  return out;
}

// The exact value selectors a string spells: a selector, or a Tailwind data variant.
function textValueSelectors(text: string, at: string): readonly ValueSelector[] {
  const selectors = [...text.matchAll(SELECTOR_READ)].flatMap((match) =>
    match[2] === undefined || PARTIAL_MATCH.test(match[0]) ? [] : [{ attribute: match[1] ?? "", value: match[2], at }],
  );
  const variants = [...text.matchAll(VARIANT_READ)].flatMap((match) =>
    match[2] === undefined ? [] : [{ attribute: `${DATA}${match[1] ?? ""}`, value: match[2], at }],
  );
  return [...selectors, ...variants];
}

// The exact value selector a sheet's attribute selector is, if it is one.
function sheetValueSelector(node: CssNode, sheet: string): ValueSelector | null {
  const loc = node.loc ?? null;
  if (node.type !== "AttributeSelector" || !node.name.name.startsWith(DATA) || node.matcher !== "=" || node.value === null || loc === null) {
    return null;
  }
  return { attribute: node.name.name, value: node.value.type === "String" ? node.value.value : node.value.name, at: `${sheet}:${String(loc.start.line)}` };
}
