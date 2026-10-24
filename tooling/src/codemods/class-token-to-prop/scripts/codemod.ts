// Moves a class token off a JSX attribute's string literals and onto a named prop, by a map read from the target
// directory: `<Card className="!p-0 x">` → `<Card className="x" padding="none">`. A literal that empties is dropped
// (a bare attribute) or becomes `undefined` (inside an expression); unmapped elements and tokens stay untouched.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_MAP_FILE = "codemod-class-prop-map.json";

interface PropRule {
  /** The JSX element name, as written. */
  readonly element: string;
  /** The attribute whose string literals carry the token. */
  readonly attribute: string;
  /** The exact class token to remove. */
  readonly token: string;
  /** The prop to add, and its string value. */
  readonly prop: string;
  readonly value: string;
}

const JSX_ATTRIBUTE: RuleConfig<TSX> = { rule: { kind: "jsx_attribute" } };
const STRING: RuleConfig<TSX> = { rule: { kind: "string" } };

export const getSelector: GetSelector<TSX> = () => JSX_ATTRIBUTE;

function readRules(targetDir: string, mapFile: string): readonly PropRule[] {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || !Array.isArray((parsed as { rules?: unknown }).rules)) {
    throw new Error(`${mapFile}: expected { rules: [...] }`);
  }
  return (parsed as { rules: unknown[] }).rules.map((entry) => {
    if (entry === null || typeof entry !== "object") {
      throw new Error(`${mapFile}: a rule must be an object`);
    }
    const rule = entry as Record<string, unknown>;
    for (const key of ["element", "attribute", "token", "prop", "value"]) {
      if (typeof rule[key] !== "string") {
        throw new Error(`${mapFile}: rule.${key} must be a string`);
      }
    }
    return rule as unknown as PropRule;
  });
}

/** The rules that apply to this attribute: its element's name (the child after `<`) and its own name. */
function applicableRules(attribute: SgNode<TSX>, rules: readonly PropRule[]): readonly PropRule[] {
  const element = attribute.parent()?.child(1)?.text();
  const name = attribute.child(0)?.text();
  return rules.filter((rule) => rule.element === element && rule.attribute === name);
}

interface LiteralRewrite {
  /** The replacement edit, or none when the bare attribute value emptied and the attribute goes instead. */
  readonly edit: Edit | undefined;
  readonly removesAttribute: boolean;
  readonly hit: readonly PropRule[];
}

/** Rewrite one string literal: drop the mapped tokens and report which rules they belonged to. */
function rewriteLiteral(literal: SgNode<TSX>, rules: readonly PropRule[], isBareValue: boolean): LiteralRewrite {
  const quote = literal.text().slice(0, 1);
  const hit: PropRule[] = [];
  const kept = literal
    .text()
    .slice(1, -1)
    .split(/\s+/u)
    .filter((token) => {
      const rule = rules.find((candidate) => candidate.token === token);
      if (rule !== undefined) {
        hit.push(rule);
      }
      return token !== "" && rule === undefined;
    });
  const text = kept.join(" ");
  if (hit.length === 0) {
    return { edit: undefined, removesAttribute: false, hit };
  }
  if (text === "" && isBareValue) {
    return { edit: undefined, removesAttribute: true, hit };
  }
  return { edit: literal.replace(text === "" ? "undefined" : `${quote}${text}${quote}`), removesAttribute: false, hit };
}

/** Rewrite one attribute's literals and append its prop; returns the edits for this attribute. */
function rewriteAttribute(attribute: SgNode<TSX>, rules: readonly PropRule[]): readonly Edit[] {
  const value = attribute.child(2);
  const rewrites = attribute.findAll(STRING).map((literal) => rewriteLiteral(literal, rules, value !== null && literal.id() === value.id()));
  const props = new Map(rewrites.flatMap((rewrite) => rewrite.hit.map((rule) => [rule.prop, rule.value] as const)));
  if (props.size === 0) {
    return [];
  }
  const removesAttribute = rewrites.some((rewrite) => rewrite.removesAttribute);
  const added = [...props].map(([prop, propValue]) => `${prop}="${propValue}"`).join(" ");
  const range = attribute.range();
  const start = removesAttribute ? range.start.index : range.end.index;
  return [
    ...rewrites.flatMap((rewrite) => (rewrite.edit === undefined ? [] : [rewrite.edit])),
    { startPos: start, endPos: range.end.index, insertedText: removesAttribute ? added : ` ${added}` },
  ];
}

const codemod: Codemod<TSX> = (root, options) => {
  const rules = readRules(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const rootNode = root.root();
  const attributes = options.matches ?? rootNode.findAll(JSX_ATTRIBUTE);
  const edits = attributes.flatMap((attribute) => rewriteAttribute(attribute, applicableRules(attribute, rules)));
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
