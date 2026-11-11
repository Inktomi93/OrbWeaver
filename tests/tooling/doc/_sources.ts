// The tracked tree and the text a reference check reads: comments and string literals by the TypeScript scanner, and the
// repo-rooted path pattern. Both reference tests in this directory read the tree through here.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
// The root config files: scripts, YAML and the JSONC tsconfigs.
export const ROOT_CONFIG = /^(?:[^/]+\.(?:[cm]?[jt]sx?|ya?ml|sh)|tsconfig[\w.-]*\.json)$/u;
// Law that agents act on: the always-on core, the path rules and the law tree.
export const LAW_DOC = /^(?:AGENTS\.md|\.claude\/rules\/[^/]+\.md|docs\/law\/[^/]+\.md)$/u;
export const MARKDOWN = ".md";
// The vendored DevTools frontend is a third-party bundle whose comments cite its own source tree.
export const VENDORED = "tooling/src/snap/lib/devtools-frontend/assets/";
export const SCRIPT_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
};
export const CITED_EXT = "(?:md|tsx?|[cm]?js|css|json|ya?ml|sh)";
// A repo-rooted path. The lookbehind keeps a URL's own segment and a relative path's tail out; the lookahead drops a
// directory or a glob, whose next character continues the path.
export const ROOTED = new RegExp(
  String.raw`(?<![\w./*@-])(?:docs|packages|tooling|tests|scripts|docker|\.claude|\.github)\/[\w./+@-]*\w\.${CITED_EXT}(?![\w*{/-])`,
  "gu",
);
export const URL_RE = /\bhttps?:\/\/\S+/gu;
// A glob, brace, placeholder or elision is a prose pattern, never a literal cite.
export const NON_LITERAL = /[*{}<>…]|\.\.\.|NNNN/u;

export interface Tracked {
  readonly paths: ReadonlySet<string>;
  readonly basenames: ReadonlySet<string>;
}

export interface Source {
  readonly path: string;
  readonly text: string;
}

/** One comment's or string's text and the line it starts on. */
export interface Span {
  readonly line: number;
  readonly text: string;
}

export function trackedFiles(): Tracked {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
  return { paths: new Set(paths), basenames: new Set(paths.map((path) => basename(path))) };
}

export const readFromRepo = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

/** Every comment in a script, from the TypeScript scanner's leading and trailing comment ranges of every token. */
export function scriptComments(source: Source, kind: ts.ScriptKind): Span[] {
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, false, kind);
  const seen = new Set<number>();
  const comments: Span[] = [];
  const take = (ranges: readonly ts.CommentRange[] | undefined): void => {
    for (const range of ranges ?? []) {
      if (!seen.has(range.pos)) {
        seen.add(range.pos);
        comments.push({ line: file.getLineAndCharacterOfPosition(range.pos).line + 1, text: source.text.slice(range.pos, range.end) });
      }
    }
  };
  const visit = (node: ts.Node): void => {
    // JSX text is copy, and its trivia ranges would read an apostrophe or a `//` in it as code.
    if (node.kind !== ts.SyntaxKind.JsxText) {
      take(ts.getLeadingCommentRanges(source.text, node.pos));
      take(ts.getTrailingCommentRanges(source.text, node.end));
    }
    for (const child of node.getChildren(file)) {
      visit(child);
    }
  };
  visit(file);
  return comments;
}

/** Every string literal and template-literal text in a script, as the program sees its value. */
export function scriptStrings(source: Source, kind: ts.ScriptKind): Span[] {
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, kind);
  const strings: Span[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      strings.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return strings;
}
