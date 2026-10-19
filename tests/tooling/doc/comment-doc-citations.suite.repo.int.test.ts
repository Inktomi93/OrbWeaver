// A comment in authored source, a root config or a shipped asset that cites a Markdown doc must name a tracked doc.
// Only comment text counts: a doc path inside a string literal is a fixture or an example, never a citation.
import { basename, extname } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { describe } from "vitest";
import { blankTsComments, commentSpansInText } from "../../../tooling/src/verify/lib/comment-spans.ts";
import { populationIncludes } from "../../../tooling/src/verify/lib/population-resolver.ts";
import { scaledBudget } from "../_load-budget.ts";
import { scanText } from "./_text-scan.ts";
import type { RepoTree } from "./_tree.ts";
import { isMarkdown, isTypeScript, loadPlantedTree, loadTree } from "./_tree.ts";

// `docs/`-prefixed repo path. The lookbehind keeps a vendor URL's own `docs/` segment out; `#` and `:` are outside the class so an anchor or a line coordinate ends the match.
const DOC_TOKEN_RE = /(?<![\w./-])docs\/[A-Za-z0-9_./+-]*\.md/gu;
// A bare `.md` basename or short relative path, the house idiom for citing a doc. The scheme word of a URL and a `docs/` start are owned elsewhere.
const BARE_DOC_RE = /(?<![\w./+-])(?!https?\b)(?!docs\/)([A-Za-z0-9_][A-Za-z0-9_/.+-]*\.md)/gu;
// A glob, brace, placeholder or elision is a prose pattern, never a literal cite.
const NON_LITERAL_RE = /[*{}<>…]|\.\.\./u;
const ROOT_CONFIG_EXTS = [".ts", ".js", ".cjs", ".mjs", ".yaml", ".yml"] as const;
const PUBLIC_ASSET_EXTS = [".svg", ".css"] as const;
const PUBLIC_ASSET_RE = /^packages\/[^/]+\/public\//u;
const YAML_COMMENT_EXTS: readonly string[] = [".yaml", ".yml"];
const XML_COMMENT_RE = /<!--[\s\S]*?-->/gu;
const SCRIPT_EXTS: readonly string[] = [".ts", ".tsx", ".js", ".cjs", ".mjs"];

interface CommentCitations {
  readonly findings: readonly string[];
  /** Authored sources whose raw text could cite a doc and were read as comments. */
  readonly sources: number;
  /** Root configs and public assets read as comments. */
  readonly nonProjectMembers: number;
}

/** `raw` with every UTF-16 unit outside `keep` blanked; newlines survive, so line and column stay authored. */
function blankUnless(raw: string, keep: (index: number) => boolean): string {
  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw.charAt(index);
    out += character === "\n" || keep(index) ? character : " ";
  }
  return out;
}

/** The text with every character outside `spans` blanked. */
function keepOnly(text: string, spans: readonly { readonly pos: number; readonly end: number }[]): string {
  return blankUnless(text, (index) => spans.some((span) => index >= span.pos && index < span.end));
}

const scratch = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });

/** Comments of a script, through the one comment lexer the verify instruments share (`blankTsComments`). */
function scriptComments(path: string, raw: string): string {
  const sourceFile = scratch.createSourceFile(`/scan${extname(path)}`, raw, { overwrite: true });
  const blanked = blankTsComments(sourceFile);
  scratch.removeSourceFile(sourceFile);
  // `blankTsComments` replaces exactly the comment characters, so a changed unit is a comment unit.
  return blankUnless(raw, (index) => blanked[index] !== raw[index]);
}

function commentText(path: string, raw: string): string {
  const ext = extname(path);
  if (SCRIPT_EXTS.includes(ext)) {
    return scriptComments(path, raw);
  }
  if (ext === ".css") {
    return keepOnly(raw, commentSpansInText(raw, { lineComments: false }));
  }
  if (ext === ".svg") {
    return keepOnly(
      raw,
      [...raw.matchAll(XML_COMMENT_RE)].map((match) => ({ pos: match.index, end: match.index + match[0].length })),
    );
  }
  if (YAML_COMMENT_EXTS.includes(ext)) {
    return raw
      .split("\n")
      .map((line) => (line.includes("#") ? `${" ".repeat(line.indexOf("#"))}${line.slice(line.indexOf("#"))}` : ""))
      .join("\n");
  }
  throw new Error(`no comment grammar for ${path}`);
}

function isNonProjectMember(path: string): boolean {
  const ext = extname(path);
  return path.includes("/")
    ? PUBLIC_ASSET_RE.test(path) && (PUBLIC_ASSET_EXTS as readonly string[]).includes(ext)
    : (ROOT_CONFIG_EXTS as readonly string[]).includes(ext);
}

function citesIn(text: string): readonly { readonly token: string; readonly line: number; readonly bare: boolean }[] {
  return [
    ...scanText(text, DOC_TOKEN_RE).map((hit) => ({ ...hit, bare: false })),
    ...scanText(text, BARE_DOC_RE).map((hit) => ({ ...hit, bare: true })),
  ].filter((hit) => !NON_LITERAL_RE.test(hit.token));
}

function commentDocCitations(tree: RepoTree): CommentCitations {
  const members = tree.paths.filter(isNonProjectMember);
  // A checkout with no root config and no public asset would read every config comment as clean without reading it.
  if (members.length === 0) {
    throw new Error("the tree holds no root config or public asset, so the non-project half of the scan is blind");
  }
  const sources = tree.paths.filter((path) => isTypeScript(path) && populationIncludes("@authored", path) && tree.read(path).includes(".md"));
  const present = new Set(tree.paths);
  const docBasenames = new Set(tree.paths.filter(isMarkdown).map((path) => basename(path)));
  const findings = [...sources, ...members].flatMap((path) =>
    citesIn(commentText(path, tree.read(path)))
      .filter((hit) => !(hit.bare ? docBasenames.has(basename(hit.token)) : present.has(hit.token)))
      .map((hit) => `${path}:${String(hit.line)} ${hit.token}`),
  );
  return { findings: findings.toSorted((left, right) => left.localeCompare(right)), sources: sources.length, nonProjectMembers: members.length };
}

const ROOT_CONFIG = { "knip.ts": "export const config = 1;\n" } as const;
const ANCHOR = { "packages/kit/src/anchor.ts": "export const anchor = 1;\n" } as const;

describe("the real tree", () => {
  test("every doc a comment cites is a tracked doc", { timeout: scaledBudget(60_000) }, ({ repoRoot }) => {
    const result = commentDocCitations(loadTree(repoRoot));
    // A walk that read nothing would pass: both halves must have members.
    expect(result.sources).toBeGreaterThan(0);
    expect(result.nonProjectMembers).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });
});

describe("a planted tree", () => {
  test.for([
    {
      why: "a line comment cites a doc that no longer exists",
      files: { ...ROOT_CONFIG, "packages/kit/src/thing.ts": "// See docs/design/gone-forever.md for the ruling.\nexport const x = 1;\n" },
      expected: ["packages/kit/src/thing.ts:1 docs/design/gone-forever.md"],
    },
    {
      why: "a block comment, and a :line coordinate that ends the token before the identity question",
      files: { ...ROOT_CONFIG, "packages/kit/src/block.ts": "/** Home: docs/design/vanished.md:88 — the shape. */\nexport const y = 2;\n" },
      expected: ["packages/kit/src/block.ts:1 docs/design/vanished.md"],
    },
    {
      why: "a root config comment, which no project walk loads",
      files: { "eslint.config.js": "// See docs/Gone-Law.md §Enforcement.\nexport default [];\n", ...ANCHOR },
      expected: ["eslint.config.js:1 docs/Gone-Law.md"],
    },
    {
      why: "an XML comment in a shipped public asset",
      files: { ...ROOT_CONFIG, "packages/client/public/favicon.svg": "<svg><!-- Source: docs/design/login-loading-screen.md §9 --></svg>\n", ...ANCHOR },
      expected: ["packages/client/public/favicon.svg:1 docs/design/login-loading-screen.md"],
    },
    {
      why: "a bare basename cite to a doc that does not exist",
      files: { ...ROOT_CONFIG, "packages/kit/src/bare.ts": "// See Gone-Forever-Design.md for the ruling.\nexport const x = 1;\n" },
      expected: ["packages/kit/src/bare.ts:1 Gone-Forever-Design.md"],
    },
    {
      why: "an all-lowercase hyphenated bare basename",
      files: { ...ROOT_CONFIG, "packages/kit/src/lower-hyph.ts": "// See gate-runtime-gone-forever.md for the design.\nexport const x = 1;\n" },
      expected: ["packages/kit/src/lower-hyph.ts:1 gate-runtime-gone-forever.md"],
    },
    {
      why: "an unhyphenated all-lowercase bare basename",
      files: { ...ROOT_CONFIG, "packages/kit/src/unhyph.ts": "// See providers.md for the connection design.\nexport const x = 1;\n" },
      expected: ["packages/kit/src/unhyph.ts:1 providers.md"],
    },
    {
      why: "a short relative path that resolves neither by suffix nor by basename",
      files: { ...ROOT_CONFIG, "packages/kit/src/relpath.ts": "// See reports/tooling/GONE-REPORT.md for the numbers.\nexport const x = 1;\n" },
      expected: ["packages/kit/src/relpath.ts:1 reports/tooling/GONE-REPORT.md"],
    },
  ])("is flagged: $why", async ({ files, expected }, { plantedTree }) => {
    const result = commentDocCitations(loadPlantedTree(await plantedTree(files)));
    expect(result.findings).toEqual(expected);
  });

  test.for([
    {
      why: "a comment citing a doc that exists, with a section suffix",
      files: {
        ...ROOT_CONFIG,
        "docs/design/real.md": "---\nkind: design\n---\n\nplanted.\n",
        "packages/kit/src/ok.ts": "// See docs/design/real.md §2 for the ruling.\nexport const x = 1;\n",
      },
    },
    {
      why: "a fixture or example doc path in a string literal is not a cite",
      files: {
        ...ROOT_CONFIG,
        "packages/kit/src/fixture.ts":
          'export const example = { files: { "docs/example.md": "x", "docs/law/__probe.md": "y" } };\nexport const p = "docs/design/never-existed.md";\n',
      },
    },
    {
      why: "a glob and a placeholder are prose patterns",
      files: { ...ROOT_CONFIG, "packages/kit/src/prose.ts": "// Sweep docs/law/**/*.md and docs/plans/<name>.md before moving.\nexport const x = 1;\n" },
    },
    {
      why: "an elision is a prose pattern",
      files: {
        ...ROOT_CONFIG,
        "packages/kit/src/elision.ts": "// The ruling moved; see docs/design/.../ruling.md once the tree settles.\nexport const x = 1;\n",
      },
    },
    {
      why: "a double slash inside a string literal is not a comment",
      files: { ...ROOT_CONFIG, "packages/kit/src/url.ts": 'export const u = "https://x.test/docs/design/not-ours.md";\n' },
    },
    {
      why: "a vendor doc URL is not a repo cite",
      files: {
        ...ROOT_CONFIG,
        "packages/kit/src/vendor.ts":
          "// Not supported by the subset (https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md).\nexport const x = 1;\n",
      },
    },
    {
      why: "the svg asset is a member and cites a real doc; the neighbouring text asset is not a member",
      files: {
        ...ROOT_CONFIG,
        "docs/design/real.md": "---\nkind: design\n---\n\nplanted.\n",
        "packages/client/public/orb.svg": "<svg><!-- Source: docs/design/real.md §1 --></svg>\n",
        "packages/client/public/extra.txt": "// docs/design/gone.md is cited in a shipped text asset.\n",
        ...ANCHOR,
      },
    },
    {
      why: "a root markdown file is not a config this scan reads",
      files: { ...ROOT_CONFIG, "README.md": "// docs/design/gone.md is cited in root prose.\n", ...ANCHOR },
    },
    {
      why: "a bare basename whose doc exists",
      files: {
        ...ROOT_CONFIG,
        "docs/design/Real-Design.md": "---\nkind: design\n---\n\nplanted.\n",
        "packages/kit/src/bare-ok.ts": "// See Real-Design.md for the design.\nexport const x = 1;\n",
      },
    },
    {
      why: "an all-lowercase hyphenated basename whose doc exists",
      files: {
        ...ROOT_CONFIG,
        "docs/design/gate-runtime-real.md": "---\nkind: design\n---\n\nplanted.\n",
        "packages/kit/src/lower-hyph-ok.ts": "// See gate-runtime-real.md for the design.\nexport const x = 1;\n",
      },
    },
    {
      why: "an unhyphenated all-lowercase basename resolves against a tracked doc of the same name",
      files: {
        ...ROOT_CONFIG,
        "readme.md": "planted root readme.\n",
        "packages/kit/src/lower.ts": "// See readme.md for setup instructions.\nexport const x = 1;\n",
      },
    },
    {
      why: "a bare cite of a doc living outside docs/",
      files: {
        ...ROOT_CONFIG,
        "tooling/src/verify/gates/OUTSIDE-DOCS-LAW.md": "planted law outside docs.\n",
        "packages/kit/src/outside.ts": "// See OUTSIDE-DOCS-LAW.md for the rule.\nexport const x = 1;\n",
      },
    },
    {
      why: "a short relative path resolves by suffix against a tracked doc",
      files: {
        ...ROOT_CONFIG,
        "docs/law/Real-Relpath.md": "---\nkind: law\n---\n\nplanted.\n",
        "packages/kit/src/relpath-ok.ts": "// See law/Real-Relpath.md for the rule.\nexport const x = 1;\n",
      },
    },
    {
      why: "a bare basename in a string literal is not a cite",
      files: { ...ROOT_CONFIG, "packages/kit/src/str.ts": 'export const name = "Gone-Design.md";\n' },
    },
  ])("passes: $why", async ({ files }, { plantedTree }) => {
    const result = commentDocCitations(loadPlantedTree(await plantedTree(files)));
    expect(result.findings).toEqual([]);
  });

  test("a tree with no root config and no public asset refuses instead of reading clean", async ({ plantedTree }) => {
    const tree = loadPlantedTree(await plantedTree({ "packages/kit/src/ok.ts": "export const anchor = 1;\n" }));
    expect(() => commentDocCitations(tree)).toThrow("is blind");
  });

  test("an empty root config is a verdict, not an error", async ({ plantedTree }) => {
    const result = commentDocCitations(loadPlantedTree(await plantedTree({ "knip.ts": "", ...ANCHOR })));
    expect(result.nonProjectMembers).toBe(1);
    expect(result.findings).toEqual([]);
  });
});
