// review-mirror — regenerate a COMMENT-STRIPPED, DOCLESS copy of the codebase for UNBIASED review.
//
// Why: a reviewer (human or model) reading code WITH its comments/TSDoc grades the author's narration,
// not the behavior — comments assert correctness with zero enforcement, so they bias toward "the code's
// own story." Stripping them forces the code to testify alone. The scout/adversarial sweep runs against
// THIS mirror.
//
// WHAT IS STRIPPED: ONLY JS/TS CODE (.ts/.tsx/.js/... that isn't config). Comments there are logic
// narration and bias the reviewer. EVERYTHING ELSE IS COPIED VERBATIM — because their "comments" are
// load-bearing structure or config, not narration:
//   · SQL (drizzle migrations): `--` is a comment AND `--> statement-breakpoint` is a migrator directive —
//     stripping it corrupts the baseline. Copied verbatim.
//   · configs (biome.json, eslint.config.*, drizzle.config.*, tsconfig*, *.config.*, package.json): a
//     reviewer NEEDS the real config incl. its rule-explaining comments — never stripped.
//   · JSON / yaml / css / html / drizzle meta+snapshot: no review-biasing narration; copied verbatim.
//
// Footgun-proof by construction: the file list is `git ls-files`, so every .gitignore NEGATION
// (`!.../memory/build/`, `!.../src/data/`) is honored automatically — never drops tracked source. Asserts
// missingCode==0 (fails loud if any tracked code file is absent from the mirror).
//
// Usage:  node scripts/review-mirror.mjs [<target-dir>]     (default: ~/Documents/orbweaver-code-review)
// Then:   biome format --write <target-dir>   ·   tokei <target-dir>
//
// scripts/ zone rules (scripts/README.md): KISS, straight-line, hardcoded paths OK, not a `pnpm check` dep.

import { execSync } from "node:child_process";
import { closeSync, copyFileSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import process from "node:process";
import ts from "typescript";

const GIT_LS_MAX_BUFFER = 268_435_456; // 256 MiB — a large repo's git ls-files output
const MISSING_SAMPLE = 20; // paths printed on a missing-code failure
const CODE_EXT_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
// PRESERVED comments — suppression/directive markers are load-bearing (they change tooling behavior AND tell
// a reviewer a line was deliberately exempted). Covers lint/type suppressions AND this repo's OWN gate escape
// grammar: `// terse-ok:`, `// test-exempt`, `seated-exempt`, and the `@*-ok`/`@*-exempt` family
// (@foreign-id-ok, @owner-scope-write-ok, @finding-overload-ok, @swallowed-ok, @nullable-cmp-ok), plus SAFE:.
// Extend for any new custom marker.
const DIRECTIVE_RE =
  /\b(biome-ignore|eslint-(disable|enable)|prettier-ignore|v8 ignore|c8 ignore|istanbul ignore|knip)\b|@(ts-expect-error|ts-ignore|ts-nocheck|public|alias|internal|deprecated|dsCard)\b|[\w-]+-(ok|exempt|allow)\b|@ds-[\w-]+|@orb-[\w-]+|@instrument-[\w-]+|\bSAFE:/i;
// Copied VERBATIM even though they are JS/TS: drizzle migrations (SQL markers are load-bearing) + every
// flavour of config (a reviewer needs the real, commented config).
const VERBATIM_RE =
  /(^|\/)migrations\/|(^|\/)([^/]*\.config\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)|biome\.jsonc?|drizzle\.config\.[^/]+|tsconfig[^/]*\.json|package\.json|\.eslintrc[^/]*|eslint\.config\.[^/]+)$/;

const REPO = execSync("git rev-parse --show-toplevel").toString().trim();
const TARGET = process.argv[2] ?? join(homedir(), "Documents", "orbweaver-code-review");

// Prose + non-code + probe rigs are dropped entirely; everything else git tracks is kept (stripped or verbatim).
const DROP_PREFIX = ["docs/", "reports/", "scripts/probes/"];
const DROP_EXT = new Set([
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp3",
  ".mp4",
  ".webm",
  ".wav",
  ".ogg",
  ".pdf",
  ".zip",
  ".gz",
  ".wasm",
  ".keep",
  ".jsonl",
]);

const SCRIPT_KIND = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
};

// Parse to an AST (handles template literals / regex / JSX that desync a raw scanner) and blank every
// comment range. Walk getChildren() (NOT forEachChild) so a comment that is leading trivia of a CLOSING
// token (`// last\n]`, before `}`/`)`/`,`) is seen — those attach to tokens, and forEachChild misses them.
function stripComments(text, scriptKind) {
  const sf = ts.createSourceFile("f", text, ts.ScriptTarget.Latest, true, scriptKind);
  const ranges = [];
  const push = (rs) => {
    if (rs) {
      for (const r of rs) {
        ranges.push([r.pos, r.end]);
      }
    }
  };
  (function visit(node) {
    push(ts.getLeadingCommentRanges(text, node.pos));
    push(ts.getTrailingCommentRanges(text, node.end));
    for (const c of node.getChildren(sf)) {
      visit(c);
    }
  })(sf);
  if (ranges.length === 0) {
    return text;
  }
  const seen = new Set();
  const uniq = ranges
    .filter(([a, b]) => {
      const k = `${a}:${b}`;
      if (seen.has(k)) {
        return false;
      }
      seen.add(k);
      return true;
    })
    .sort((x, y) => x[0] - y[0]);
  let out = "";
  let cur = 0;
  for (const [a, b] of uniq) {
    if (a < cur) {
      continue;
    }
    out += text.slice(cur, a);
    const span = text.slice(a, b);
    if (DIRECTIVE_RE.test(span)) {
      out += span; // preserve suppression/directive markers verbatim (biome-ignore, @ts-expect-error, gate @*-ok, ...)
    } else {
      const nl = (span.match(/\n/g) || []).length;
      out += ` ${"\n".repeat(nl)}`; // keep newline count so line structure survives; space so tokens never merge
    }
    cur = b;
  }
  return out + text.slice(cur);
}

const tidy = (s) => s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");

// Only JS/TS code that is NOT a config file gets its comments stripped. Everything else → null (verbatim).
function scriptKindFor(file) {
  const ext = extname(file).toLowerCase();
  if (!(ext in SCRIPT_KIND)) {
    return null; // sql / json / yaml / css / html / etc → verbatim
  }
  if (VERBATIM_RE.test(file)) {
    return null; // configs + drizzle migrations → verbatim
  }
  return SCRIPT_KIND[ext];
}

const tracked = execSync("git ls-files", { cwd: REPO, maxBuffer: GIT_LS_MAX_BUFFER }).toString().split("\n").filter(Boolean);
let stripped = 0;
let copied = 0;
let dropped = 0;
let errored = 0;

for (const rel of tracked) {
  if (DROP_PREFIX.some((p) => rel.startsWith(p)) || DROP_EXT.has(extname(rel).toLowerCase())) {
    dropped++;
    continue;
  }
  const src = join(REPO, rel);
  if (lstatSync(src).isSymbolicLink()) {
    dropped++;
    continue;
  }
  const dst = join(TARGET, rel);
  mkdirSync(dirname(dst), { recursive: true });
  try {
    const kind = scriptKindFor(rel);
    if (kind === null) {
      copyFileSync(src, dst);
      copied++;
      continue;
    }
    const orig = readFileSync(src, "utf8");
    if (orig.includes("\u0000")) {
      copyFileSync(src, dst);
      copied++;
      continue;
    }
    writeFileSync(dst, tidy(stripComments(orig, kind)));
    stripped++;
  } catch (err) {
    errored++;
    console.error("ERR", rel, err.message);
  }
}

// every tracked CODE file must exist in the mirror (the footgun the rsync version had)
const missing = tracked
  .filter((r) => CODE_EXT_RE.test(r) && !DROP_PREFIX.some((p) => r.startsWith(p)))
  .filter((r) => {
    try {
      closeSync(openSync(join(TARGET, r), "r"));
      return false;
    } catch {
      return true;
    }
  });

console.log(JSON.stringify({ target: TARGET, tracked: tracked.length, stripped, copied, dropped, errored, missingCode: missing.length }, null, 2));
if (missing.length > 0) {
  console.error("MISSING CODE FILES (should be 0):", missing.slice(0, MISSING_SAMPLE));
  process.exit(1);
}
console.log(`\nnext:  biome format --write "${TARGET}"   ·   tokei "${TARGET}"`);
