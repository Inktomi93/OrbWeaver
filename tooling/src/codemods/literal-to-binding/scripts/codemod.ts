// Rewrites an exact string literal, JSX text, or an expression matching an ast-grep pattern, to a production binding in
// the files a plan lists, importing the binding once.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
// The TSX grammar is a superset; the TypeScript step's nodes carry the same kinds.
import type TS from "codemod:ast-grep/langs/tsx";
import { readFileSync } from "fs";
import { join } from "path";

// The plan lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_PLAN_FILE = "codemod-literal-bindings.json";

interface LiteralRewrite {
  /** The string's exact text, without quotes. Set `literal` or `pattern`, not both. */
  readonly literal?: string;
  /** An ast-grep pattern for a hand-built expression the binding replaces. */
  readonly pattern?: string;
  /** What replaces the match: the binding, or a call on it. A `pattern` rewrite may name its captures, as `label($ROOM)`. */
  readonly expression: string;
  /** The name the expression needs in scope. */
  readonly binding: string;
  /** The module that exports the binding. */
  readonly from: string;
  /** Paths relative to the target directory; the rewrite is a decision per file, never a sweep. */
  readonly files: readonly string[];
  /** Further names the expression needs in scope, each with its module, as `queryFailedLabel(CORPUS_READ_LABELS.search)` does. */
  readonly also?: readonly ExtraBinding[];
}

interface ExtraBinding {
  readonly binding: string;
  readonly from: string;
}

// A string in a type position or a module specifier stays text; a property key is a name, not a value.
const STRING_VALUE: RuleConfig<TS> = {
  rule: {
    kind: "string",
    not: { any: [{ inside: { kind: "import_statement" } }, { inside: { kind: "export_statement" } }, { inside: { kind: "literal_type" } }] },
  },
};

const JSX_TEXT: RuleConfig<TS> = { rule: { kind: "jsx_text" } };

/** Every string literal that could be a value, and every JSX text run; the plan decides which files and texts change. */
export const getSelector: GetSelector<TS> = () => ({ rule: { any: [STRING_VALUE.rule, JSX_TEXT.rule] } });

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
  return {
    ...(literal === undefined ? {} : { literal }),
    ...(pattern === undefined ? {} : { pattern }),
    expression,
    binding,
    from,
    files: listed,
    also: parseAlso((entry as Record<string, unknown>)["also"], planFile, index),
  };
}

function parseAlso(also: unknown, planFile: string, index: number): readonly ExtraBinding[] {
  if (also === undefined) {
    return [];
  }
  if (!Array.isArray(also)) {
    throw new Error(`${planFile}: rewrite ${index} has an also that is not a list`);
  }
  return also.map((extra: unknown) => {
    if (extra === null || typeof extra !== "object") {
      throw new Error(`${planFile}: rewrite ${index} lists an also entry that is not an object`);
    }
    const binding = stringField(extra, "binding");
    const from = stringField(extra, "from");
    if (binding === undefined || from === undefined) {
      throw new Error(`${planFile}: rewrite ${index} lists an also entry without binding and from`);
    }
    return { binding, from };
  });
}

// The rewrite's own binding, then each extra name its expression reads. One name is one import: the same binding
// asked for from two modules is a plan error, not a choice the codemod makes.
function need(needed: Map<string, LiteralRewrite>, rewrite: LiteralRewrite): void {
  const wanted = [rewrite, ...(rewrite.also ?? []).map((extra) => ({ ...rewrite, binding: extra.binding, from: extra.from }))];
  for (const entry of wanted) {
    const earlier = needed.get(entry.binding);
    if (earlier !== undefined && earlier.from !== entry.from) {
      throw new Error(`${entry.expression}: ${entry.binding} is imported from both ${earlier.from} and ${entry.from}`);
    }
    needed.set(entry.binding, entry);
  }
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

// A label-producing call takes the pieces the hand-built string interpolated: `$NAME` in the expression is the text the
// pattern captured under that name.
function withCaptures(expression: string, matched: SgNode<TS>): string {
  return expression.replace(/\$([A-Z][A-Z0-9_]*)/gu, (token, name: string) => matched.getMatch(name)?.text() ?? token);
}

// The expression spells the binding by its exported name, so only a specifier that binds that name locally puts it in
// scope: `import { X as Y }` binds `Y`, and the file still needs `X`. A local `X` that is some other export's alias
// would make the rewrite read the wrong value, so it stops the run.
function importsBinding(statements: readonly SgNode<TS>[], binding: string): boolean {
  return statements.some((statement) =>
    statement.findAll({ rule: { kind: "import_specifier" } }).some((specifier) => {
      const imported = specifier.field("name")?.text();
      const local = specifier.field("alias")?.text() ?? imported;
      if (local === binding && imported !== binding) {
        throw new Error(`${binding} is already the local name of ${imported ?? "another import"}`);
      }
      return local === binding;
    }),
  );
}

interface Planned {
  readonly edits: Edit[];
  readonly needed: Map<string, LiteralRewrite>;
}

function literalEdits(rootNode: SgNode<TS>, rewrites: readonly LiteralRewrite[], { edits, needed }: Planned): void {
  for (const node of rootNode.findAll(STRING_VALUE)) {
    const text = node.text().slice(1, -1);
    const rewrite = rewrites.find((entry) => entry.literal === text);
    if (rewrite !== undefined && !isPropertyKey(node)) {
      // A JSX attribute value takes an expression only inside braces.
      const braced = node.parent()?.kind() === "jsx_attribute";
      edits.push(node.replace(braced ? `{${rewrite.expression}}` : rewrite.expression));
      need(needed, rewrite);
    }
  }
}

function jsxTextEdits(rootNode: SgNode<TS>, rewrites: readonly LiteralRewrite[], { edits, needed }: Planned): void {
  for (const node of rootNode.findAll(JSX_TEXT)) {
    const raw = node.text();
    const rewrite = rewrites.find((entry) => entry.literal === raw.trim());
    if (rewrite !== undefined && rewrite.literal !== undefined) {
      const at = raw.indexOf(rewrite.literal);
      edits.push(node.replace(`${raw.slice(0, at)}{${rewrite.expression}}${raw.slice(at + rewrite.literal.length)}`));
      need(needed, rewrite);
    }
  }
}

function patternEdits(rootNode: SgNode<TS>, rewrites: readonly LiteralRewrite[], { edits, needed }: Planned): void {
  for (const rewrite of rewrites) {
    if (rewrite.pattern === undefined) {
      continue;
    }
    for (const node of rootNode.findAll({ rule: { pattern: rewrite.pattern } })) {
      edits.push(node.replace(withCaptures(rewrite.expression, node)));
      need(needed, rewrite);
    }
  }
}

// The last specifier of a value import from `from`; a type-only import cannot carry a value binding.
function valueImportTail(statements: readonly SgNode<TS>[], from: string): SgNode<TS> | undefined {
  const statement = statements.find(
    (candidate) => candidate.field("source")?.text().slice(1, -1) === from && !candidate.children().some((child) => child.kind() === "type"),
  );
  return statement?.findAll({ rule: { kind: "import_specifier" } }).at(-1);
}

// A module the file already imports from takes the new bindings on that line; any other module gets one new line.
function importEdits(rootNode: SgNode<TS>, needed: ReadonlyMap<string, LiteralRewrite>): Edit[] {
  const statements = rootNode.findAll({ rule: { kind: "import_statement" } });
  const last = statements.at(-1);
  const missing = [...needed.values()].filter((entry) => !importsBinding(statements, entry.binding));
  if (missing.length === 0 || last === undefined) {
    return [];
  }
  const edits: Edit[] = [];
  const lines: string[] = [];
  for (const [from, entries] of Map.groupBy(missing, (entry) => entry.from)) {
    const names = entries.map((entry) => entry.binding).join(", ");
    const tail = valueImportTail(statements, from);
    if (tail === undefined) {
      lines.push(`\nimport { ${names} } from "${from}";`);
    } else {
      const at = tail.range().end.index;
      edits.push({ startPos: at, endPos: at, insertedText: `, ${names}` });
    }
  }
  if (lines.length > 0) {
    const at = last.range().end.index;
    edits.push({ startPos: at, endPos: at, insertedText: lines.join("") });
  }
  return edits;
}

const codemod: Codemod<TS> = (root, options) => {
  const plan = readPlan(options.targetDir, options.params["plan"] ?? DEFAULT_PLAN_FILE);
  const file = root.relativeFilename();
  const rewrites = plan.filter((entry) => entry.files.includes(file));
  if (rewrites.length === 0) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const planned: Planned = { edits: [], needed: new Map() };
  literalEdits(rootNode, rewrites, planned);
  jsxTextEdits(rootNode, rewrites, planned);
  patternEdits(rootNode, rewrites, planned);
  if (planned.edits.length === 0) {
    return Promise.resolve(null);
  }
  return Promise.resolve(rootNode.commitEdits([...planned.edits, ...importEdits(rootNode, planned.needed)]));
};

export default codemod;
