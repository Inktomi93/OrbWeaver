// What one reference means, read from the TypeScript 6 syntax at its position. Both engines report sites and classify
// through here, so they disagree only about which references exist, never about what a reference means.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/** One reference: a repository-relative file and the 0-based offset where the name starts. */
export interface Site {
  readonly file: string;
  readonly position: number;
}

export const siteKey = (site: Site): string => `${site.file}:${site.position}`;

const REFERENCE_KINDS = ["use", "builder", "plumbing", "test", "external"] as const;
/** `use`: production code reads or calls it. `builder`: an object literal or JSX attribute supplies it.
 *  `plumbing`: a type position names it. `test`: a use outside production code. `external`: a library file. */
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

const SYNTAX_ROLES = ["read", "write", "type"] as const;
/** `write`: an object literal, JSX attribute or plain assignment gives the property a value. `type`: a type position,
 *  a declaration or an import names it. `read`: everything else. */
export type SyntaxRole = (typeof SYNTAX_ROLES)[number];

const LITERAL_ROLES = ["construct", "compare", "case", "key", "type", "module"] as const;
/** What a string literal does with its value: builds one, tests one, names a key or a module, or sits in a type. */
export type LiteralRole = (typeof LITERAL_ROLES)[number];

const PRODUCTION = /^packages\/[^/]+\/(?:src\/|[^/]+\.(?:ts|tsx|mts)$)/u;

/** A file whose references count as production. */
export const isProductionFile = (relativePath: string): boolean => PRODUCTION.test(relativePath);

/** Source files parsed alone by TypeScript 6, one parse per file for the whole run. */
export class Sources {
  readonly #root: string;
  readonly #parsed = new Map<string, ts.SourceFile>();

  constructor(root: string) {
    this.#root = root;
  }

  get(file: string): ts.SourceFile {
    const found = this.#parsed.get(file);
    if (found !== undefined) {
      return found;
    }
    const parsed = parseAlone(file, readFileSync(join(this.#root, file), "utf8"));
    this.#parsed.set(file, parsed);
    return parsed;
  }

  /** The 1-based line of a site. */
  line(site: Site): number {
    return this.get(site.file).getLineAndCharacterOfPosition(site.position).line + 1;
  }
}

/** A source file parsed alone, for an engine that has positions but no program. */
function parseAlone(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** The name that starts at `position`, or undefined when none does: find-references also reports a `{@link}` in a
 *  doc comment, where no code names the symbol. A string literal's reported span starts inside its quote. */
export function nameAt(source: ts.SourceFile, position: number): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (position >= node.getStart(source) && position < node.getEnd()) {
      found = node;
      ts.forEachChild(node, visit);
    }
  };
  visit(source);
  const start = found?.getStart(source);
  return start === position || (found !== undefined && ts.isStringLiteralLike(found) && start === position - 1) ? found : undefined;
}

// Positions where a name only labels a type, a declaration or a module binding.
const TYPE_PARENTS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.TypeReference,
  ts.SyntaxKind.TypeQuery,
  ts.SyntaxKind.QualifiedName,
  ts.SyntaxKind.LiteralType,
  ts.SyntaxKind.IndexedAccessType,
  ts.SyntaxKind.ImportSpecifier,
  ts.SyntaxKind.ExportSpecifier,
  ts.SyntaxKind.ImportClause,
  ts.SyntaxKind.NamespaceImport,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.MethodSignature,
]);

const WRITTEN_BY_NAME: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.ShorthandPropertyAssignment,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.JsxAttribute,
]);

// A property access or element access that a plain `=` assigns.
function accessRole(access: ts.Expression): SyntaxRole {
  const parent = access.parent;
  return ts.isBinaryExpression(parent) && parent.left === access && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken ? "write" : "read";
}

function roleOf(node: ts.Node | undefined): SyntaxRole {
  const parent = node?.parent;
  if (node === undefined || parent === undefined) {
    return "type";
  }
  if (ts.isStringLiteralLike(node)) {
    if (ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind === ts.SyntaxKind.InKeyword) {
      return "read";
    }
    return ts.isElementAccessExpression(parent) && parent.argumentExpression === node ? accessRole(parent) : "type";
  }
  if (TYPE_PARENTS.has(parent.kind) || ts.isExpressionWithTypeArguments(parent)) {
    return "type";
  }
  if (WRITTEN_BY_NAME.has(parent.kind) && (parent as ts.NamedDeclaration).name === node) {
    return "write";
  }
  return ts.isPropertyAccessExpression(parent) && parent.name === node ? accessRole(parent) : "read";
}

/** The role of the reference at `position` in `source`. */
export function roleAt(source: ts.SourceFile, position: number): SyntaxRole {
  return roleOf(nameAt(source, position));
}

const KIND_OF_ROLE = { read: "use", write: "builder", type: "plumbing" } as const satisfies Record<SyntaxRole, ReferenceKind>;

/** Classify the reference at `position` in `source`, whose repository-relative path is `relativePath`. */
export function classifyReference(source: ts.SourceFile, position: number, relativePath: string): ReferenceKind {
  if (relativePath.includes("node_modules")) {
    return "external";
  }
  const kind = KIND_OF_ROLE[roleAt(source, position)];
  return kind === "use" && !isProductionFile(relativePath) ? "test" : kind;
}

/** One argument a call passes: its literal text when it is a literal, and the keys it supplies when it is an object
 *  literal or a JSX element's attributes. `keys` is null when a spread or a non-literal may supply any key. */
interface ArgumentShape {
  readonly literal: string | null;
  readonly keys: readonly string[] | null;
}

/** A call, `new` or JSX element that invokes the referenced callable. `arguments` is null when a spread hides them. */
export interface CallShape {
  readonly arguments: readonly ArgumentShape[] | null;
}

const LITERAL_KEYWORDS: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword]);

function literalText(node: ts.Expression): string | null {
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) || ts.isBigIntLiteral(node) || LITERAL_KEYWORDS.has(node.kind)) {
    return node.getText();
  }
  if (ts.isIdentifier(node) && node.text === "undefined") {
    return "undefined";
  }
  return ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand) ? node.getText() : null;
}

function literalKeys(node: ts.Expression): readonly string[] | null {
  if (!ts.isObjectLiteralExpression(node)) {
    return null;
  }
  const keys: string[] = [];
  for (const property of node.properties) {
    const name = ts.isSpreadAssignment(property) ? undefined : property.name;
    if (name === undefined || !(ts.isIdentifier(name) || ts.isStringLiteralLike(name))) {
      return null;
    }
    keys.push(name.text);
  }
  return keys;
}

function argumentShape(node: ts.Expression): ArgumentShape {
  return { literal: literalText(node), keys: literalKeys(node) };
}

function jsxShape(element: ts.JsxOpeningLikeElement): CallShape {
  const keys: string[] = [];
  for (const attribute of element.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      return { arguments: [{ literal: null, keys: null }] };
    }
    keys.push(attribute.name.getText());
  }
  // Children between an opening and a closing tag supply the `children` prop.
  if (ts.isJsxOpeningElement(element) && element.parent.children.length > 0) {
    keys.push("children");
  }
  return { arguments: [{ literal: null, keys }] };
}

/** The call the reference at `position` is the callee of, or null when the reference is not invoked there. */
export function callAt(source: ts.SourceFile, position: number): CallShape | null {
  const node = nameAt(source, position);
  const parent = node?.parent;
  if (node === undefined || parent === undefined) {
    return null;
  }
  const callee = ts.isPropertyAccessExpression(parent) && parent.name === node ? parent : node;
  const site = callee.parent;
  if ((ts.isJsxOpeningElement(site) || ts.isJsxSelfClosingElement(site)) && site.tagName === callee) {
    return jsxShape(site);
  }
  if (!((ts.isCallExpression(site) || ts.isNewExpression(site)) && site.expression === callee)) {
    return null;
  }
  const args = site.arguments ?? [];
  return { arguments: args.some(ts.isSpreadElement) ? null : args.map(argumentShape) };
}

const MEMBERSHIP_METHODS: ReadonlySet<string> = new Set(["includes", "has", "indexOf", "lastIndexOf"]);
const EQUALITY: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

function isMembershipArgument(node: ts.Node, parent: ts.Node): boolean {
  return (
    ts.isCallExpression(parent) &&
    parent.arguments.includes(node as ts.Expression) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    MEMBERSHIP_METHODS.has(parent.expression.name.text)
  );
}

function isModuleSpecifier(node: ts.Node, parent: ts.Node): boolean {
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) {
    return true;
  }
  return (
    ts.isCallExpression(parent) &&
    (parent.expression.kind === ts.SyntaxKind.ImportKeyword || parent.expression.getText() === "require") &&
    parent.arguments[0] === node
  );
}

function isKeyName(node: ts.Node, parent: ts.Node): boolean {
  if (ts.isComputedPropertyName(parent) || ts.isEnumMember(parent) || (ts.isElementAccessExpression(parent) && parent.argumentExpression === node)) {
    return true;
  }
  return (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertySignature(parent)) && parent.name === node;
}

/** What the string literal at `position` does with its value. */
export function literalRoleAt(source: ts.SourceFile, position: number): LiteralRole {
  const node = nameAt(source, position);
  const parent = node?.parent;
  if (node === undefined || parent === undefined) {
    return "type";
  }
  if (isModuleSpecifier(node, parent)) {
    return "module";
  }
  if (ts.isLiteralTypeNode(parent)) {
    return "type";
  }
  if (ts.isCaseClause(parent)) {
    return "case";
  }
  if ((ts.isBinaryExpression(parent) && EQUALITY.has(parent.operatorToken.kind)) || isMembershipArgument(node, parent)) {
    return "compare";
  }
  return isKeyName(node, parent) ? "key" : "construct";
}

const VALUE_USES = ["call", "define", "type", "test", "parse", "escape"] as const;
/** What a reference to a function, a callable member or a tuple does with the value. `define`: an implementation
 *  supplies the member. `test`: a membership method reads it. `parse`: `z.enum` reads it. `escape`: the value
 *  leaves for code the scan cannot follow, so any argument or member may be reached there. */
export type ValueUse = (typeof VALUE_USES)[number];

/** What the reference at `position` does with the value it names. */
export function valueUseAt(source: ts.SourceFile, position: number): ValueUse {
  if (callAt(source, position) !== null) {
    return "call";
  }
  const node = nameAt(source, position);
  const role = roleOf(node);
  if (role !== "read") {
    return role === "write" ? "define" : "type";
  }
  if (node === undefined) {
    return "escape";
  }
  // `(TUPLE as readonly string[]).includes(x)` still only tests membership: look through parentheses and assertions.
  let value = node;
  while (
    ts.isParenthesizedExpression(value.parent) ||
    ts.isAsExpression(value.parent) ||
    ts.isSatisfiesExpression(value.parent) ||
    ts.isNonNullExpression(value.parent)
  ) {
    value = value.parent;
  }
  const { parent } = value;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === value && MEMBERSHIP_METHODS.has(parent.name.text) && ts.isCallExpression(parent.parent)) {
    return "test";
  }
  const parsed = ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === "enum";
  return parsed ? "parse" : "escape";
}
