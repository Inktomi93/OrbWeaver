// Replaces a file-local top-level constant with a binding from one shared home in the files a plan lists: the declaration goes
// with the comment above it, each reference becomes the expression, and the binding is imported once.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

// The plan lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_PLAN_FILE = "codemod-local-constants.json";

interface ConstantMove {
  /** The local constant's name. */
  readonly name: string;
  /** What replaces each reference: the binding, or a member of it. */
  readonly expression: string;
  /** The name the expression needs in scope. */
  readonly binding: string;
  /** The module that exports the binding. */
  readonly from: string;
  /** Paths relative to the target directory; the move is a decision per file, never a sweep. */
  readonly files: readonly string[];
}

const TOP_LEVEL_CONST: RuleConfig<TS> = { rule: { kind: "lexical_declaration", inside: { kind: "program" } } };

/** Every top-level declaration; the plan decides which files and names change. */
export const getSelector: GetSelector<TS> = () => TOP_LEVEL_CONST;

function stringField(entry: object, key: string): string | undefined {
  const value: unknown = (entry as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function parseMove(entry: unknown, planFile: string, index: number): ConstantMove {
  if (entry === null || typeof entry !== "object") {
    throw new Error(`${planFile}: move ${index} is not an object`);
  }
  const name = stringField(entry, "name");
  const expression = stringField(entry, "expression");
  const binding = stringField(entry, "binding");
  const from = stringField(entry, "from");
  const files: unknown = (entry as Record<string, unknown>)["files"];
  if (name === undefined || expression === undefined || binding === undefined || from === undefined || !Array.isArray(files)) {
    throw new Error(`${planFile}: move ${index} needs name, expression, binding, from and files`);
  }
  return { name, expression, binding, from, files: files.map((file: unknown) => String(file)) };
}

function readPlan(targetDir: string, planFile: string): readonly ConstantMove[] {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, planFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || !("moves" in parsed) || !Array.isArray(parsed.moves)) {
    throw new Error(`${planFile}: expected { "moves": [...] }`);
  }
  return parsed.moves.map((entry: unknown, index: number) => parseMove(entry, planFile, index));
}

/** The one `const NAME = value;` declaration at the top level, or undefined when the file has none or another scope redeclares the name. */
function declarationOf(rootNode: SgNode<TS>, declarations: readonly SgNode<TS>[], name: string): SgNode<TS> | undefined {
  const declaredAs = rootNode.findAll({ rule: { kind: "variable_declarator" } }).filter((declarator) => declarator.field("name")?.text() === name);
  if (declaredAs.length !== 1) {
    return undefined;
  }
  return declarations.find((declaration) => {
    const declarators = declaration.findAll({ rule: { kind: "variable_declarator", inside: { kind: "lexical_declaration" } } });
    return declaration.text().startsWith("const ") && declarators.length === 1 && declarators.some((declarator) => declarator.field("name")?.text() === name);
  });
}

/** The comment lines that sit directly above the declaration, so the explanation leaves with the constant it explained. */
function leadingComments(declaration: SgNode<TS>): readonly SgNode<TS>[] {
  const comments: SgNode<TS>[] = [];
  let expectedLine = declaration.range().start.line;
  for (
    let before = declaration.prev();
    before !== null && before.kind() === "comment" && before.range().end.line === expectedLine - 1;
    before = before.prev()
  ) {
    comments.push(before);
    expectedLine = before.range().start.line;
  }
  return comments;
}

// Parents that make an identifier a binding, not a reference: a rewrite would replace the binding with an expression.
const BINDING_PARENTS: ReadonlySet<string> = new Set([
  "required_parameter",
  "optional_parameter",
  "function_declaration",
  "function_expression",
  "generator_function",
  "generator_function_declaration",
  "import_specifier",
  "import_clause",
  "namespace_import",
  "export_specifier",
  "catch_clause",
  "array_pattern",
  "rest_pattern",
  "assignment_pattern",
  "pair_pattern",
  "enum_declaration",
  "internal_module",
  "labeled_statement",
]);

const NAME_OCCURRENCE_KINDS = ["identifier", "shorthand_property_identifier", "shorthand_property_identifier_pattern"] as const;

/** Whether the name appears outside the declaration as something a plain rename cannot reach: a parameter, a destructured or shorthand
 *  property, an import or export binding, a function name. The move skips such a file whole rather than guess which scope each use is in. */
function isNameRebound(rootNode: SgNode<TS>, name: string, declaration: SgNode<TS>): boolean {
  const inside = declaration.range();
  return rootNode.findAll({ rule: { any: NAME_OCCURRENCE_KINDS.map((kind) => ({ kind, regex: `^${name}$` })) } }).some((occurrence) => {
    const at = occurrence.range().start.index;
    if (at >= inside.start.index && at < inside.end.index) {
      return false;
    }
    const parent = occurrence.parent();
    const arrowParameter = parent?.kind() === "arrow_function" && parent.field("parameter")?.range().start.index === at;
    return occurrence.kind() !== "identifier" || arrowParameter || (parent !== null && BINDING_PARENTS.has(parent.kind()));
  });
}

function importsBinding(statements: readonly SgNode<TS>[], binding: string): boolean {
  return statements.some((statement) =>
    statement.findAll({ rule: { kind: "import_specifier" } }).some((specifier) => specifier.field("name")?.text() === binding),
  );
}

/** The edit that imports each binding the file does not already have: after its last import, or above its first remaining statement when it has none. */
function importEdit(rootNode: SgNode<TS>, needed: ReadonlyMap<string, ConstantMove>, removed: ReadonlySet<number>): Edit | undefined {
  const statements = rootNode.findAll({ rule: { kind: "import_statement" } });
  const lines = [...needed.values()]
    .filter((entry) => !importsBinding(statements, entry.binding))
    .map((entry) => `import { ${entry.binding} } from "${entry.from}";`);
  if (lines.length === 0) {
    return undefined;
  }
  const last = statements.at(-1);
  if (last !== undefined) {
    const at = last.range().end.index;
    return { startPos: at, endPos: at, insertedText: lines.map((line) => `\n${line}`).join("") };
  }
  // A file with no import statement takes them above its first remaining statement, below any header comment.
  const first = rootNode.children().find((child) => child.kind() !== "comment" && !removed.has(child.range().start.index));
  const at = first?.range().start.index ?? 0;
  return { startPos: at, endPos: at, insertedText: `${lines.join("\n")}\n\n` };
}

const codemod: Codemod<TS> = (root, options) => {
  const plan = readPlan(options.targetDir, options.params["plan"] ?? DEFAULT_PLAN_FILE);
  const moves = plan.filter((entry) => entry.files.includes(root.relativeFilename()));
  if (moves.length === 0) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const declarations = rootNode.findAll(TOP_LEVEL_CONST);
  const edits: Edit[] = [];
  const removed = new Set<number>();
  const needed = new Map<string, ConstantMove>();
  for (const move of moves) {
    const declaration = declarationOf(rootNode, declarations, move.name);
    if (declaration === undefined || isNameRebound(rootNode, move.name, declaration)) {
      continue;
    }
    const inside = declaration.range();
    removed.add(inside.start.index);
    const first = leadingComments(declaration).at(-1) ?? declaration;
    edits.push({ startPos: first.range().start.index, endPos: inside.end.index, insertedText: "" });
    for (const reference of rootNode.findAll({ rule: { kind: "identifier", regex: `^${move.name}$` } })) {
      const at = reference.range().start.index;
      if (at < inside.start.index || at >= inside.end.index) {
        edits.push(reference.replace(move.expression));
      }
    }
    needed.set(move.binding, move);
  }
  if (edits.length === 0) {
    return Promise.resolve(null);
  }
  const insert = importEdit(rootNode, needed, removed);
  // First, so an insertion at the start of a deleted statement's neighbour is applied before the deletion that ends there.
  return Promise.resolve(rootNode.commitEdits(insert === undefined ? edits : [insert, ...edits]));
};

export default codemod;
