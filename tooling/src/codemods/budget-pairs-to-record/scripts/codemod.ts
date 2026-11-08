// Folds a module's hand-paired `const X_MS = budget(X_BASE_MS)` lines into one `budgets({...})` record.
import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";
import { importBindingOf } from "@jssg/utils/javascript/bindings";

const RECORD = "CEILINGS_MS";
const HELPER = "budgets";
const LOAD_BUDGET_SOURCE = /(?:^|\/)load-budget(?:\.ts)?$/u;
const NEWLINE_BYTE = 0x0a;
const MS_SUFFIX = /_MS$/u;

const PAIR: RuleConfig<TS> = { rule: { pattern: "const $C = budget($B);" } };

export const getSelector: GetSelector<TS> = () => PAIR;

const edits = useMetricAtom("budget-pairs-to-record-edits");
const skips = useMetricAtom("budget-pairs-to-record-skips");

interface Pair {
  readonly ceiling: SgNode<TS>;
  readonly name: string;
  readonly key: string;
  readonly base: SgNode<TS>;
  readonly value: string;
}

/** `READY_TIMEOUT_MS` reads as the key `readyTimeout`. */
function keyOf(name: string): string {
  const words = name.replace(MS_SUFFIX, "").toLowerCase().split("_");
  return words.map((word, index) => (index === 0 ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)).join("");
}

function identifiers(rootNode: SgNode<TS>, name: string): SgNode<TS>[] {
  return rootNode.findAll({ rule: { kind: "identifier", regex: `^${name}$` } });
}

/** The module-level `const <name> = <value>;` that declares a base, with its value text, or null. */
function baseDeclaration(rootNode: SgNode<TS>, name: string): { readonly statement: SgNode<TS>; readonly value: string } | null {
  for (const statement of rootNode.findAll({ rule: { pattern: `const ${name} = $V;` } })) {
    const value = statement.getMatch("V");
    if (statement.parent()?.kind() === "program" && value !== null) {
      return { statement, value: value.text() };
    }
  }
  return null;
}

/** The statement's own line, so no blank line remains where it stood. */
function lineDeletion(node: SgNode<TS>, bytes: Uint8Array): Edit {
  const { start, end } = node.range();
  return { startPos: start.index, endPos: bytes[end.index] === NEWLINE_BYTE ? end.index + 1 : end.index, insertedText: "" };
}

function skip(reason: string): Promise<null> {
  skips.increment({ reason });
  return Promise.resolve(null);
}

// Every reason to leave a file alone is a skip with its own label, so a run reconciles against the census.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a flat list of per-file refusals before one rewrite; splitting it scatters the refusal labels.
const codemod: Codemod<TS> = (root) => {
  const rootNode = root.root();
  const matches = rootNode.findAll(PAIR);
  if (matches.length === 0) {
    return Promise.resolve(null);
  }
  const pairs: Pair[] = [];
  for (const match of matches) {
    const callee = match.find({ rule: { kind: "call_expression" } })?.field("function") ?? null;
    const ceiling = match.getMatch("C");
    const base = match.getMatch("B");
    if (callee === null || ceiling?.kind() !== "identifier" || base?.kind() !== "identifier") {
      return skip("not-a-named-pair");
    }
    const binding = importBindingOf(callee);
    if (binding === null || binding.importedName !== "budget" || !LOAD_BUDGET_SOURCE.test(binding.source)) {
      return skip("not-the-load-budget-import");
    }
    if (match.parent()?.kind() !== "program") {
      return skip(match.parent()?.kind() === "export_statement" ? "exported-ceiling" : "not-module-scope");
    }
    const declaration = baseDeclaration(rootNode, base.text());
    if (declaration === null) {
      return skip("base-not-a-module-const");
    }
    if (identifiers(rootNode, base.text()).length !== 2) {
      return skip("base-read-elsewhere");
    }
    pairs.push({ ceiling: match, name: ceiling.text(), key: keyOf(ceiling.text()), base: declaration.statement, value: declaration.value });
  }
  if (identifiers(rootNode, RECORD).length > 0) {
    return skip("record-name-taken");
  }
  if (pairs.some(({ name }) => rootNode.find({ rule: { kind: "shorthand_property_identifier", regex: `^${name}$` } }) !== null)) {
    return skip("shorthand-use");
  }
  const [first, ...rest] = pairs.toSorted((left, right) => left.base.range().start.index - right.base.range().start.index);
  if (first === undefined) {
    return Promise.resolve(null);
  }
  // A later base's own comment would be left above an unrelated line.
  if (rest.some(({ base }) => base.prev()?.kind() === "comment")) {
    return skip("comment-on-a-later-base");
  }
  const bytes = new TextEncoder().encode(rootNode.text());
  const record = `const ${RECORD} = ${HELPER}({ ${[first, ...rest].map(({ key, value }) => `${key}: ${value}`).join(", ")} });`;
  const plan: Edit[] = [first.base.replace(record), ...rest.map(({ base }) => lineDeletion(base, bytes))];
  for (const pair of pairs) {
    plan.push(lineDeletion(pair.ceiling, bytes));
    for (const use of identifiers(rootNode, pair.name)) {
      if (use.parent()?.kind() !== "variable_declarator") {
        plan.push(use.replace(`${RECORD}.${pair.key}`));
      }
    }
  }
  const specifier = rootNode.find({
    rule: { kind: "import_specifier", has: { field: "name", regex: "^budget$" }, inside: { kind: "import_statement", stopBy: "end" } },
  });
  if (specifier === null) {
    return skip("no-budget-specifier");
  }
  // Every `budget` left besides the specifier and the folded calls is a caller that still needs the import.
  const keepsBudget = identifiers(rootNode, "budget").length - 1 - pairs.length > 0;
  plan.push(specifier.replace(keepsBudget ? `budget, ${HELPER}` : HELPER));
  edits.increment({ shape: pairs.length === 1 ? "one-pair" : "several-pairs" }, pairs.length);
  return Promise.resolve(rootNode.commitEdits(plan));
};

export default codemod;
