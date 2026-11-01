// Vitest types every asymmetric matcher `any`. Nested in a fixture object or array it is an unsafe assignment, so
// the matcher passes through the testkit `asymmetric` helper, which hands it on as `unknown`.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const MATCHER = { rule: { kind: "call_expression", pattern: "expect.$NAME($$$ARGS)" } } as const;
const MATCHER_NAMES = new Set(["any", "anything", "objectContaining", "arrayContaining", "stringContaining", "stringMatching", "closeTo"]);

const NESTING_PARENTS = new Set(["pair", "array", "variable_declarator"]);
const KIT_DIR = "tests/support/";
const DOOR = "@orb/testkit/iso";
const HELPER = "iso/asymmetric.ts";

export const getSelector: GetSelector<TS> = () => MATCHER;

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

/** A matcher is wrapped only where it is the stored value, never as a pair key or a direct matcher argument. */
function isStoredValue(call: SgNode<TS>): boolean {
  if (!MATCHER_NAMES.has(call.getMatch("NAME")?.text() ?? "")) {
    return false;
  }
  const parent = call.parent();
  if (parent === null || !NESTING_PARENTS.has(parent.kind())) {
    return false;
  }
  return !parent.is("pair") || parent.field("value")?.id() === call.id();
}

function importEdit(rootNode: SgNode<TS>, specifier: string): Edit | null {
  const declarations = rootNode.findAll({ rule: { kind: "import_statement" } });
  // A type-only import cannot carry a value, so the helper gets its own statement beside it.
  const existing = declarations.find(
    (declaration) => declaration.field("source")?.text().slice(1, -1) === specifier && !declaration.text().startsWith("import type"),
  );
  const named = existing?.find({ rule: { kind: "named_imports" } });
  if (named !== undefined && named !== null) {
    if (named.text().includes("asymmetric")) {
      return null;
    }
    const close = named.range().end.index - 1;
    return { startPos: close, endPos: close, insertedText: ", asymmetric " };
  }
  const last = declarations.at(-1);
  const at = last === undefined ? 0 : last.range().end.index;
  return { startPos: at, endPos: at, insertedText: `\nimport { asymmetric } from "${specifier}";` };
}

const codemod: Codemod<TS> = (root, options) => {
  const rootNode = root.root();
  const calls = (options.matches ?? rootNode.findAll(MATCHER)).filter(isStoredValue);
  if (calls.length === 0) {
    return Promise.resolve(null);
  }
  const edits: Edit[] = [];
  for (const call of calls) {
    const range = call.range();
    edits.push({ startPos: range.start.index, endPos: range.start.index, insertedText: "asymmetric(" });
    edits.push({ startPos: range.end.index, endPos: range.end.index, insertedText: ")" });
  }
  const added = importEdit(rootNode, importSpecifier(root.filename()));
  if (added !== null) {
    edits.push(added);
  }
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
