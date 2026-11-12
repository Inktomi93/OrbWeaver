// Moves every one-argument drizzle `text(name)` column in a db schema file onto `nulFreeText(name)`, the text column
// that removes NUL on its way to the driver. A `text(name, { mode: "json" })` or `text(name, { enum })` column stays on
// drizzle's own `text`: JSON text carries a NUL only as an escape, and an enum column holds only its tuple's literals.
// The drizzle import loses `text` once no call uses it, and the schema file gains the custom-types import.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";

const DRIZZLE_MODULE = "drizzle-orm/sqlite-core";
const DRIZZLE_TEXT = "text";
const HELPER = "nulFreeText";
const HELPER_MODULE = "../custom-types/index.ts";

const edited = useMetricAtom("text-column-strips-nul-edits");
const kept = useMetricAtom("text-column-strips-nul-kept");

const CALL: RuleConfig<TS> = { rule: { kind: "call_expression", has: { field: "function", kind: "identifier", regex: `^${DRIZZLE_TEXT}$` } } };

/** Only files that call `text(...)` can change. */
export const getSelector: GetSelector<TS> = () => CALL;

const sourceOf = (statement: SgNode<TS>): string | undefined =>
  statement
    .field("source")
    ?.find({ rule: { kind: "string_fragment" } })
    ?.text();

const isTypeOnly = (statement: SgNode<TS>): boolean => statement.children().some((child) => child.kind() === "type");

function specifiersOf(statement: SgNode<TS>): SgNode<TS>[] {
  return statement.find({ rule: { kind: "named_imports" } })?.findAll({ rule: { kind: "import_specifier" } }) ?? [];
}

// The drizzle value import that binds `text`, proving the calls are drizzle's column builder.
function drizzleTextImport(rootNode: SgNode<TS>): SgNode<TS> | undefined {
  return rootNode
    .findAll({ rule: { kind: "import_statement" } })
    .find(
      (statement) =>
        sourceOf(statement) === DRIZZLE_MODULE && !isTypeOnly(statement) && specifiersOf(statement).some((specifier) => specifier.text() === DRIZZLE_TEXT),
    );
}

const argumentCount = (call: SgNode<TS>): number =>
  call
    .field("arguments")
    ?.children()
    .filter((child) => child.isNamed()).length ?? 0;

// Drops `text` from the drizzle specifier list, with the separator on one side.
function dropTextSpecifier(statement: SgNode<TS>): Edit | null {
  const specifiers = specifiersOf(statement);
  const index = specifiers.findIndex((specifier) => specifier.text() === DRIZZLE_TEXT);
  const target = specifiers[index];
  if (target === undefined) {
    return null;
  }
  const next = specifiers[index + 1];
  if (next !== undefined) {
    return { startPos: target.range().start.index, endPos: next.range().start.index, insertedText: "" };
  }
  const previous = specifiers[index - 1];
  if (previous !== undefined) {
    return { startPos: previous.range().end.index, endPos: target.range().end.index, insertedText: "" };
  }
  return null;
}

// Adds the helper to an existing custom-types value import, or a new import line after the drizzle import.
function helperImport(rootNode: SgNode<TS>, drizzle: SgNode<TS>): Edit | null {
  const existing = rootNode
    .findAll({ rule: { kind: "import_statement" } })
    .find((statement) => sourceOf(statement) === HELPER_MODULE && !isTypeOnly(statement));
  if (existing !== undefined) {
    const specifiers = specifiersOf(existing);
    const last = specifiers.at(-1);
    if (last === undefined || specifiers.some((specifier) => specifier.text() === HELPER)) {
      return null;
    }
    return { startPos: last.range().end.index, endPos: last.range().end.index, insertedText: `, ${HELPER}` };
  }
  const at = drizzle.range().end.index;
  return { startPos: at, endPos: at, insertedText: `\nimport { ${HELPER} } from "${HELPER_MODULE}";` };
}

const codemod: Codemod<TS> = (root) => {
  const rootNode = root.root();
  const drizzle = drizzleTextImport(rootNode);
  if (drizzle === undefined) {
    return Promise.resolve(null);
  }
  const calls = rootNode.findAll(CALL);
  const edits: Edit[] = [];
  for (const call of calls) {
    const callee = call.field("function");
    if (argumentCount(call) !== 1 || callee === null) {
      kept.increment({ reason: "json-or-enum" });
      continue;
    }
    edits.push(callee.replace(HELPER));
    edited.increment({ shape: "plain-text" });
  }
  if (edits.length === 0) {
    return Promise.resolve(null);
  }
  if (edits.length === calls.length) {
    const dropped = dropTextSpecifier(drizzle);
    if (dropped !== null) {
      edits.push(dropped);
    }
  }
  const added = helperImport(rootNode, drizzle);
  if (added !== null) {
    edits.push(added);
  }
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
