// Removes the per-file `composed-real` warm import from integration files; the integration project's `setupFiles` owns the warm.
import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

// Testkit's own tests import the warm relatively; everything outside testkit uses the package subpath.
const WARM_IMPORT = {
  rule: {
    kind: "import_statement",
    has: { field: "source", regex: "^[\"'](?:@orb/testkit/node/|(?:\\.\\.?/)+)composed-real\\.ts[\"']$" },
  },
} as const;

const NEWLINE_BYTE = 0x0a;

/** Pre-filter so the transform runs only for files that carry the import. */
export const getSelector: GetSelector<TS> = () => WARM_IMPORT;

// `Codemod` returns a Promise; nothing here awaits, so resolve explicitly instead of marking the function async.
const codemod: Codemod<TS> = (root, options) => {
  const rootNode = root.root();
  const matches = options.matches ?? rootNode.findAll(WARM_IMPORT);
  if (matches.length === 0) {
    return Promise.resolve(null);
  }
  // `range().index` and Edit positions are UTF-8 byte offsets; a string index drifts after any multibyte character.
  const bytes = new TextEncoder().encode(rootNode.text());
  const edits: Edit[] = matches.map((node) => {
    const { start, end } = node.range();
    // Remove the statement's own line, not just the statement, so no blank line remains.
    const endPos = bytes[end.index] === NEWLINE_BYTE ? end.index + 1 : end.index;
    return { startPos: start.index, endPos, insertedText: "" };
  });
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
