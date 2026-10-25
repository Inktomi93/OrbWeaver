// Replaces an imported class constant on a JSX `className` with the primitive props that own its paint, by a map read
// from the target directory: `<Row className={cn("flex-wrap", HIDE_AT_COARSE)}>` → `<Row className="flex-wrap" hiddenAt="coarse">`.
// Only a bare constant or a `cn(...)` call of string literals and mapped constants is rewritten; anything else, and an
// element that already carries one of the props, stays for a hand edit. An import left unused is Biome's to remove.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_MAP_FILE = "codemod-class-constant-map.json";
const CLASS_HELPER = "cn";

interface ConstantRule {
  /** The constant's identifier, as imported. */
  readonly constant: string;
  /** The JSX attributes that replace it, as written: `hiddenAt="coarse"` or a bare `shadow`. */
  readonly props: readonly string[];
}

const JSX_ATTRIBUTE: RuleConfig<TSX> = { rule: { kind: "jsx_attribute" } };

export const getSelector: GetSelector<TSX> = () => JSX_ATTRIBUTE;

function readRules(targetDir: string, mapFile: string): ReadonlyMap<string, ConstantRule> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || !Array.isArray((parsed as { rules?: unknown }).rules)) {
    throw new Error(`${mapFile}: expected { rules: [...] }`);
  }
  const rules = new Map<string, ConstantRule>();
  for (const entry of (parsed as { rules: unknown[] }).rules) {
    const rule = entry as Partial<ConstantRule> | null;
    if (rule === null || typeof rule.constant !== "string" || !Array.isArray(rule.props) || rule.props.some((prop) => typeof prop !== "string")) {
      throw new Error(`${mapFile}: a rule needs a string constant and a props list of strings`);
    }
    rules.set(rule.constant, rule as ConstantRule);
  }
  return rules;
}

const propName = (prop: string): string => prop.split("=")[0] ?? prop;

function namedChildren(node: SgNode<TSX>): readonly SgNode<TSX>[] {
  return node.children().filter((child) => child.isNamed());
}

/** The expression inside `{...}`, with a trailing `?? ""` unwrapped (a `cn` result the call site coerced to a string). */
function expressionOf(attribute: SgNode<TSX>): SgNode<TSX> | undefined {
  const container = attribute.child(2);
  if (container === null || container.kind() !== "jsx_expression") {
    return undefined;
  }
  const inner = namedChildren(container)[0];
  if (inner?.kind() === "binary_expression") {
    const right = inner.field("right");
    return inner.field("operator")?.text() === "??" && right?.text() === '""' ? (inner.field("left") ?? undefined) : undefined;
  }
  return inner;
}

interface Operands {
  readonly constants: readonly string[];
  readonly literals: readonly string[];
}

/** The mapped constants and the string literals a `className` expression is made of; `undefined` when it holds anything else. */
function operandsOf(expression: SgNode<TSX>, rules: ReadonlyMap<string, ConstantRule>): Operands | undefined {
  if (expression.kind() === "identifier") {
    return rules.has(expression.text()) ? { constants: [expression.text()], literals: [] } : undefined;
  }
  if (expression.kind() !== "call_expression" || expression.field("function")?.text() !== CLASS_HELPER) {
    return undefined;
  }
  const constants: string[] = [];
  const literals: string[] = [];
  for (const argument of namedChildren(expression.field("arguments") ?? expression)) {
    if (argument.kind() === "identifier" && rules.has(argument.text())) {
      constants.push(argument.text());
    } else if (argument.kind() === "string") {
      literals.push(argument.text().slice(1, -1));
    } else {
      return undefined;
    }
  }
  return constants.length === 0 ? undefined : { constants, literals };
}

function siblingAttributeNames(attribute: SgNode<TSX>): ReadonlySet<string> {
  const siblings = attribute.parent()?.children() ?? [];
  return new Set(siblings.filter((child) => child.kind() === "jsx_attribute").map((child) => child.child(0)?.text() ?? ""));
}

function rewriteAttribute(attribute: SgNode<TSX>, rules: ReadonlyMap<string, ConstantRule>): readonly Edit[] {
  if (attribute.child(0)?.text() !== "className") {
    return [];
  }
  const expression = expressionOf(attribute);
  const operands = expression === undefined ? undefined : operandsOf(expression, rules);
  if (operands === undefined) {
    return [];
  }
  const props = operands.constants.flatMap((constant) => rules.get(constant)?.props ?? []);
  const names = props.map(propName);
  const existing = siblingAttributeNames(attribute);
  if (new Set(names).size !== names.length || names.some((name) => existing.has(name))) {
    return [];
  }
  const kept = operands.literals.flatMap((literal) => literal.split(/\s+/u)).filter((token) => token !== "");
  const className = kept.length === 0 ? [] : [`className="${kept.join(" ")}"`];
  return [attribute.replace([...className, ...props].join(" "))];
}

const codemod: Codemod<TSX> = (root, options) => {
  const rules = readRules(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const rootNode = root.root();
  const attributes = options.matches ?? rootNode.findAll(JSX_ATTRIBUTE);
  const edits = attributes.flatMap((attribute) => rewriteAttribute(attribute, rules));
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
