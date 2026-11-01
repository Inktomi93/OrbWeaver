// Replaces `Object.keys(R) as (keyof typeof R)[]` with the testkit `keysOf(R)`, which checks each key instead of
// asserting the union.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const MUTABLE = { rule: { kind: "as_expression", pattern: "Object.keys($R) as (keyof typeof $R)[]" } } as const;
const READONLY = { rule: { kind: "as_expression", pattern: "Object.keys($R) as readonly (keyof typeof $R)[]" } } as const;
const ANY_ASSERTION = { rule: { kind: "as_expression" } } as const;
const KIT_DIR = "tests/support/";
const DOOR = "@orb/testkit/iso";
const HELPER = "iso/keys-of.ts";

export const getSelector: GetSelector<TS> = () => ANY_ASSERTION;

function importSpecifier(filename: string): string {
  const at = filename.lastIndexOf(KIT_DIR);
  if (at === -1) {
    return DOOR;
  }
  const from = filename
    .slice(at + KIT_DIR.length)
    .split("/")
    .slice(0, -1);
  const to = HELPER.split("/");
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) {
    shared++;
  }
  const up = from.length - shared;
  return `${up === 0 ? "./" : "../".repeat(up)}${to.slice(shared).join("/")}`;
}

function importEdit(rootNode: SgNode<TS>, specifier: string): Edit | null {
  const declarations = rootNode.findAll({ rule: { kind: "import_statement" } });
  // A type-only import cannot carry a value, so the helper gets its own statement beside it.
  const existing = declarations.find(
    (declaration) => declaration.field("source")?.text().slice(1, -1) === specifier && !declaration.text().startsWith("import type"),
  );
  const named = existing?.find({ rule: { kind: "named_imports" } });
  if (named !== undefined && named !== null) {
    if (named.text().includes("keysOf")) {
      return null;
    }
    const close = named.range().end.index - 1;
    return { startPos: close, endPos: close, insertedText: ", keysOf " };
  }
  const last = declarations.at(-1);
  const at = last === undefined ? 0 : last.range().end.index;
  return { startPos: at, endPos: at, insertedText: `\nimport { keysOf } from "${specifier}";` };
}

const codemod: Codemod<TS> = (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  for (const assertion of [...rootNode.findAll(MUTABLE), ...rootNode.findAll(READONLY)]) {
    const record = assertion.getMatch("R");
    if (record) {
      const range = assertion.range();
      edits.push({ startPos: range.start.index, endPos: range.end.index, insertedText: `keysOf(${record.text()})` });
    }
  }
  const added = edits.length === 0 ? null : importEdit(rootNode, importSpecifier(root.filename()));
  if (added !== null) {
    edits.push(added);
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
