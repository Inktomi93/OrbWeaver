// Replaces `keysOf(R)` with the tuple that owns R's keys, and drops the helper's import. A record with no row in
// OWNING_TUPLES keeps its call, so `tsc` names it once the helper is gone.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const OWNING_TUPLES: ReadonlyMap<string, string> = new Map([
  ["SEED_THEME_VALUE_SETS", "SEED_THEME_NAMES"],
  ["BUTTON_BOX_OVERFLOW", "BUTTON_BOX_STEPS"],
]);
const HELPER = "keysOf";
const CALL = { rule: { pattern: `${HELPER}($R)` } } as const;
const ROOT_NAME = /^[A-Z_]+/u;

export const getSelector: GetSelector<TS> = () => CALL;

// One import list's new names: the helper leaves, a record that lost its last use becomes its tuple, one still in use gains it.
function rewrittenNames(names: readonly string[], rootNode: SgNode<TS>, replaced: ReadonlyMap<string, number>, helperGone: boolean): readonly string[] {
  return names.flatMap((name) => {
    if (name === HELPER) {
      return helperGone ? [] : [name];
    }
    const count = replaced.get(name);
    const tuple = OWNING_TUPLES.get(name);
    if (count === undefined || tuple === undefined) {
      return [name];
    }
    // Beyond the replaced calls, a record that lost its last use keeps one mention: this import.
    const stillUsed = rootNode.findAll({ rule: { kind: "identifier", regex: `^${name}$` } }).length > count + 1;
    return stillUsed ? [name, tuple] : [tuple];
  });
}

function importEdit(imports: SgNode<TS>, names: readonly string[]): Edit {
  if (names.length > 0) {
    return imports.replace(`{ ${names.join(", ")} }`);
  }
  const statement = imports.ancestors().find((ancestor) => ancestor.kind() === "import_statement") ?? imports;
  const range = statement.range();
  return { startPos: range.start.index, endPos: range.end.index + 1, insertedText: "" };
}

const codemod: Codemod<TS> = (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  const replaced = new Map<string, number>();
  const calls = rootNode.findAll(CALL);
  for (const call of calls) {
    const record = call.getMatch("R")?.text() ?? "";
    const owner = ROOT_NAME.exec(record)?.[0] ?? "";
    const tuple = OWNING_TUPLES.get(owner);
    if (tuple !== undefined) {
      edits.push(call.replace(`${tuple}${record.slice(owner.length)}`));
      replaced.set(owner, (replaced.get(owner) ?? 0) + 1);
    }
  }
  if (edits.length === 0) {
    return Promise.resolve(null);
  }
  const helperGone = edits.length === calls.length;
  for (const imports of rootNode.findAll({ rule: { kind: "named_imports" } })) {
    const names = imports.findAll({ rule: { kind: "import_specifier" } }).map((specifier) => specifier.text());
    const next = rewrittenNames(names, rootNode, replaced, helperGone);
    if (next.join() !== names.join()) {
      edits.push(importEdit(imports, next));
    }
  }
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
