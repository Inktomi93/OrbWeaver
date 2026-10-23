// Rewrites a bare string-literal union alias into the `as const` tuple plus derived union the type law requires.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

// Two or more string literals and nothing else. `\s` spans line breaks and a wrapped union may open with `|`.
const STRING_UNION = String.raw`^(\|\s*)?["'][^"']*["'](\s*\|\s*["'][^"']*["'])+$`;

const BARE_STRING_UNION_ALIAS = {
  rule: {
    kind: "type_alias_declaration",
    has: { field: "value", kind: "union_type", regex: STRING_UNION },
    not: { has: { kind: "type_parameters" } },
  },
} as const;

const DECLARATION_FILE = ".d.ts";

/** Pre-filter so the transform runs only for files that declare a bare string union. */
export const getSelector: GetSelector<TS> = () => BARE_STRING_UNION_ALIAS;

/** `UserRole` → `USER_ROLES`, `OverflowPolicy` → `OVERFLOW_POLICIES`; review the generated name in the diff. */
function tupleNameFor(typeName: string): string {
  const screaming = typeName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  if (/[^AEIOU]Y$/.test(screaming)) {
    return `${screaming.slice(0, -1)}IES`;
  }
  return `${screaming}S`;
}

/** Walk back over comments that sit directly above the statement so the tuple lands above them, not between them and the type. */
function insertionStart(statement: SgNode<TS>): number {
  let first = statement;
  let previous = statement.prev();
  while (previous !== null && previous.kind() === "comment" && previous.range().end.line + 1 >= first.range().start.line) {
    first = previous;
    previous = previous.prev();
  }
  return first.range().start.index;
}

const codemod: Codemod<TS> = (root, options) => {
  if (root.filename().endsWith(DECLARATION_FILE)) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const aliases = options.matches ?? rootNode.findAll(BARE_STRING_UNION_ALIAS);
  const edits: Edit[] = [];
  for (const alias of aliases) {
    const parent = alias.parent();
    const statement = parent?.is("export_statement") === true ? parent : alias;
    const exported = statement !== alias;
    // Nested aliases keep their shape; the tuple idiom is for module-level axes.
    if (statement.parent()?.kind() !== "program") {
      continue;
    }
    const name = alias.field("name");
    const value = alias.field("value");
    if (name === null || value === null) {
      continue;
    }
    // A union that opens with `|` parses as a nested union, so collect literals at any depth.
    const members = value.findAll({ rule: { kind: "literal_type" } }).map((literal) => literal.text());
    const tuple = tupleNameFor(name.text());
    const at = insertionStart(statement);
    edits.push({ startPos: at, endPos: at, insertedText: `${exported ? "export " : ""}const ${tuple} = [${members.join(", ")}] as const;\n` });
    // Replace from the name through the value so a union wrapped after `=` collapses onto one line.
    edits.push({ startPos: name.range().end.index, endPos: value.range().end.index, insertedText: ` = (typeof ${tuple})[number]` });
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
