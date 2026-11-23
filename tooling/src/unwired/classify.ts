// What one reference means, read from the TypeScript 6 syntax at its position. Both engines report sites and classify
// through here, so they disagree only about which references exist, never about what a reference means.
//
// - A write is read from here, which keeps a bump, a destructuring slot and a for-of target as reads
//   (docs/work/3858-one-write-access-reader-covers-every-write-form.md).
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

const PRODUCTION = /^packages\/[^/]+\/(?:src\/|[^/]+\.(?:ts|tsx|mts)$)/u;

// A file whose references count as production.
const isProductionFile = (relativePath: string): boolean => PRODUCTION.test(relativePath);

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

// A property access or element access an assignment stores into: `=`, a compound `+=` or a logical `??=`. The value a
// compound operator reads on the way is only the store's, so a member that is only ever bumped is never read.
function accessRole(access: ts.Expression): SyntaxRole {
  const parent = access.parent;
  const kind = ts.isBinaryExpression(parent) && parent.left === access ? parent.operatorToken.kind : undefined;
  return kind !== undefined && kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment ? "write" : "read";
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

// The role of the reference at `position` in `source`.
function roleAt(source: ts.SourceFile, position: number): SyntaxRole {
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
