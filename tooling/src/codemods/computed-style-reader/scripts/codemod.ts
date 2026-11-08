// Replaces a spec's local `style(locator, property)` computed-style reader with the testkit's `computedStyle`: the
// declaration goes, each `style(...)` call is renamed, and one import from the spec door is added.
import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const DOOR = "@orb/testkit/browser/spec";
const HELPER = "computedStyle";
// Only the plain reader: one property read by name, optionally on a pseudo-element, and nothing else in the body.
const READER_BODY = "getComputedStyle\\(element(?:, ?\\w+)?\\)\\.getPropertyValue\\(name\\)";

const READER: RuleConfig<TSX> = {
  rule: {
    any: [
      { kind: "function_declaration", has: { field: "name", regex: "^style$" }, regex: READER_BODY },
      { kind: "lexical_declaration", has: { kind: "variable_declarator", has: { field: "name", regex: "^style$" } }, regex: READER_BODY },
    ],
  },
};

const STYLE_CALL: RuleConfig<TSX> = { rule: { kind: "call_expression", has: { field: "function", kind: "identifier", regex: "^style$" } } };
const LAST_IMPORT: RuleConfig<TSX> = { rule: { kind: "import_statement" } };
const NEWLINE_BYTE = 0x0a;

export const getSelector: GetSelector<TSX> = () => READER;

const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const readers = rootNode.findAll(READER);
  if (readers.length !== 1) {
    return Promise.resolve(null);
  }
  const [reader] = readers as [SgNode<TSX>];
  const bytes = new TextEncoder().encode(rootNode.text());
  const { start, end } = reader.range();
  // Drop the declaration's line and the blank line after it, so no gap is left.
  let endPos = bytes[end.index] === NEWLINE_BYTE ? end.index + 1 : end.index;
  endPos = bytes[endPos] === NEWLINE_BYTE ? endPos + 1 : endPos;
  const edits: Edit[] = [{ startPos: start.index, endPos, insertedText: "" }];
  for (const call of rootNode.findAll(STYLE_CALL)) {
    const callee = call.field("function");
    if (callee !== null) {
      edits.push(callee.replace(HELPER));
    }
  }
  const imports = rootNode.findAll(LAST_IMPORT);
  const anchor = imports.at(-1);
  if (anchor === undefined) {
    return Promise.resolve(null);
  }
  const at = anchor.range().end.index;
  edits.push({ startPos: at, endPos: at, insertedText: `\nimport { ${HELPER} } from "${DOOR}";` });
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
