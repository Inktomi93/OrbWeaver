// Rewrites `x.type === "Identifier"` and `case "Identifier":` into the typescript-eslint enum member, which
// `@typescript-eslint/no-unsafe-enum-comparison` demands and which narrows a TSESTree union the same way.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const UTILS = "@typescript-eslint/utils";
const NODE_ENUM = "AST_NODE_TYPES";
const TOKEN_ENUM = "AST_TOKEN_TYPES";
const SCOPE_ENUM = "TSESLint";

// Names that only exist on the scope-manager enums or the token enum; every other PascalCase name is an AST_NODE_TYPES member.
const SCOPE_TYPES: Readonly<Record<string, string>> = {
  function: "function",
  global: "global",
  module: "module",
  "function-expression-name": "functionExpressionName",
};
const DEFINITION_TYPES = new Set(["ClassName", "FunctionName", "ImplicitGlobalVariable", "ImportBinding", "Parameter", "TSEnumName", "Variable"]);
const TOKEN_TYPES = new Set(["Block", "Boolean", "Keyword", "Line", "Null", "Numeric", "Punctuator", "RegularExpression", "String", "Template"]);
// Names shared by two enums; the receiver's own name picks the family.
const SHARED_WITH_TOKEN = new Set(["Identifier", "JSXIdentifier", "JSXText", "PrivateIdentifier"]);
const TOKEN_RECEIVER = /token|comment/iu;
const DEFINITION_RECEIVER = /def/iu;
const NODE_NAME = /^[A-Z][A-Za-z]*$/u;

const TYPE_COMPARISON = {
  rule: {
    kind: "binary_expression",
    has: { field: "operator", regex: "^[!=]==$" },
  },
} as const;
const SWITCH_ON_TYPE = { rule: { kind: "switch_statement" } } as const;

/** Pre-filter: only files that already import typescript-eslint's utils can hold its enums. */
export const getSelector: GetSelector<TS> = () => ({ rule: { kind: "string", regex: UTILS, inside: { kind: "import_statement" } } });

interface Reference {
  readonly enumName: string;
  readonly text: string;
}

function receiverOf(typeSide: SgNode<TS>): string | null {
  if (typeSide.is("identifier")) {
    return typeSide.text() === "type" ? "" : null;
  }
  if (typeSide.is("member_expression") && typeSide.field("property").text() === "type") {
    return typeSide.field("object").text();
  }
  return null;
}

function enumReference(name: string, receiver: string): Reference | null {
  const scope = SCOPE_TYPES[name];
  if (scope !== undefined) {
    return { enumName: SCOPE_ENUM, text: `${SCOPE_ENUM}.Scope.ScopeType.${scope}` };
  }
  if (DEFINITION_TYPES.has(name) || (name === "CatchClause" && DEFINITION_RECEIVER.test(receiver))) {
    return { enumName: SCOPE_ENUM, text: `${SCOPE_ENUM}.Scope.DefinitionType.${name}` };
  }
  if (TOKEN_TYPES.has(name) || (SHARED_WITH_TOKEN.has(name) && TOKEN_RECEIVER.test(receiver))) {
    return { enumName: TOKEN_ENUM, text: `${TOKEN_ENUM}.${name}` };
  }
  return NODE_NAME.test(name) ? { enumName: NODE_ENUM, text: `${NODE_ENUM}.${name}` } : null;
}

function stringValue(node: SgNode<TS> | null): string | null {
  if (node === null || !node.is("string")) {
    return null;
  }
  const text = node.text();
  return text.length > 2 ? text.slice(1, -1) : null;
}

interface Specifiers {
  readonly names: readonly string[];
  readonly braces: SgNode<TS>;
}

function specifiersOf(statement: SgNode<TS>): Specifiers | null {
  const braces = statement.find({ rule: { kind: "named_imports" } });
  if (braces === null) {
    return null;
  }
  return { braces, names: braces.findAll({ rule: { kind: "import_specifier" } }).map((specifier) => specifier.text()) };
}

function replaceBraces(specifiers: Specifiers, names: readonly string[]): Edit {
  return { startPos: specifiers.braces.range().start.index, endPos: specifiers.braces.range().end.index, insertedText: `{ ${names.join(", ")} }` };
}

interface TypeImportCleanup {
  readonly edits: readonly Edit[];
  readonly emptied: SgNode<TS> | null;
}

/** One binding cannot be both `import type { TSESLint }` and a value import, so the type import gives it up. */
function releaseScopeBinding(typeImports: readonly SgNode<TS>[]): TypeImportCleanup {
  const edits: Edit[] = [];
  let emptied: SgNode<TS> | null = null;
  for (const statement of typeImports) {
    const specifiers = specifiersOf(statement);
    if (specifiers?.names.includes(SCOPE_ENUM) !== true) {
      continue;
    }
    const rest = specifiers.names.filter((name) => name !== SCOPE_ENUM);
    if (rest.length > 0) {
      edits.push(replaceBraces(specifiers, rest));
    } else {
      emptied = statement;
    }
  }
  return { edits, emptied };
}

function importEdits(statements: readonly SgNode<TS>[], needed: ReadonlySet<string>): Edit[] {
  const utilsImports = statements.filter((statement) => stringValue(statement.field("source")) === UTILS);
  const typeImports = utilsImports.filter((statement) => /^import\s+type\b/u.test(statement.text()));
  const valueImport = utilsImports.find((statement) => !typeImports.includes(statement) && specifiersOf(statement) !== null);
  const cleanup = needed.has(SCOPE_ENUM) ? releaseScopeBinding(typeImports) : { edits: [], emptied: null };
  const edits: Edit[] = [...cleanup.edits];
  const existing = valueImport === undefined ? null : specifiersOf(valueImport);
  const names = [...new Set([...needed, ...(existing?.names ?? [])])].sort();
  if (existing !== null) {
    edits.push(replaceBraces(existing, names));
    if (cleanup.emptied !== null) {
      edits.push({ startPos: cleanup.emptied.range().start.index, endPos: cleanup.emptied.range().end.index + 1, insertedText: "" });
    }
    return edits;
  }
  const statementText = `import { ${names.join(", ")} } from "${UTILS}";`;
  if (cleanup.emptied !== null) {
    edits.push({ startPos: cleanup.emptied.range().start.index, endPos: cleanup.emptied.range().end.index, insertedText: statementText });
    return edits;
  }
  const anchor = utilsImports.at(-1);
  if (anchor !== undefined) {
    edits.push({ startPos: anchor.range().end.index, endPos: anchor.range().end.index, insertedText: `\n${statementText}` });
  }
  return edits;
}

interface Site {
  readonly literal: SgNode<TS>;
  readonly receiver: string;
}

function comparisonSites(rootNode: SgNode<TS>): Site[] {
  const sites: Site[] = [];
  for (const comparison of rootNode.findAll(TYPE_COMPARISON)) {
    const left = comparison.field("left");
    const right = comparison.field("right");
    if (left === null || right === null) {
      continue;
    }
    const leftReceiver = receiverOf(left);
    const rightReceiver = receiverOf(right);
    if (leftReceiver !== null && right.is("string")) {
      sites.push({ literal: right, receiver: leftReceiver });
    } else if (rightReceiver !== null && left.is("string")) {
      sites.push({ literal: left, receiver: rightReceiver });
    }
  }
  return sites;
}

function caseSites(rootNode: SgNode<TS>): Site[] {
  const sites: Site[] = [];
  for (const statement of rootNode.findAll(SWITCH_ON_TYPE)) {
    const discriminant = statement.field("value")?.child(1) ?? null;
    const receiver = discriminant === null ? null : receiverOf(discriminant);
    if (receiver === null) {
      continue;
    }
    for (const switchCase of statement.findAll({ rule: { kind: "switch_case" } })) {
      const literal = switchCase.field("value");
      if (literal !== null) {
        sites.push({ literal, receiver });
      }
    }
  }
  return sites;
}

const codemod: Codemod<TS> = (root) => {
  const rootNode = root.root();
  const statements = rootNode.findAll({ rule: { kind: "import_statement" } });
  if (!statements.some((statement) => stringValue(statement.field("source")) === UTILS)) {
    return Promise.resolve(null);
  }
  const edits: Edit[] = [];
  const needed = new Set<string>();
  for (const { literal, receiver } of [...comparisonSites(rootNode), ...caseSites(rootNode)]) {
    const name = stringValue(literal);
    const reference = name === null ? null : enumReference(name, receiver);
    if (reference !== null) {
      needed.add(reference.enumName);
      edits.push(literal.replace(reference.text));
    }
  }
  if (edits.length === 0) {
    return Promise.resolve(null);
  }
  edits.push(...importEdits(statements, needed));
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
