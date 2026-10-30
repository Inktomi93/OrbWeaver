// What one reference to a member is, read from the syntax at its position. Both engines classify through here,
// so they disagree only about which references exist, never about what a reference means.
import ts from "typescript";

export const REFERENCE_KINDS = ["use", "builder", "plumbing", "test", "external"] as const;
/** `use`: production code reads or calls it. `builder`: an object literal or JSX attribute supplies it.
 *  `plumbing`: a type position names it. `test`: a use outside production code. `external`: a library file. */
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

const PRODUCTION = /^packages\/[^/]+\/(?:src\/|[^/]+\.(?:ts|tsx|mts)$)/u;

function innermostAt(source: ts.SourceFile, position: number): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (position >= node.getStart(source) && position < node.getEnd()) {
      found = node;
      ts.forEachChild(node, visit);
    }
  };
  visit(source);
  return found;
}

function syntacticKind(node: ts.Node | undefined): Exclude<ReferenceKind, "test" | "external"> {
  const parent = node?.parent;
  if (node === undefined || parent === undefined) {
    return "use";
  }
  if (ts.isStringLiteral(node) || ts.isLiteralTypeNode(parent)) {
    return "plumbing";
  }
  if ((ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) && parent.name === node) {
    return "plumbing";
  }
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) {
    return "builder";
  }
  return ts.isShorthandPropertyAssignment(parent) || ts.isJsxAttribute(parent) ? "builder" : "use";
}

/** Classify the reference at `position` in `source`, whose repository-relative path is `relativePath`. */
export function classifyReference(source: ts.SourceFile, position: number, relativePath: string): ReferenceKind {
  if (relativePath.includes("node_modules")) {
    return "external";
  }
  const kind = syntacticKind(innermostAt(source, position));
  return kind === "use" && !PRODUCTION.test(relativePath) ? "test" : kind;
}

/** A source file parsed alone, for an engine that has positions but no program. */
export function parseAlone(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
