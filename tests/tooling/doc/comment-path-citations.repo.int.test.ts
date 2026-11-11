// A code comment or a law document that names a repo path, a Markdown doc or a test file, must name a tracked file. Comments
// are read by each language's own parser: the TypeScript scanner's comment ranges for scripts, PostCSS comment nodes (through
// stylelint) for sheets. A path inside a string literal or JSX text is a fixture or copy, never a citation. A law document
// also cites a directory-qualified path from the repo root, so a moved file turns its citation red.
import { basename, dirname, extname, join, posix } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { Rule } from "stylelint";
import stylelint from "stylelint";
import ts from "typescript";
import { describe } from "vitest";
import type { Source, Span, Tracked } from "./_sources.ts";
import {
  CITED_EXT,
  LAW_DOC,
  MARKDOWN,
  NON_LITERAL,
  REPO_ROOT,
  ROOT_CONFIG,
  ROOTED,
  readFromRepo,
  SCRIPT_KINDS,
  scriptComments,
  trackedFiles,
  URL_RE,
  VENDORED,
} from "./_sources.ts";

const SCANNED_ROOTS = ["packages", "tooling", "tests", "scripts", ".github", "docker", ".claude/hooks"] as const;
// A tsconfig anywhere is JSONC, and its comments explain a compiler world.
const TSCONFIG = /(?:^|\/)tsconfig[\w.-]*\.json$/u;
// The image recipe has no extension; its comments are `#` lines.
const DOCKERFILE = "Dockerfile";
// A hook runs in the harness and names the harness's own runtime files, such as the memory index, by bare name, so only its rooted and
// relative paths cite the repository.
const HOOKS = ".claude/hooks/";
const JSONC_EXT = ".json";
const CSS_EXT = ".css";
const HASH_COMMENT_EXTS = new Set([".sh", ".yaml", ".yml"]);
// A relative path, resolved against the citing file.
const RELATIVE = new RegExp(String.raw`(?<![\w./*@-])\.{1,2}\/[\w./+@-]*\w\.${CITED_EXT}(?![\w*{/-])`, "gu");
// A path with a directory that is neither rooted nor relative: in a law document it must be written from the repo root.
const UNROOTED = new RegExp(
  String.raw`(?<![\w./*@+-])(?!(?:docs|packages|tooling|tests|scripts|docker|\.claude|\.github|legacy-source)\/)[\w+-][\w.+-]*\/[\w./+@-]*\w\.${CITED_EXT}(?![\w*{/-])`,
  "gu",
);
// A quoted literal in a law document is a code or config sample (an export map, an import call), resolved by its own package.
const QUOTED = /"[^"\n]*"/gu;
// A bare doc or source file name: the house idiom for citing one without its directory. It opens on a word character,
// so a `-model.ts` suffix pattern stays prose, and a `.d.ts` name is a package's published types, not a repo file.
const BARE = /(?<![\w./*@-])[A-Za-z0-9_][\w-]*(?:\.[\w-]+)*(?:\.md|(?<!\.d)\.tsx?)(?![\w*{/-])/gu;
// Any of the three, to skip a file that names no path outside its module specifiers before parsing it.
const ANY_PATH = new RegExp([ROOTED.source, RELATIVE.source, BARE.source].join("|"), "u");
const MODULE_SPECIFIER = /(?:\bfrom|\bimport\s*\(?)\s*["'][^"'\n]*["']/gu;

/** Every comment in a sheet, from the PostCSS tree stylelint parses, through a rule that only collects. */
async function sheetComments(source: Source): Promise<Span[]> {
  const comments: Span[] = [];
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

function hashComments(source: Source): Span[] {
  return source.text.split("\n").flatMap((line, index) => (line.includes("#") ? [{ line: index + 1, text: line.slice(line.indexOf("#")) }] : []));
}

function commentsOf(source: Source): Promise<Span[]> {
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
  if (ext === JSONC_EXT) {
    return Promise.resolve(scriptComments(source, ts.ScriptKind.JSON));
  }
  return Promise.resolve(HASH_COMMENT_EXTS.has(ext) || basename(source.path) === DOCKERFILE ? hashComments(source) : []);
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
          ...(source.path.startsWith(HOOKS) ? [] : [...line.matchAll(BARE)]).map(([token]) => ({ token, present: tracked.basenames.has(token) })),
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

/** Every tracked source under the scanned roots or among the root config files, in a language this reads, that names a
 *  path anywhere in its text. */
function candidateSources(tracked: Tracked, read: (path: string) => string = readFromRepo): Source[] {
  const readable = (path: string): boolean =>
    LAW_DOC.test(path) ||
    ROOT_CONFIG.test(path) ||
    TSCONFIG.test(path) ||
    path === DOCKERFILE ||
    (SCANNED_ROOTS.some((root) => path.startsWith(`${root}/`)) &&
      !path.startsWith(VENDORED) &&
      (SCRIPT_KINDS[extname(path)] !== undefined || extname(path) === CSS_EXT || HASH_COMMENT_EXTS.has(extname(path))));
  return [...tracked.paths]
    .filter(readable)
    .map((path) => ({ path, text: read(path) }))
    .filter((source) => ANY_PATH.test(source.text.replaceAll(MODULE_SPECIFIER, "")));
}

describe("the real tree", () => {
  test("every path a code comment or law document names is a tracked file", async () => {
    const tracked = trackedFiles();
    const sources = candidateSources(tracked);
    // A read that missed a root or a language would pass every citation in it.
    expect(SCANNED_ROOTS.filter((root) => !sources.some((source) => source.path.startsWith(`${root}/`)))).toStrictEqual([]);
    expect(sources.filter((source) => ROOT_CONFIG.test(source.path)).map((source) => extname(source.path))).toEqual(
      expect.arrayContaining([".ts", ".yaml", JSONC_EXT]),
    );
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
      { path: "packages/x/src/h.ts", text: "// the band moved to gone-source.tsx\n" },
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
      "packages/x/src/h.ts:1 gone-source.tsx",
      "tooling/run.sh:2 packages/x/src/gone.ts",
      "docs/law/Law.md:3 packages/x/src/gone.ts",
      "docs/law/Law.md:3 app-shell/lib/moved.ts",
    ]);
  });

  test("reads the root configs, the workflow, image and hook homes and every tsconfig, and nothing else outside the scanned roots", async () => {
    const planted: Readonly<Record<string, string>> = {
      "eslint.config.ts": "// see tests/tooling/gone.test.ts\nexport default [];\n",
      "pnpm-workspace.yaml": "packages:\n  # pinned by tests/server/gone.int.test.ts\n  - packages/*\n",
      "tsconfig.base.json": '{\n  // docs/law/Gone.md owns this\n  "compilerOptions": { "path": "docs/law/Quoted.md" }\n}\n',
      "scripts/corpus-fixture.ts": "// moved to tooling/src/gone.ts\nexport {};\n",
      "scripts/install.sh": "# see docs/law/Gone.md\necho ok\n",
      ".github/workflows/ci.yml": "# docs/law/Gone.md\n",
      ".github/actions/setup/run.mjs": "// see tooling/src/gone.ts\nexport {};\n",
      "docker/compose.yaml": "# docs/law/Gone.md\n",
      "docker/entrypoint.sh": "# moved to scripts/gone.sh\n",
      [DOCKERFILE]: "# pinned by tests/tooling/gone.test.ts\nFROM node\n",
      ".claude/hooks/guard.mjs": "// see docs/law/Gone.md\n",
      "packages/x/tsconfig.json": '{\n  // the world docs/law/Gone.md names\n  "include": ["src"]\n}\n',
      "packages/x/package.json": '{ "description": "docs/law/Gone.md" }\n',
      "package.json": '{ "description": "docs/law/Gone.md" }\n',
    };
    const files: Tracked = { paths: new Set(Object.keys(planted)), basenames: new Set() };
    const sources = candidateSources(files, (path) => planted[path] ?? "");
    expect(await staleCitations(sources, tracked)).toStrictEqual([
      "eslint.config.ts:1 tests/tooling/gone.test.ts",
      "pnpm-workspace.yaml:2 tests/server/gone.int.test.ts",
      "tsconfig.base.json:2 docs/law/Gone.md",
      "scripts/corpus-fixture.ts:1 tooling/src/gone.ts",
      "scripts/install.sh:1 docs/law/Gone.md",
      ".github/workflows/ci.yml:1 docs/law/Gone.md",
      ".github/actions/setup/run.mjs:1 tooling/src/gone.ts",
      "docker/compose.yaml:1 docs/law/Gone.md",
      "docker/entrypoint.sh:1 scripts/gone.sh",
      "Dockerfile:1 tests/tooling/gone.test.ts",
      ".claude/hooks/guard.mjs:1 docs/law/Gone.md",
      "packages/x/tsconfig.json:2 docs/law/Gone.md",
    ]);
  });

  test("passes a tracked path, a string, JSX text, a URL and a glob", async () => {
    const sources: Source[] = [
      { path: "packages/x/src/a.ts", text: "// docs/law/Spine-Testing.md and real.ct.tsx and ./real.ts\n" },
      { path: "packages/x/src/b.ts", text: 'const path = "docs/law/Gone.md"; const t = `/* tests/a/gone.ct.tsx */`;\n' },
      { path: "packages/x/src/c.tsx", text: "export const c = <p>See https://example.com and copy.ct.tsx // not a comment</p>;\n" },
      { path: "packages/x/src/d.ts", text: "// https://example.com/docs/law/Gone.md\n// every tests/**/*.ct.tsx and tests/a/ directory\n" },
      { path: "packages/x/src/f.ts", text: "// real.ts, its `-model.ts` sibling and react.d.ts\n" },
      { path: "packages/x/src/e.css", text: '.a { content: "/* gone.ct.tsx */"; }\n' },
      {
        path: "docs/law/Law.md",
        text: '# Law\n\nSee `packages/x/src/real.ts`, [the spine](./Spine-Testing.md), `<domain>/verbs/<action>.ts`, `legacy-source/ui/gone.ct.tsx` and `"./button": "./src/button/index.ts"`.\n',
      },
    ];
    expect(await staleCitations(sources, tracked)).toStrictEqual([]);
  });
});
