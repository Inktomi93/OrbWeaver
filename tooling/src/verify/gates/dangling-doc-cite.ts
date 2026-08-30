// Gate: dangling-doc-cite (#873) — a source COMMENT naming a `docs/**.md` that does not exist on disk.
// Code DOES cite docs (Documentation-Law §Relocation, amended 2026-08-30: ~250 comment sites), so a doc
// move that skips the citer sweep leaves a pointer to nowhere — the exact lie the previous archival pass
// left in eight comments. COMMENTS-INTENDED: comments ARE the subject, and scoping to them is what keeps a
// gate/test FIXTURE STRING (a deliberately-absent doc path inside a mustFlag map) out of scope with no
// exemption grammar at all. This header may not spell a live example path — the gate would flag itself.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import type { ExemptionTable, Finding, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { blankTsComments } from "../lib/comment-spans.ts";

// A repo-relative doc token. Anchored on the `docs/` tier because that is the only one this repo has; a
// bare `foo.md` in prose is not a repo-path claim and is deliberately out of scope (precision over recall).
// THE LOOKBEHIND IS LOAD-BEARING: a vendor URL carries the same segment
// (`https://platform.claude.com/docs/en/…`), and without the fence three live comments citing Anthropic's
// own published docs read as phantom REPO paths. A cite must start at a word boundary to be ours.
const DOC_TOKEN_RE = /(?<![\w./-])docs\/[A-Za-z0-9_./+-]*\.md/gu;
// A token carrying a glob / brace / placeholder / elision is a PROSE PATTERN, never a literal cite.
const NON_LITERAL_RE = /[*{}<>]|\.\.\.|…/u;
// Trailing coordinates a comment cite commonly carries — stripped before the existence test.
const TRIM_ANCHOR_RE = /#[^\s]*$/u;
const TRIM_LINEREF_RE = /:\d+(?:-\d+)?$/u;
const TRIM_PUNCT_RE = /[.,;:)\]`'"]+$/u;

/** Strip the trailing anchor / `:line` / prose punctuation a cite carries in running text. */
function trimCite(raw: string): string {
  return raw.replace(TRIM_ANCHOR_RE, "").replace(TRIM_LINEREF_RE, "").replace(TRIM_PUNCT_RE, "");
}

/** Every distinct literal doc cite in a chunk of COMMENT text, with its 0-based offset in that chunk. */
function citesIn(text: string): readonly { readonly ref: string; readonly index: number }[] {
  const out: { ref: string; index: number }[] = [];
  for (const m of text.matchAll(DOC_TOKEN_RE)) {
    const ref = trimCite(m[0]);
    if (ref.length > "docs/".length && !NON_LITERAL_RE.test(ref)) {
      out.push({ ref, index: m.index });
    }
  }
  return out;
}

// ── arm A: the ts-morph project's own files ───────────────────────────────────────────────────────────
// `blankTsComments` is LENGTH-PRESERVING, so a character the blanked text changed IS a comment character.
// Diffing against it is how this gate reads comments through the ONE home instead of hand-rolling a
// `//`-regex — the exact hazard comment-spans.ts exists to end (a `https://` inside a string literal ate
// the rest of its line in a hand-rolled sweep).
const COMMENT_CHAR = " ";

/** The file's text with every NON-comment character blanked — the inverse of `blankTsComments`. */
function commentsOnly(sf: SourceFile): string {
  const raw = sf.getFullText();
  const blanked = blankTsComments(sf);
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] ?? "";
    // A newline survives on both sides, so keep it: the line arithmetic below depends on it.
    if (ch === "\n") {
      out += ch;
      continue;
    }
    // Unchanged by the blanking ⇒ this character is CODE, so blank it; changed ⇒ it was a comment.
    out += blanked[i] === ch ? COMMENT_CHAR : ch;
  }
  return out;
}

// ── arm B: the files the shared walk never loads ──────────────────────────────────────────────────────
// `harnessGlobs` covers packages/*/src, tests/, tooling/src/ — so every ROOT config and every shipped
// public asset is outside it, and two of the four real lies the #873 census found lived exactly there
// (`eslint.config.js`, `packages/client/public/*.svg`). The set is DERIVED from the tree, never a path
// list: a hard-coded file constant dies silently on rename (GATE-AUTHORING.md §3).
const ROOT_EXTS = [".ts", ".js", ".cjs", ".mjs", ".yaml", ".yml"] as const;
const PUBLIC_EXTS = [".svg", ".css"] as const;
const LINE_COMMENT_BY_EXT: Readonly<Record<string, string>> = { ".yaml": "#", ".yml": "#" };
const XML_COMMENT_EXTS = new Set([".svg"]);

const BLOCK_OPEN = "/*";
const BLOCK_CLOSE = "*/";
const XML_OPEN = "<!--";
const XML_CLOSE = "-->";
const SLASH_LINE = "//";

function extOf(rel: string): string {
  const dot = rel.lastIndexOf(".");
  return dot === -1 ? "" : rel.slice(dot);
}

/** Blank everything outside a comment, for a file the ts-morph project does not carry. Deliberately
 *  SIMPLE per syntax: a false POSITIVE here is loud and fixable, a false pass is a gate that reads ✓
 *  forever (GATE-AUTHORING.md §5, "the permissive direction is the dangerous one"). */
function commentsOnlyText(rel: string, text: string): string {
  const ext = extOf(rel);
  const line = LINE_COMMENT_BY_EXT[ext];
  const xml = XML_COMMENT_EXTS.has(ext);
  let out = "";
  let inBlock = false;
  for (const raw of text.split("\n")) {
    if (xml) {
      out += `${xmlCommentsOfLine(raw)}\n`;
      continue;
    }
    if (line !== undefined) {
      const at = raw.indexOf(line);
      out += `${at === -1 ? "" : raw.slice(at)}\n`;
      continue;
    }
    const { kept, open } = slashCommentsOfLine(raw, inBlock);
    inBlock = open;
    out += `${kept}\n`;
  }
  return out;
}

function xmlCommentsOfLine(raw: string): string {
  const open = raw.indexOf(XML_OPEN);
  if (open === -1) {
    return "";
  }
  const close = raw.indexOf(XML_CLOSE, open);
  return close === -1 ? raw.slice(open) : raw.slice(open, close);
}

/** One line of a C-style syntax (line comments plus block comments). Block state carries across lines. */
function slashCommentsOfLine(raw: string, inBlock: boolean): { readonly kept: string; readonly open: boolean } {
  if (inBlock) {
    const close = raw.indexOf(BLOCK_CLOSE);
    return close === -1 ? { kept: raw, open: true } : { kept: raw.slice(0, close), open: false };
  }
  const block = raw.indexOf(BLOCK_OPEN);
  const slash = raw.indexOf(SLASH_LINE);
  if (block !== -1 && (slash === -1 || block < slash)) {
    const close = raw.indexOf(BLOCK_CLOSE, block);
    if (close === -1) {
      return { kept: raw.slice(block), open: true };
    }
    const rest = slashCommentsOfLine(raw.slice(close + BLOCK_CLOSE.length), false);
    return { kept: `${raw.slice(block, close)} ${rest.kept}`, open: rest.open };
  }
  return { kept: slash === -1 ? "" : raw.slice(slash), open: false };
}

function listDir(root: string, rel: string): readonly string[] {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    return [];
  }
  const out: string[] = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const child = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      out.push(...listDir(root, child));
    } else {
      out.push(child);
    }
  }
  return out;
}

/** Arm B's fileset, DERIVED: every repo-root config with a comment syntax, plus every shipped public
 *  asset under a package's own `public` dir. Empty is the blindness tripwire, never a pass. */
function rootConfigFiles(root: string): readonly string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => !e.isDirectory() && ROOT_EXTS.some((x) => e.name.endsWith(x)))
    .map((e) => e.name);
}

function publicAssetFiles(root: string): readonly string[] {
  const pkgs = join(root, "packages");
  if (!existsSync(pkgs)) {
    return [];
  }
  const out: string[] = [];
  for (const p of readdirSync(pkgs, { withFileTypes: true })) {
    if (p.isDirectory()) {
      out.push(...listDir(root, `packages/${p.name}/public`).filter((f) => PUBLIC_EXTS.some((x) => f.endsWith(x))));
    }
  }
  return out;
}

function nonProjectFiles(root: string): readonly string[] {
  return [...rootConfigFiles(root), ...publicAssetFiles(root)].sort((a, b) => a.localeCompare(b));
}

// ── the exemption table ───────────────────────────────────────────────────────────────────────────────
// A doc path a comment deliberately names though it is not on this tree. Two-sided: a row that matches no
// live UNRESOLVED cite is RED (GATE-AUTHORING.md §4.4). Armed EMPTY at mint — the four real lies the #873
// census found were FIXED in the authoring lane rather than parked (§4.7).
const ALLOW: ExemptionTable = {};

const ANCHOR_REL = "docs/architecture/core/AGENTS.md";

const STALE_MSG = (ref: string, why: string): string =>
  `stale dangling-doc-cite allowlist row \`${ref}\` — no comment on the tree cites it unresolved any more ` +
  `(row why: ${why}). Delete the row from ALLOW in tooling/src/verify/gates/dangling-doc-cite.ts ` +
  "(GATE-AUTHORING.md §4.4: every exemption is two-sided).";

const BLIND_MSG =
  "dangling-doc-cite derived ZERO non-project files — its root-config + public-asset walk is blind, so " +
  "every lie living outside the ts-morph workspace (an eslint.config.js comment, a shipped .svg) reads as " +
  "clean. Re-point the derivation in tooling/src/verify/gates/dangling-doc-cite.ts (GATE-AUTHORING.md §4.6).";

const CITE_MSG = (ref: string): string =>
  `comment cites \`${ref}\` — no such doc exists. A doc move owes its citer sweep ` +
  "(Documentation-Law.md §Relocation & retirement step 2); a pointer to nowhere is worse than no pointer.";

/** One file's findings, from its COMMENT text alone. `at` is the 0-based offset of the doc token in
 *  `commentText`, which is line-aligned with the raw file, so the line/column are exact. */
function findingsFor(rel: string, commentText: string, hit: Set<string>, root: string): readonly Finding[] {
  const out: Finding[] = [];
  for (const { ref, index } of citesIn(commentText)) {
    if (existsSync(join(root, ref))) {
      continue;
    }
    hit.add(ref);
    if (ref in ALLOW) {
      continue;
    }
    const before = commentText.slice(0, index);
    const nl = before.lastIndexOf("\n");
    // @finding-overload-ok: this gate's unit is a COMMENT SPAN, and a comment has no ts-morph node to
    // report — the caret is derived from an offset into the blanked-text projection, and half the corpus
    // (root configs, shipped `.svg`) has no SourceFile at all. Converting to the node overload is not
    // possible without giving up arm B. Ends if the harness ever offers a comment-node report shape.
    out.push({ file: rel, line: before.split("\n").length, column: index - nl, token: ref, message: CITE_MSG(ref) });
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "dangling-doc-cite",
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  // WHOLE-PROJECT because arm B walks a fileset the scoped runner never narrows, and the stale arm is a
  // whole-tree question. Arm A's verdicts are per-file, but the gate as a whole is not incremental-safe.
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a source COMMENT cites a `docs/**.md` path that does not exist. Code DOES cite docs (Documentation-Law.md " +
    "§Relocation & retirement, amended 2026-08-30), so a move owes the citer sweep — and a comment pointing at a " +
    "doc that is gone is drift the amnesiac reader cannot tell from a real home. Only COMMENTS are in scope: a " +
    "fixture/example path inside a string literal is deliberately not a cite.",
  fix: "repoint the comment at the doc's real home, or — where D141's no-bare-pointers rule applies — replace the pointer with the fact the comment actually needed and drop the path.",
  run: (ctx: GateRunCtx) => {
    const hit = new Set<string>();
    let scanned = 0;
    for (const sf of ctx.files) {
      const rel = sf.getFilePath().replace(`${ctx.root}/`, "");
      scanned += 1;
      const text = sf.getFullText();
      if (!text.includes("docs/")) {
        continue; // the candidate fence: a file whose RAW text cannot match cannot match blanked either
      }
      for (const f of findingsFor(rel, commentsOnly(sf), hit, ctx.root)) {
        ctx.report(f);
      }
    }
    const nonProject = nonProjectFiles(ctx.root);
    for (const rel of nonProject) {
      scanned += 1;
      const text = readFileSync(join(ctx.root, rel), "utf8");
      if (!text.includes("docs/")) {
        continue;
      }
      for (const f of findingsFor(rel, commentsOnlyText(rel, text), hit, ctx.root)) {
        ctx.report(f);
      }
    }
    ctx.scan({ unit: "commented file", scanned });
    // A real-tree ANCHOR, never a `scope.kind` check (GATE-AUTHORING.md §4.5): `scope.kind === "project"`
    // is TRUE inside a conformance mini-project too, and both arms below would fire there.
    if (!existsSync(join(ctx.root, ANCHOR_REL))) {
      return;
    }
    if (nonProject.length === 0) {
      // The blindness tripwire: `line: 0` is genuinely file-level, so it is unsuppressible by construction.
      ctx.report({ file: ".", line: 0, column: 0, message: BLIND_MSG });
    }
    for (const [ref, row] of Object.entries(ALLOW)) {
      if (!hit.has(ref)) {
        // The stale arm anchors on the GATE file at `line: 0` — file-level, so unsuppressible by
        // construction (GATE-AUTHORING.md §1); a stale exemption is a loaded gun.
        ctx.report({ file: "tooling/src/verify/gates/dangling-doc-cite.ts", line: 0, column: 0, message: STALE_MSG(ref, row.why) });
      }
    }
  },
  mustFlag: [
    {
      files: {
        // The founding shape: a line comment naming a doc that moved away. The ANCHOR is planted so the
        // stale/blindness arms run at all (§4.5) — with a root config present, arm B is not blind.
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "knip.ts": "export const config = 1;\n",
        "packages/kit/src/thing.ts": "// See docs/design/gone-forever.md for the ruling.\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "no such doc exists" },
      why: "the founding defect: a `//` comment cites a doc that no longer exists — the eight lies the previous archival pass left behind",
    },
    {
      files: {
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "knip.ts": "export const config = 1;\n",
        // A JSDoc BLOCK comment, and a `:line` coordinate that must be stripped before the existence test —
        // otherwise every `path.md:42` cite in the corpus reads as a phantom.
        "packages/kit/src/block.ts": "/** Home: docs/design/vanished.md:88 — the shape. */\nexport const y = 2;\n",
      },
      expect: { messageIncludes: "vanished.md" },
      why: "a block comment, and the `:line` suffix stripped before existsSync — a live corpus idiom that would otherwise flag every cite",
    },
    {
      files: {
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        // ARM B: a repo-ROOT config, which `harnessGlobs` never loads. Two of the four real lies the #873
        // census found lived exactly here, so a project-only gate is a false clean at those sites.
        "eslint.config.js": "// See docs/Documentation-Law.md §Enforcement.\nexport default [];\n",
      },
      expect: { messageIncludes: "Documentation-Law.md" },
      why: "arm B: a root config the ts-morph workspace never carries — the eslint.config.js class, invisible to a project-only scan",
    },
    {
      files: {
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "knip.ts": "export const config = 1;\n",
        // ARM B, the shipped-asset half: an XML comment in a public SVG, the other real-lie site.
        "packages/client/public/favicon.svg": "<svg><!-- Source: docs/design/login-loading-screen.md §9 --></svg>\n",
      },
      expect: { messageIncludes: "login-loading-screen.md" },
      why: "arm B: an XML comment in a shipped public asset — the favicon/orb-mark class the #873 census found dangling",
    },
  ],
  mustPass: [
    {
      files: {
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "knip.ts": "export const config = 1;\n",
        "docs/design/real.md": "---\nkind: design\n---\n\nplanted.\n",
        "packages/kit/src/ok.ts": "// See docs/design/real.md §2 for the ruling.\nexport const x = 1;\n",
      },
      why: "a comment citing a doc that EXISTS, with a `§` suffix — the overwhelmingly common shape; no false flag",
    },
    {
      files: {
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "knip.ts": "export const config = 1;\n",
        // THE DECLARED LIMIT that makes this gate need no fixture-string exemption grammar: a gate's own
        // mustFlag map and a test's planted tree name doc paths that MUST NOT exist. They are string
        // literals, so scoping to comments excludes them structurally rather than by allowlist.
        "packages/kit/src/fixture.ts":
          'export const example = { files: { "docs/example.md": "x", "docs/architecture/core/__probe.md": "y" } };\nexport const p = "docs/design/never-existed.md";\n',
      },
      why: "the DECLARED LIMIT: a fixture/example doc path in a STRING LITERAL is not a cite — 24 of the 28 dangling paths the #873 census found are exactly this, and comment-scoping excludes them with no allowlist",
    },
    {
      files: {
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "knip.ts": "export const config = 1;\n",
        // A GLOB / placeholder token is a prose PATTERN, not a literal cite — never guessed.
        "packages/kit/src/prose.ts": "// Sweep docs/architecture/**/*.md and docs/design/<name>.md before moving.\nexport const x = 1;\n",
      },
      why: "a glob and a `<placeholder>` in a comment are prose patterns, not literal cites — precision over recall",
    },
    {
      files: {
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "knip.ts": "export const config = 1;\n",
        // The hand-rolled-`//`-scanner hazard comment-spans.ts exists to end: a `https://` URL inside a
        // string literal must not be read as a comment opener that swallows the rest of the line.
        "packages/kit/src/url.ts": 'export const u = "https://x.test/docs/design/not-ours.md";\n',
      },
      why: "a `//` inside a STRING literal is not a comment — arm A reads comments through comment-spans.ts, never a hand-rolled regex",
    },
    {
      files: {
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "knip.ts": "export const config = 1;\n",
        // THE VENDOR-URL FENCE. An external doc URL carries the same `docs/` segment, and without the
        // lookbehind three live comments citing Anthropic's own published docs read as phantom REPO paths.
        "packages/kit/src/vendor.ts":
          "// Not supported by the subset (https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md).\nexport const x = 1;\n",
      },
      why: "a VENDOR doc URL is not a repo cite — the `docs/` segment inside `https://…/docs/en/…` must not flag; the DOC_TOKEN_RE lookbehind is what fences it",
    },
  ],
};
