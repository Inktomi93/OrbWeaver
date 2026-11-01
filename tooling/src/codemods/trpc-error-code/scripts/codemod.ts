// Rewrites the hand cast `(error as { data?: { code?: string } }).data?.code` to the `trpcErrorCode(error)` helper.
// Covers the inline read, the `?.`-chained read on a `| null | undefined` cast, and a `const data = (…).data` local
// whose only reads are `data?.code`. A redundant `if (typeof … || !("data" in …)) return false;` guard goes with it.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const HELPER = "trpcErrorCode";
const HELPER_MODULE = "#lib";
const NEWLINE = 0x0a;
const SPACE = 0x20;

const CAST: RuleConfig<TS> = { rule: { kind: "as_expression" } };

/** Only files that cast to a `data` shape can change. */
export const getSelector: GetSelector<TS> = () => CAST;

// The two spellings of the cast type in the tree, compared without whitespace.
const CAST_TYPES = new Set(["{data?:{code?:string}}", "{data?:{code?:string}}|null|undefined"]);

const squash = (text: string): string => text.replaceAll(/\s+/g, "");

function isCodeCast(cast: SgNode<TS>): boolean {
  const type = cast.children().at(-1);
  return type !== undefined && CAST_TYPES.has(squash(type.text())) && cast.child(0)?.kind() === "identifier";
}

const isSame = (a: SgNode<TS> | null | undefined, b: SgNode<TS>): boolean => a !== null && a !== undefined && a.id() === b.id();

function propertyIs(member: SgNode<TS> | null | undefined, name: string): boolean {
  return member?.kind() === "member_expression" && member.field("property")?.text() === name;
}

/** The `.data` member of `(error as …).data`, else null. */
function dataMember(cast: SgNode<TS>): SgNode<TS> | null {
  const paren = cast.parent();
  const member = paren?.parent();
  if (paren?.kind() !== "parenthesized_expression" || !member || !propertyIs(member, "data") || !isSame(member.field("object"), paren)) {
    return null;
  }
  return member;
}

// The enclosing statement that sits directly in a block.
function statementOf(node: SgNode<TS>): SgNode<TS> | null {
  for (const ancestor of node.ancestors()) {
    if (ancestor.parent()?.kind() === "statement_block") {
      return ancestor;
    }
  }
  return null;
}

// `if (typeof e !== "object" || e === null || !("data" in e)) { return false; }` for the same subject.
function precedingGuard(statement: SgNode<TS>, subject: string): SgNode<TS> | null {
  const guard = statement.prev();
  if (guard?.kind() !== "if_statement") {
    return null;
  }
  const condition = squash(guard.field("condition")?.text() ?? "");
  const expected = `(typeof${subject}!=="object"||${subject}===null||!("data"in${subject}))`;
  return condition === expected && squash(guard.field("consequence")?.text() ?? "") === "{returnfalse;}" ? guard : null;
}

function deleteLine(node: SgNode<TS>, bytes: Uint8Array): Edit {
  const { start, end } = node.range();
  // Take the statement's indentation with its line, or the next statement inherits it.
  let startPos = start.index;
  while (bytes[startPos - 1] === SPACE) {
    startPos -= 1;
  }
  return { startPos, endPos: bytes[end.index] === NEWLINE ? end.index + 1 : end.index, insertedText: "" };
}

interface Rewrite {
  readonly edits: readonly Edit[];
}

// `const data = (error as …).data;` read only as `data?.code` in the same block.
function localRewrite(data: SgNode<TS>, subject: string, bytes: Uint8Array): Rewrite | null {
  const declarator = data.parent();
  const declaration = declarator?.parent();
  const block = declaration?.parent();
  if (
    declarator?.kind() !== "variable_declarator" ||
    !isSame(declarator.field("value"), data) ||
    declaration?.kind() !== "lexical_declaration" ||
    block?.kind() !== "statement_block"
  ) {
    return null;
  }
  const name = declarator.field("name")?.text() ?? "";
  const declarationEnd = declaration.range().end.index;
  const reads = block.findAll({ rule: { kind: "identifier", regex: `^${name}$` } }).filter((read) => read.range().start.index >= declarationEnd);
  const members: SgNode<TS>[] = [];
  for (const read of reads) {
    const member = read.parent();
    if (member === null || !propertyIs(member, "code") || !isSame(member.field("object"), read)) {
      return null;
    }
    members.push(member);
  }
  if (members.length === 0) {
    return null;
  }
  const edits: Edit[] = members.map((member) => member.replace(`${HELPER}(${subject})`));
  edits.push(deleteLine(declaration, bytes));
  const guard = precedingGuard(declaration, subject);
  if (guard !== null) {
    edits.push(deleteLine(guard, bytes));
  }
  return { edits };
}

function rewriteCast(cast: SgNode<TS>, bytes: Uint8Array): Rewrite | null {
  const data = dataMember(cast);
  if (data === null) {
    return null;
  }
  const subject = cast.child(0)?.text() ?? "";
  const code = data.parent();
  if (propertyIs(code, "code") && isSame(code?.field("object"), data)) {
    const edits: Edit[] = [(code as SgNode<TS>).replace(`${HELPER}(${subject})`)];
    const statement = statementOf(data);
    const guard = statement === null ? null : precedingGuard(statement, subject);
    if (guard !== null) {
      edits.push(deleteLine(guard, bytes));
    }
    return { edits };
  }
  return localRewrite(data, subject, bytes);
}

// Adds the helper to an existing `#lib` value import, or a new import line after the last import.
function importEdit(rootNode: SgNode<TS>): Edit | null {
  const imports = rootNode.findAll({ rule: { kind: "import_statement" } });
  const existing = imports.find((statement) => {
    const source = statement
      .field("source")
      ?.find({ rule: { kind: "string_fragment" } })
      ?.text();
    return source === HELPER_MODULE && !statement.children().some((child) => child.kind() === "type");
  });
  if (existing !== undefined) {
    const specifiers = existing.find({ rule: { kind: "named_imports" } })?.findAll({ rule: { kind: "import_specifier" } }) ?? [];
    const last = specifiers.at(-1);
    if (last === undefined || specifiers.some((specifier) => specifier.text() === HELPER)) {
      return null;
    }
    const { end } = last.range();
    return { startPos: end.index, endPos: end.index, insertedText: `, ${HELPER}` };
  }
  const lastImport = imports.at(-1);
  const at = lastImport === undefined ? 0 : lastImport.range().end.index;
  const line = `import { ${HELPER} } from "${HELPER_MODULE}";`;
  return { startPos: at, endPos: at, insertedText: lastImport === undefined ? `${line}\n` : `\n${line}` };
}

const codemod: Codemod<TS> = (root) => {
  const rootNode = root.root();
  const bytes = new TextEncoder().encode(rootNode.text());
  const edits: Edit[] = [];
  for (const cast of rootNode.findAll(CAST).filter(isCodeCast)) {
    const rewrite = rewriteCast(cast, bytes);
    if (rewrite !== null) {
      edits.push(...rewrite.edits);
    }
  }
  if (edits.length === 0) {
    return Promise.resolve(null);
  }
  const added = importEdit(rootNode);
  if (added !== null) {
    edits.push(added);
  }
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
