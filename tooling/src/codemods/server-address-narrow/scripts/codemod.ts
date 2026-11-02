// Replaces `server.address() as AddressInfo` with `listeningAddress(server)` (tests/tooling/_server-address.ts), which
// checks the TCP arm instead of asserting it. A now-unused `AddressInfo` import is left for Biome to report.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const ASSERTION = { rule: { kind: "as_expression", pattern: "$SERVER.address() as AddressInfo" } } as const;
const TOOLING_DIR = "tests/tooling/";
const HELPER = "_server-address.ts";

export const getSelector: GetSelector<TS> = () => ASSERTION;

function helperSpecifier(filename: string): string {
  const at = filename.lastIndexOf(TOOLING_DIR);
  if (at === -1) {
    return `./${HELPER}`;
  }
  const depth = filename.slice(at + TOOLING_DIR.length).split("/").length - 1;
  return `${depth === 0 ? "./" : "../".repeat(depth)}${HELPER}`;
}

function importEdit(rootNode: SgNode<TS>, filename: string): Edit | null {
  const last = rootNode.findAll({ rule: { kind: "import_statement" } }).at(-1);
  if (last === undefined) {
    return null;
  }
  const end = last.range().end.index;
  return { startPos: end, endPos: end, insertedText: `\nimport { listeningAddress } from "${helperSpecifier(filename)}";` };
}

const codemod: Codemod<TS> = (root, options) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  for (const assertion of options.matches ?? rootNode.findAll(ASSERTION)) {
    const server = assertion.getMatch("SERVER");
    if (server) {
      const range = assertion.range();
      edits.push({ startPos: range.start.index, endPos: range.end.index, insertedText: `listeningAddress(${server.text()})` });
    }
  }
  const added = edits.length === 0 ? null : importEdit(rootNode, root.filename());
  if (added !== null) {
    edits.push(added);
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
