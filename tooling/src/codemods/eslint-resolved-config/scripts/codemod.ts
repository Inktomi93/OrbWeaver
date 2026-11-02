// Routes `const config = await eslint.calculateConfigForFile(file)` through the typed `resolvedConfig` reader
// (tests/tooling/_eslint-config.ts), then drops the optional chains and the `?? {}` the typed result no longer needs.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const CALL = "$ENGINE.calculateConfigForFile($FILE)";
const READ = {
  rule: { kind: "variable_declarator", has: { field: "value", kind: "await_expression", has: { kind: "call_expression", pattern: CALL } } },
} as const;

const TOOLING_DIR = "tests/tooling/";
const HELPER = "_eslint-config.ts";
const PIECES = new Set(["plugins", "rules"]);

interface Root {
  readonly name: string;
  readonly piece: string | null;
}

export const getSelector: GetSelector<TS> = () => READ;

function helperSpecifier(filename: string): string {
  const at = filename.lastIndexOf(TOOLING_DIR);
  if (at === -1) {
    return `./${HELPER}`;
  }
  const depth = filename.slice(at + TOOLING_DIR.length).split("/").length - 1;
  return `${depth === 0 ? "./" : "../".repeat(depth)}${HELPER}`;
}

/** The identifier at the root of `name`, `name.plugins`, `name?.rules` and the like, or null for any other expression. */
function chainRoot(node: SgNode<TS> | null | undefined): Root | null {
  if (node === null || node === undefined) {
    return null;
  }
  if (node.is("identifier")) {
    return { name: node.text(), piece: null };
  }
  const object = node.is("member_expression") ? node.field("object") : null;
  const property = node.field("property");
  if (object === null || property === null || !PIECES.has(property.text()) || !object.is("identifier")) {
    return null;
  }
  return { name: object.text(), piece: property.text() };
}

function readEdit(read: SgNode<TS>, names: Set<string>): Edit | null {
  const call = read.find({ rule: { pattern: CALL } });
  const engine = call?.getMatch("ENGINE");
  const file = call?.getMatch("FILE");
  const name = read.field("name");
  if (!(call && engine && file && name)) {
    return null;
  }
  names.add(name.text());
  const range = call.range();
  return { startPos: range.start.index, endPos: range.end.index, insertedText: `resolvedConfig(${engine.text()}, ${file.text()})` };
}

/** `config?.plugins ?? {}` becomes `config.plugins`; the typed reader always returns the pieces. */
function emptyFallbackEdits(rootNode: SgNode<TS>, names: Set<string>): { edits: Edit[]; spans: { start: number; end: number }[] } {
  const edits: Edit[] = [];
  const spans: { start: number; end: number }[] = [];
  for (const expression of rootNode.findAll({ rule: { kind: "binary_expression", regex: String.raw`\?\?\s*\{\s*\}$` } })) {
    const base = chainRoot(expression.field("left"));
    if (base === null || base.piece === null || !names.has(base.name) || expression.field("right")?.text().replaceAll(/\s/g, "") !== "{}") {
      continue;
    }
    const range = expression.range();
    spans.push({ start: range.start.index, end: range.end.index });
    edits.push({ startPos: range.start.index, endPos: range.end.index, insertedText: `${base.name}.${base.piece}` });
  }
  return { edits, spans };
}

/** `config?.rules` and `config?.rules?.[x]` lose the `?.` the typed pieces make dead; `?.` on a rule entry stays. */
function chainEdit(chain: SgNode<TS>, names: Set<string>): Edit | null {
  const owner = chain.parent();
  const base = chainRoot(owner?.field("object"));
  if (!owner || base === null || !names.has(base.name)) {
    return null;
  }
  const at = chain.range();
  if (owner.is("member_expression") && base.piece === null) {
    return { startPos: at.start.index, endPos: at.end.index, insertedText: "." };
  }
  if (owner.is("subscript_expression") && base.piece === "rules") {
    return { startPos: at.start.index, endPos: at.end.index, insertedText: "" };
  }
  return null;
}

function importEdit(rootNode: SgNode<TS>, filename: string): Edit | null {
  const last = rootNode.findAll({ rule: { kind: "import_statement" } }).at(-1);
  if (last === undefined) {
    return null;
  }
  const end = last.range().end.index;
  return { startPos: end, endPos: end, insertedText: `\nimport { resolvedConfig } from "${helperSpecifier(filename)}";` };
}

const codemod: Codemod<TS> = (root, options) => {
  const rootNode = root.root();
  const names = new Set<string>();
  const edits: Edit[] = [];
  for (const read of options.matches ?? rootNode.findAll(READ)) {
    const edit = readEdit(read, names);
    if (edit !== null) {
      edits.push(edit);
    }
  }
  if (names.size === 0) {
    return Promise.resolve(null);
  }
  const fallback = emptyFallbackEdits(rootNode, names);
  edits.push(...fallback.edits);
  for (const chain of rootNode.findAll({ rule: { kind: "optional_chain" } })) {
    const at = chain.range();
    const inside = fallback.spans.some((span) => at.start.index >= span.start && at.end.index <= span.end);
    const edit = inside ? null : chainEdit(chain, names);
    if (edit !== null) {
      edits.push(edit);
    }
  }
  const added = importEdit(rootNode, root.filename());
  if (added !== null) {
    edits.push(added);
  }
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
