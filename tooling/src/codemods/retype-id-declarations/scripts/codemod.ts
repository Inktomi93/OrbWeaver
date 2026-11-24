// Retypes id-named plain `string` declarations as the brand `pnpm brand-flow` saw flow into them.
// The row list is the proof: this transform has no type information, so it rewrites only the listed declarations, and
// `pnpm typecheck` then judges every site the new type reaches. A row whose declaration is not a parameter, property or
// variable with a `string` in its type, or whose name or line differs, is skipped and counted.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_ROWS_FILE = "codemod-brand-rows.json";
const STRING_TYPE = "string";
const TYPE_NAME = /^[A-Z]\w*$/u;
const REST_PREFIX = /^\.\.\./u;

/** One declaration to retype: where it is, what it is called, the brand it holds and where that brand is imported from. */
interface Row {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly brand: string;
  /** The module the brand type is imported from, or null when the file declares it. */
  readonly module: string | null;
}

const DECLARATIONS: RuleConfig<TS> = {
  rule: {
    any: [
      { kind: "required_parameter" },
      { kind: "optional_parameter" },
      { kind: "property_signature" },
      { kind: "public_field_definition" },
      { kind: "variable_declarator" },
    ],
  },
};

const IMPORT_STATEMENT: RuleConfig<TS> = { rule: { kind: "import_statement" } };
const STRING_NODE: RuleConfig<TS> = { rule: { kind: "predefined_type", regex: `^${STRING_TYPE}$` } };

export const getSelector: GetSelector<TS> = () => DECLARATIONS;

const retyped = useMetricAtom("retype-id-declarations.retyped");
const skipped = useMetricAtom("retype-id-declarations.skipped");

function readRows(targetDir: string, rowsFile: string): readonly Row[] {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, rowsFile), "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${rowsFile}: expected an array of { file, line, name, brand, module }`);
  }
  return parsed.map((row: Partial<Row>) => {
    if (typeof row.file !== "string" || typeof row.line !== "number" || typeof row.name !== "string" || typeof row.brand !== "string") {
      throw new Error(`${rowsFile}: a row needs file, line, name and brand`);
    }
    return { file: row.file, line: row.line, name: row.name, brand: row.brand, module: row.module ?? null };
  });
}

// The identifier a declaration binds: a parameter's `pattern` (a rest parameter's carries its `...`), a property's or variable's `name`.
function nameOf(declaration: SgNode<TS>): string | null {
  return (declaration.field("pattern") ?? declaration.field("name"))?.text().replace(REST_PREFIX, "") ?? null;
}

function importedNames(rootNode: SgNode<TS>): ReadonlySet<string> {
  return new Set(rootNode.findAll({ rule: { kind: "import_specifier" } }).map((specifier) => specifier.field("name")?.text() ?? specifier.text()));
}

// One `import type` line per module, all in one edit: after the last import, or before the first statement of a file with
// none, so a leading comment stays on top. Biome's import organiser places them.
function importEdit(rootNode: SgNode<TS>, imports: ReadonlyMap<string, readonly string[]>): Edit | null {
  const lines = [...imports]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([module, brands]) => `import type { ${brands.toSorted().join(", ")} } from "${module}";`);
  const last = rootNode.findAll(IMPORT_STATEMENT).at(-1);
  if (lines.length === 0) {
    return null;
  }
  if (last !== undefined) {
    const end = last.range().end.index;
    return { startPos: end, endPos: end, insertedText: `\n${lines.join("\n")}` };
  }
  const start = firstStatementStart(rootNode);
  return start === null ? null : { startPos: start, endPos: start, insertedText: `${lines.join("\n")}\n\n` };
}

// Where the first statement starts, taking in the comments written directly above it: a header comment set off by a blank
// line stays on top, and a doc comment stays with its declaration.
function firstStatementStart(rootNode: SgNode<TS>): number | null {
  const children = rootNode.children();
  const at = children.findIndex((child) => child.kind() !== "comment");
  const first = children[at];
  if (first === undefined) {
    return null;
  }
  let start = first.range().start;
  for (let index = at - 1; index >= 0; index -= 1) {
    const comment = children[index]?.range();
    if (comment === undefined || comment.end.line + 1 < start.line) {
      break;
    }
    start = comment.start;
  }
  return start.index;
}

// The edits that retype one row's declaration, or none when the row names no `string` slot.
function retypeEdits(row: Row, declarations: readonly SgNode<TS>[]): readonly Edit[] {
  const declaration = declarations.find((node) => node.range().start.line + 1 === row.line && nameOf(node) === row.name);
  const annotation = declaration?.children().find((child) => child.kind() === "type_annotation");
  const strings = annotation?.findAll(STRING_NODE) ?? [];
  if (strings.length === 0) {
    skipped.increment({ reason: declaration === undefined ? "no-declaration" : "no-string" });
    return [];
  }
  retyped.increment();
  return strings.map((node) => node.replace(row.brand));
}

// A brand a row names may be a union (`A | B`) or carry a literal member (`A | ""`): import each type name, never the text.
function missingImports(rows: readonly Row[], present: ReadonlySet<string>): ReadonlyMap<string, readonly string[]> {
  const byModule = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const member of row.brand.split("|").map((part) => part.trim())) {
      if (row.module !== null && TYPE_NAME.test(member) && !present.has(member)) {
        byModule.set(row.module, (byModule.get(row.module) ?? new Set<string>()).add(member));
      }
    }
  }
  return new Map([...byModule].map(([module, members]) => [module, [...members]]));
}

const codemod: Codemod<TS> = (root, options) => {
  const file = root.relativeFilename();
  const rows = readRows(options.targetDir, options.params["rows"] ?? DEFAULT_ROWS_FILE).filter((row) => row.file === file);
  if (rows.length === 0) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const declarations = rootNode.findAll(DECLARATIONS);
  const planned = rows.map((row) => ({ row, retypes: retypeEdits(row, declarations) })).filter(({ retypes }) => retypes.length > 0);
  const edits: Edit[] = planned.flatMap(({ retypes }) => retypes);
  const imports = importEdit(
    rootNode,
    missingImports(
      planned.map(({ row }) => row),
      importedNames(rootNode),
    ),
  );
  if (imports !== null) {
    edits.push(imports);
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
