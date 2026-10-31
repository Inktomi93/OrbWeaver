// Rewrites an exact string literal, or an expression matching an ast-grep pattern, to a production binding in the files
// a plan lists, importing the binding once.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

// The plan lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_PLAN_FILE = "codemod-literal-bindings.json";

interface LiteralRewrite {
  /** The string's exact text, without quotes. Set `literal` or `pattern`, not both. */
  readonly literal?: string;
  /** An ast-grep pattern for a hand-built expression the binding replaces. */
  readonly pattern?: string;
  /** What replaces the match: the binding, or a call on it. */
  readonly expression: string;
  /** The name the expression needs in scope. */
  readonly binding: string;
  /** The module that exports the binding. */
  readonly from: string;
  /** Paths relative to the target directory; the rewrite is a decision per file, never a sweep. */
  readonly files: readonly string[];
}

// A string in a type position or a module specifier stays text; a property key is a name, not a value.
const STRING_VALUE: RuleConfig<TS> = {
  rule: {
    kind: "string",
    not: { any: [{ inside: { kind: "import_statement" } }, { inside: { kind: "export_statement" } }, { inside: { kind: "literal_type" } }] },
  },
};

/** Every string literal that could be a value; the plan decides which files and texts change. */
export const getSelector: GetSelector<TS> = () => STRING_VALUE;

/** The string under `key`, or undefined when the entry holds none. */
function stringField(entry: object, key: string): string | undefined {
  const value: unknown = (entry as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function parseRewrite(entry: unknown, planFile: string, index: number): LiteralRewrite {
  if (entry === null || typeof entry !== "object") {
    throw new Error(`${planFile}: rewrite ${index} is not an object`);
  }
  const literal = stringField(entry, "literal");
  const pattern = stringField(entry, "pattern");
  const expression = stringField(entry, "expression");
  const binding = stringField(entry, "binding");
  const from = stringField(entry, "from");
  const files: unknown = (entry as Record<string, unknown>)["files"];
  if ((literal === undefined && pattern === undefined) || expression === undefined || binding === undefined || from === undefined || !Array.isArray(files)) {
    throw new Error(`${planFile}: rewrite ${index} needs literal or pattern, expression, binding, from and files`);
  }
  const listed = files.map((file: unknown) => {
    if (typeof file !== "string") {
      throw new Error(`${planFile}: rewrite ${index} lists a non-string file`);
    }
    return file;
  });
  return { ...(literal === undefined ? {} : { literal }), ...(pattern === undefined ? {} : { pattern }), expression, binding, from, files: listed };
}

function readPlan(targetDir: string, planFile: string): readonly LiteralRewrite[] {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, planFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || !("rewrites" in parsed) || !Array.isArray(parsed.rewrites)) {
    throw new Error(`${planFile}: expected { "rewrites": [...] }`);
  }
  return parsed.rewrites.map((entry: unknown, index: number) => parseRewrite(entry, planFile, index));
}

function isPropertyKey(node: SgNode<TS>): boolean {
  const parent = node.parent();
  return parent !== null && parent.kind() === "pair" && parent.field("key")?.range().start.index === node.range().start.index;
}

function importsBinding(statements: readonly SgNode<TS>[], binding: string): boolean {
  return statements.some((statement) =>
    statement.findAll({ rule: { kind: "import_specifier" } }).some((specifier) => specifier.field("name")?.text() === binding),
  );
}

const codemod: Codemod<TS> = (root, options) => {
  const plan = readPlan(options.targetDir, options.params["plan"] ?? DEFAULT_PLAN_FILE);
  const file = root.relativeFilename();
  const rewrites = plan.filter((entry) => entry.files.includes(file));
  if (rewrites.length === 0) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const edits: Edit[] = [];
  const needed = new Map<string, LiteralRewrite>();
  for (const node of options.matches ?? rootNode.findAll(STRING_VALUE)) {
    const text = node.text().slice(1, -1);
    const rewrite = rewrites.find((entry) => entry.literal === text);
    if (rewrite !== undefined && !isPropertyKey(node)) {
      edits.push(node.replace(rewrite.expression));
      needed.set(rewrite.binding, rewrite);
    }
  }
  for (const rewrite of rewrites) {
    if (rewrite.pattern === undefined) {
      continue;
    }
    for (const node of rootNode.findAll({ rule: { pattern: rewrite.pattern } })) {
      edits.push(node.replace(rewrite.expression));
      needed.set(rewrite.binding, rewrite);
    }
  }
  if (edits.length === 0) {
    return Promise.resolve(null);
  }
  const statements = rootNode.findAll({ rule: { kind: "import_statement" } });
  const last = statements.at(-1);
  const missing = [...needed.values()].filter((entry) => !importsBinding(statements, entry.binding));
  if (missing.length > 0 && last !== undefined) {
    const at = last.range().end.index;
    edits.push({ startPos: at, endPos: at, insertedText: missing.map((entry) => `\nimport { ${entry.binding} } from "${entry.from}";`).join("") });
  }
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
