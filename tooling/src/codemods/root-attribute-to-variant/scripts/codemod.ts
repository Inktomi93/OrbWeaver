// Moves a rule keyed on a root attribute (`:root[data-x] .a { … }`) under the Tailwind variant that owns that
// attribute (`@variant v { .a { … } }`), by an exact map read from the target directory. A rule on the root itself
// nests the variant inside `:root`, since the block form expands `&` to a descendant of the root. A selector list
// that mixes attributes, mixes the root with its descendants, or continues the root compound is left for a hand edit.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type CSS from "codemod:ast-grep/langs/css";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_MAP_FILE = "codemod-root-attribute-map.json";
const ROOT = ":root";

const RULE_SET: RuleConfig<CSS> = { rule: { kind: "rule_set", has: { kind: "selectors", regex: "^:root\\[" } } };

export const getSelector: GetSelector<CSS> = () => RULE_SET;

/** Attribute selector text (`[data-shadow]`, `[data-texture="grain"]`) → the variant name that replaces it. */
function readMap(targetDir: string, mapFile: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  const attributes = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>)["attributes"] : undefined;
  if (attributes === null || typeof attributes !== "object" || Array.isArray(attributes)) {
    throw new Error(`${mapFile}: expected { "attributes": { "[data-x]": "variant-name" } }`);
  }
  return new Map(
    Object.entries(attributes).map(([from, to]) => {
      if (typeof to !== "string") {
        throw new Error(`${mapFile}: attributes.${from} maps to a non-string`);
      }
      return [from, to] as const;
    }),
  );
}

/** Split a selector list on its top-level commas, so `:is(a, b)` stays one part. */
function splitList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

interface RootPart {
  readonly attribute: string;
  /** What follows the root compound: empty for the root itself, else a descendant selector. */
  readonly descendant: string;
}

/** `:root[x] .a` → `{ [x], .a }`; `:root[x]` → `{ [x], "" }`; anything that continues the root compound → undefined. */
function rootPart(selector: string): RootPart | undefined {
  const close = selector.indexOf("]");
  if (!selector.startsWith(`${ROOT}[`) || close < 0) {
    return undefined;
  }
  const after = selector.slice(close + 1);
  if (after !== "" && !/^\s/u.test(after)) {
    return undefined;
  }
  return { attribute: selector.slice(ROOT.length, close + 1), descendant: after.trim() };
}

function rewrite(rule: SgNode<CSS>, map: ReadonlyMap<string, string>): string | undefined {
  const selectors = rule.children().find((child) => child.kind() === "selectors");
  const block = rule.children().find((child) => child.kind() === "block");
  if (selectors === undefined || block === undefined) {
    return undefined;
  }
  const parts = splitList(selectors.text()).map(rootPart);
  const first = parts[0];
  const variant = first === undefined ? undefined : map.get(first.attribute);
  if (first === undefined || variant === undefined) {
    return undefined;
  }
  const descendants: string[] = [];
  for (const part of parts) {
    if (part === undefined || part.attribute !== first.attribute || (part.descendant === "") !== (first.descendant === "")) {
      return undefined;
    }
    descendants.push(part.descendant);
  }
  return first.descendant === "" ? `${ROOT} {\n@variant ${variant} ${block.text()}\n}` : `@variant ${variant} {\n${descendants.join(",\n")} ${block.text()}\n}`;
}

const codemod: Codemod<CSS> = (root, options) => {
  const map = readMap(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const rootNode = root.root();
  const rules = options.matches ?? rootNode.findAll(RULE_SET);
  const edits: Edit[] = [];
  for (const rule of rules) {
    const next = rewrite(rule, map);
    if (next !== undefined) {
      edits.push(rule.replace(next));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
