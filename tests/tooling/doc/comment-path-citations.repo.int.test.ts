// A code comment or a law document that names a repo path, a Markdown doc or a test file, must name a tracked file. Comments
// are read by each language's own parser: the TypeScript scanner's comment ranges for scripts, PostCSS comment nodes (through
// stylelint) for sheets. A path inside a string literal or JSX text is a fixture or copy, never a citation. A law document
// also cites a directory-qualified path from the repo root, so a moved file turns its citation red.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, extname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import type { Rule } from "stylelint";
import stylelint from "stylelint";
import ts from "typescript";
import { describe } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCANNED_ROOTS = ["packages", "tooling", "tests"] as const;
// Law that agents act on: the always-on core, the path rules and the law tree.
const LAW_DOC = /^(?:AGENTS\.md|\.claude\/rules\/[^/]+\.md|docs\/law\/[^/]+\.md)$/u;
const MARKDOWN = ".md";
// The vendored DevTools frontend is a third-party bundle whose comments cite its own source tree.
const VENDORED = "tooling/src/snap/lib/devtools-frontend/assets/";
const SCRIPT_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
};
const CSS_EXT = ".css";
const HASH_COMMENT_EXTS = new Set([".sh", ".yaml", ".yml"]);
const CITED_EXT = "(?:md|tsx?|[cm]?js|css|json|ya?ml|sh)";
// A repo-rooted path. The lookbehind keeps a URL's own segment and a relative path's tail out; the lookahead drops a
// directory or a glob, whose next character continues the path.
const ROOTED = new RegExp(
  String.raw`(?<![\w./*@-])(?:docs|packages|tooling|tests|scripts|docker|\.claude|\.github)\/[\w./+@-]*\w\.${CITED_EXT}(?![\w*{/-])`,
  "gu",
);
// A relative path, resolved against the citing file.
const RELATIVE = new RegExp(String.raw`(?<![\w./*@-])\.{1,2}\/[\w./+@-]*\w\.${CITED_EXT}(?![\w*{/-])`, "gu");
// A path with a directory that is neither rooted nor relative: in a law document it must be written from the repo root.
const UNROOTED = new RegExp(
  String.raw`(?<![\w./*@-])(?!(?:docs|packages|tooling|tests|scripts|docker|\.claude|\.github|legacy-source)\/)[\w+-][\w.+-]*\/[\w./+@-]*\w\.${CITED_EXT}(?![\w*{/-])`,
  "gu",
);
// A quoted literal in a law document is a code or config sample (an export map, an import call), resolved by its own package.
const QUOTED = /"[^"\n]*"/gu;
// A bare doc or test file name: the house idiom for citing one without its directory.
const BARE = /(?<![\w./*@-])[\w-]+(?:\.[\w-]+)*\.(?:md|(?:test|spec|ct|test-d)\.tsx?)(?![\w*{/-])/gu;
// Any of the three, to skip a file that names no path outside its module specifiers before parsing it.
const ANY_PATH = new RegExp([ROOTED.source, RELATIVE.source, BARE.source].join("|"), "u");
const MODULE_SPECIFIER = /(?:\bfrom|\bimport\s*\(?)\s*["'][^"'\n]*["']/gu;
const URL_RE = /\bhttps?:\/\/\S+/gu;
// A glob, brace, placeholder or elision is a prose pattern, never a literal cite.
const NON_LITERAL = /[*{}<>…]|\.\.\.|NNNN/u;

interface Tracked {
  readonly paths: ReadonlySet<string>;
  readonly basenames: ReadonlySet<string>;
}

interface Source {
  readonly path: string;
  readonly text: string;
}

/** One comment's text and the line it starts on. */
interface Comment {
  readonly line: number;
  readonly text: string;
}

/** Every comment in a script, from the TypeScript scanner's leading and trailing comment ranges of every token. */
function scriptComments(source: Source, kind: ts.ScriptKind): Comment[] {
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, false, kind);
  const seen = new Set<number>();
  const comments: Comment[] = [];
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

/** Every comment in a sheet, from the PostCSS tree stylelint parses, through a rule that only collects. */
async function sheetComments(source: Source): Promise<Comment[]> {
  const comments: Comment[] = [];
  const collect: Rule = () => (root) => {
    root.walkComments((node) => {
      comments.push({ line: node.source?.start?.line ?? 0, text: node.text });
    });
  };
  collect.ruleName = "orb-test/collect-comments";
  collect.messages = {};
  collect.meta = { url: "" };
  await stylelint.lint({
    code: source.text,
    codeFilename: join(REPO_ROOT, source.path),
    config: { plugins: [stylelint.createPlugin(collect.ruleName, collect)], rules: { [collect.ruleName]: true } },
    configBasedir: REPO_ROOT,
  });
  return comments;
}

function hashComments(source: Source): Comment[] {
  return source.text.split("\n").flatMap((line, index) => (line.includes("#") ? [{ line: index + 1, text: line.slice(line.indexOf("#")) }] : []));
}

function commentsOf(source: Source): Promise<Comment[]> {
  const ext = extname(source.path);
  if (ext === MARKDOWN) {
    return Promise.resolve([{ line: 1, text: source.text.replaceAll(QUOTED, " ") }]);
  }
  const kind = SCRIPT_KINDS[ext];
  if (ext === CSS_EXT) {
    return sheetComments(source);
  }
  if (kind !== undefined) {
    return Promise.resolve(scriptComments(source, kind));
  }
  return Promise.resolve(HASH_COMMENT_EXTS.has(ext) ? hashComments(source) : []);
}

/** Each path a comment names that is not a tracked file, as `file:line token`. */
async function staleCitations(sources: readonly Source[], tracked: Tracked): Promise<readonly string[]> {
  const findings: string[] = [];
  for (const source of sources) {
    for (const comment of await commentsOf(source)) {
      comment.text.split("\n").forEach((text, offset) => {
        const line = text.replaceAll(URL_RE, " ");
        const hits = [
          ...[...line.matchAll(ROOTED)].map(([token]) => ({ token, present: tracked.paths.has(token) })),
          ...[...line.matchAll(RELATIVE)].map(([token]) => ({ token, present: tracked.paths.has(posix.join(dirname(source.path), token)) })),
          ...[...line.matchAll(BARE)].map(([token]) => ({ token, present: tracked.basenames.has(token) })),
          ...(extname(source.path) === MARKDOWN ? [...line.matchAll(UNROOTED)].map(([token]) => ({ token, present: tracked.paths.has(token) })) : []),
        ];
        for (const hit of hits.filter(({ token, present }) => !(present || NON_LITERAL.test(token)))) {
          findings.push(`${source.path}:${String(comment.line + offset)} ${hit.token}`);
        }
      });
    }
  }
  return findings;
}

function trackedFiles(): Tracked {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
  return { paths: new Set(paths), basenames: new Set(paths.map((path) => basename(path))) };
}

/** Every tracked source under the scanned roots in a language this reads, that names a path anywhere in its text. */
function candidateSources(tracked: Tracked): Source[] {
  const readable = (path: string): boolean =>
    LAW_DOC.test(path) ||
    (SCANNED_ROOTS.some((root) => path.startsWith(`${root}/`)) &&
      !path.startsWith(VENDORED) &&
      (SCRIPT_KINDS[extname(path)] !== undefined || extname(path) === CSS_EXT || HASH_COMMENT_EXTS.has(extname(path))));
  return [...tracked.paths]
    .filter(readable)
    .map((path) => ({ path, text: readFileSync(join(REPO_ROOT, path), "utf8") }))
    .filter((source) => ANY_PATH.test(source.text.replaceAll(MODULE_SPECIFIER, "")));
}

describe("the real tree", () => {
  test("every path a code comment or law document names is a tracked file", async () => {
    const tracked = trackedFiles();
    const sources = candidateSources(tracked);
    // A read that missed a root or a language would pass every citation in it.
    expect(SCANNED_ROOTS.filter((root) => !sources.some((source) => source.path.startsWith(`${root}/`)))).toStrictEqual([]);
    expect([".ts", ".tsx", CSS_EXT, MARKDOWN].filter((ext) => !sources.some((source) => source.path.endsWith(ext)))).toStrictEqual([]);
    expect(await staleCitations(sources, tracked)).toStrictEqual([]);
  });
});

describe("the reader", () => {
  const tracked: Tracked = {
    paths: new Set(["docs/law/Spine-Testing.md", "tests/a/real.ct.tsx", "packages/x/src/real.ts"]),
    basenames: new Set(["Spine-Testing.md", "real.ct.tsx", "real.ts"]),
  };

  test("refuses a missing path in every comment form a language has", async () => {
    const sources: Source[] = [
      { path: "packages/x/src/a.ts", text: "// see docs/law/Gone.md\nconst a = 1; /* tests/a/gone.ct.tsx */\n" },
      { path: "packages/x/src/b.ts", text: "/**\n * The header.\n *  pinned by app-shell.ct.tsx\n */\nexport const b = 1;\n" },
      { path: "packages/x/src/c.ts", text: "/* opened here\n   and continued in docs/law/Inner.md\n*/\nexport const c = 1;\n" },
      { path: "packages/x/src/d.tsx", text: "export const d = (\n  <div>\n    {/* the row\n        inner-gone.ct.tsx */}\n  </div>\n);\n" },
      { path: "packages/x/src/e.ts", text: 'const s = "it\'s"; // after-quote.ct.tsx\n' },
      { path: "packages/x/src/f.tsx", text: "export const f = (\n  <p>\n    Don't stop. {/* jsx-gone.ct.tsx */}\n  </p>\n);\n" },
      { path: "packages/x/src/g.css", text: ".a {\n  /* first line\n     ../gone.ts */\n  opacity: 1;\n}\n" },
      { path: "tooling/run.sh", text: "echo hi\n# packages/x/src/gone.ts\n" },
      { path: "docs/law/Law.md", text: "# Law\n\nThe slot lives in `app-shell/lib/moved.ts` and `packages/x/src/gone.ts`.\n" },
    ];
    expect(await staleCitations(sources, tracked)).toStrictEqual([
      "packages/x/src/a.ts:1 docs/law/Gone.md",
      "packages/x/src/a.ts:2 tests/a/gone.ct.tsx",
      "packages/x/src/b.ts:3 app-shell.ct.tsx",
      "packages/x/src/c.ts:2 docs/law/Inner.md",
      "packages/x/src/d.tsx:4 inner-gone.ct.tsx",
      "packages/x/src/e.ts:1 after-quote.ct.tsx",
      "packages/x/src/f.tsx:3 jsx-gone.ct.tsx",
      "packages/x/src/g.css:3 ../gone.ts",
      "tooling/run.sh:2 packages/x/src/gone.ts",
      "docs/law/Law.md:3 packages/x/src/gone.ts",
      "docs/law/Law.md:3 app-shell/lib/moved.ts",
    ]);
  });

  test("passes a tracked path, a string, JSX text, a URL and a glob", async () => {
    const sources: Source[] = [
      { path: "packages/x/src/a.ts", text: "// docs/law/Spine-Testing.md and real.ct.tsx and ./real.ts\n" },
      { path: "packages/x/src/b.ts", text: 'const path = "docs/law/Gone.md"; const t = `/* tests/a/gone.ct.tsx */`;\n' },
      { path: "packages/x/src/c.tsx", text: "export const c = <p>See https://example.com and copy.ct.tsx // not a comment</p>;\n" },
      { path: "packages/x/src/d.ts", text: "// https://example.com/docs/law/Gone.md\n// every tests/**/*.ct.tsx and tests/a/ directory\n" },
      { path: "packages/x/src/e.css", text: '.a { content: "/* gone.ct.tsx */"; }\n' },
      {
        path: "docs/law/Law.md",
        text: '# Law\n\nSee `packages/x/src/real.ts`, [the spine](./Spine-Testing.md), `<domain>/verbs/<action>.ts`, `legacy-source/ui/gone.ct.tsx` and `"./button": "./src/button/index.ts"`.\n',
      },
    ];
    expect(await staleCitations(sources, tracked)).toStrictEqual([]);
  });
});
