// A code comment that names a repo path, a Markdown doc or a test file, must name a tracked file.
// One `git grep` pass reads the comment lines; a path inside a string literal is a fixture or an example, never a citation.
import { execFileSync } from "node:child_process";
import { basename, dirname, extname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { describe } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCANNED_ROOTS = ["packages", "tooling", "tests"] as const;
// The vendored DevTools frontend is a third-party bundle whose comments cite its own source tree.
const VENDORED = ":(exclude)tooling/src/snap/lib/devtools-frontend/assets";
const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".css"]);
const HASH_COMMENT_EXTS = new Set([".sh", ".yaml", ".yml"]);
// A line that holds a comment opener and a dotted file name somewhere after it.
const CANDIDATE_LINE = String.raw`(//|/\*|^\s*\*|#).*[A-Za-z0-9_]\.[a-z]+`;
// A repo-rooted path. The lookbehind keeps a URL's own segment and a relative path's tail out; the lookahead drops a
// directory or a glob, whose next character continues the path.
const ROOTED = /(?<![\w./*@-])(?:docs|packages|tooling|tests|scripts|\.claude|\.github)\/[\w./+@-]*\w\.(?:md|tsx?|[cm]?js|css|json|ya?ml|sh)(?![\w*{/-])/gu;
// A relative path, resolved against the citing file.
const RELATIVE = /(?<![\w./*@-])\.{1,2}\/[\w./+@-]*\w\.(?:md|tsx?|[cm]?js|css|json|ya?ml|sh)(?![\w*{/-])/gu;
// A bare doc or test file name: the house idiom for citing one without its directory.
const BARE = /(?<![\w./*@-])[\w-]+(?:\.[\w-]+)*\.(?:md|(?:test|spec|ct|test-d)\.tsx?)(?![\w*{/-])/gu;
const URL_RE = /\bhttps?:\/\/\S+/gu;
// A glob, brace, placeholder or elision is a prose pattern, never a literal cite.
const NON_LITERAL = /[*{}<>…]|\.\.\.|NNNN/u;
const QUOTES = ['"', "'", "`"] as const;

interface Tracked {
  readonly paths: ReadonlySet<string>;
  readonly basenames: ReadonlySet<string>;
}

/** The comment part of one source line, or `undefined` when the line holds no comment its grammar reads. */
function commentPart(file: string, line: string): string | undefined {
  const ext = extname(file);
  if (HASH_COMMENT_EXTS.has(ext)) {
    const hash = line.indexOf("#");
    return hash === -1 ? undefined : line.slice(hash);
  }
  if (!SCRIPT_EXTS.has(ext)) {
    return undefined;
  }
  if (/^\s*\*/u.test(line)) {
    return line;
  }
  // `//` after a colon is a URL scheme, not a line comment, and an opener after an odd count of a quote is inside a string.
  for (const opener of line.matchAll(/\/\*|(?<!:)\/\//gu)) {
    const before = line.slice(0, opener.index);
    if (QUOTES.every((quote) => before.split(quote).length % 2 === 1)) {
      return line.slice(opener.index);
    }
  }
  return undefined;
}

/** Each path a comment names that is not a tracked file, as `file:line token`. */
function staleCitations(grepLines: readonly string[], tracked: Tracked): readonly string[] {
  return grepLines.flatMap((entry) => {
    const [file = "", lineNumber = "", ...rest] = entry.split(":");
    const comment = commentPart(file, rest.join(":"))?.replaceAll(URL_RE, " ");
    if (comment === undefined) {
      return [];
    }
    const missing = [
      ...[...comment.matchAll(ROOTED)].map(([token]) => ({ token, present: tracked.paths.has(token) })),
      ...[...comment.matchAll(RELATIVE)].map(([token]) => ({ token, present: tracked.paths.has(posix.join(dirname(file), token)) })),
      ...[...comment.matchAll(BARE)].map(([token]) => ({ token, present: tracked.basenames.has(token) })),
    ].filter((hit) => !(hit.present || NON_LITERAL.test(hit.token)));
    return missing.map((hit) => `${file}:${lineNumber} ${hit.token}`);
  });
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function trackedFiles(): Tracked {
  const paths = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  return { paths: new Set(paths), basenames: new Set(paths.map((path) => basename(path))) };
}

function candidateLines(): readonly string[] {
  return git(["grep", "-n", "-I", "-E", CANDIDATE_LINE, "--", ...SCANNED_ROOTS, VENDORED])
    .split("\n")
    .filter(Boolean);
}

describe("the real tree", () => {
  test("every path a code comment names is a tracked file", () => {
    const lines = candidateLines();
    // A grep that missed a root would pass every citation in it.
    expect(SCANNED_ROOTS.filter((root) => !lines.some((line) => line.startsWith(`${root}/`)))).toStrictEqual([]);
    expect(staleCitations(lines, trackedFiles())).toStrictEqual([]);
  });
});

describe("the reader", () => {
  const tracked: Tracked = {
    paths: new Set(["docs/law/Spine-Testing.md", "tests/a/real.ct.tsx", "packages/x/src/real.ts"]),
    basenames: new Set(["Spine-Testing.md", "real.ct.tsx", "real.ts"]),
  };

  test("refuses a missing path in every comment form it reads", () => {
    expect(
      staleCitations(
        [
          "packages/x/src/a.ts:1:// see docs/law/Gone.md",
          "packages/x/src/a.ts:2: * pinned by app-shell.ct.tsx",
          "packages/x/src/a.ts:3:const a = 1; /* tests/a/gone.ct.tsx */",
          "packages/x/src/a.css:4:  /* (../gone.ts) */",
          "tooling/run.sh:5:# packages/x/src/gone.ts",
        ],
        tracked,
      ),
    ).toStrictEqual([
      "packages/x/src/a.ts:1 docs/law/Gone.md",
      "packages/x/src/a.ts:2 app-shell.ct.tsx",
      "packages/x/src/a.ts:3 tests/a/gone.ct.tsx",
      "packages/x/src/a.css:4 ../gone.ts",
      "tooling/run.sh:5 packages/x/src/gone.ts",
    ]);
  });

  test("passes a tracked path, a string literal, a URL and a glob", () => {
    expect(
      staleCitations(
        [
          "packages/x/src/a.ts:1:// docs/law/Spine-Testing.md and real.ct.tsx and ./real.ts",
          'packages/x/src/a.ts:2:const path = "docs/law/Gone.md";',
          "packages/x/src/a.ts:3:// https://example.com/docs/law/Gone.md",
          "packages/x/src/a.ts:4:// every tests/**/*.ct.tsx and tests/a/ directory",
        ],
        tracked,
      ),
    ).toStrictEqual([]);
  });
});
