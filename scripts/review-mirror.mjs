// review-mirror — regenerate a COMMENT-STRIPPED, DOCLESS copy of the codebase for UNBIASED review.
//
// Why: a reviewer (human or model) reading code WITH its comments/TSDoc grades the author's narration,
// not the behavior — comments assert correctness with zero enforcement, so they bias toward "the code's
// own story." Stripping them forces the code to testify alone. The scout/adversarial sweep runs against
// THIS mirror. (See the 2026-08-25 recon sweep: 10 scouts over bare code found 3 exploitable holes + a
// TOCTOU family, and REFUTED 7 of an audit's claims — that only works on un-narrated source.)
//
// Footgun-proof by construction: the file list is `git ls-files`, so every .gitignore NEGATION
// (`!packages/server/src/domain/chat/memory/build/`, `!.../src/data/`, ...) is honored automatically.
// The original throwaway used rsync blanket excludes and silently DROPPED source those negations
// restored (BE-1 suites failed to load, FE-4 rows read stale) — never again: git decides what's source.
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

const REPO = execSync("git rev-parse --show-toplevel").toString().trim();
const TARGET = process.argv[2] ?? join(homedir(), "Documents", "orbweaver-code-review");

// What the mirror deliberately DROPS (prose + non-code + probe rigs). Everything else git tracks is kept.
const DROP_PREFIX = ["docs/", "reports/", "scripts/probes/"]; // prose + one-shot probe data
const DROP_EXT = new Set([
  ".md", // docless: prose lives here, and the whole point is no narration
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".avif", // images
  ".woff",
  ".woff2",
  ".ttf",
  ".otf", // fonts
  ".mp3",
  ".mp4",
  ".webm",
  ".wav",
  ".ogg", // media
  ".pdf",
  ".zip",
  ".gz",
  ".wasm",
  ".keep",
  ".jsonl", // blobs / archives / fixtures data
]);

// ── comment strippers ───────────────────────────────────────────────────────────────────────────────────
const TS_LIKE = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".json": ts.ScriptKind.JSON,
};

// Parse to an AST (handles template literals / regex / JSX that desync a raw scanner) and blank every
// comment range. Walk getChildren() (NOT forEachChild) so a comment that is leading trivia of a CLOSING
// token (`// last\n]`, before `}`/`)`/`,`) is seen — those attach to tokens, and forEachChild misses them.
function stripTsLike(text, scriptKind) {
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
      continue; // overlapping (nested capture) — skip
    }
    out += text.slice(cur, a);
    const nl = (text.slice(a, b).match(/\n/g) || []).length;
    out += ` ${"\n".repeat(nl)}`; // keep newline count so line structure survives; space so tokens never merge
    cur = b;
  }
  return out + text.slice(cur);
}

function stripCss(s) {
  let out = "";
  let i = 0;
  let q = null;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (q) {
      out += c;
      if (c === "\\") {
        out += s[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === q) {
        q = null;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      let j = i + 2;
      let nl = "";
      while (j < s.length && !(s[j] === "*" && s[j + 1] === "/")) {
        if (s[j] === "\n") {
          nl += "\n";
        }
        j++;
      }
      out += ` ${nl}`;
      i = j + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
function stripHtml(s) {
  return s.replace(/<!--[\s\S]*?-->/g, (m) => "\n".repeat((m.match(/\n/g) || []).length));
}
function stripSql(s) {
  let out = "";
  let i = 0;
  let q = false;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (q) {
      out += c;
      if (c === "'") {
        if (n === "'") {
          out += n;
          i += 2;
          continue;
        }
        q = false;
      }
      i++;
      continue;
    }
    if (c === "'") {
      q = true;
      out += c;
      i++;
      continue;
    }
    if (c === "-" && n === "-") {
      while (i < s.length && s[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (c === "/" && n === "*") {
      let j = i + 2;
      let nl = "";
      while (j < s.length && !(s[j] === "*" && s[j + 1] === "/")) {
        if (s[j] === "\n") {
          nl += "\n";
        }
        j++;
      }
      out += nl;
      i = j + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
// yaml/toml/sh: drop only FULL-LINE `#` comments (keep a line-1 shebang; inline `#` is ambiguous in yaml).
function stripHashFullLine(s) {
  return s
    .split("\n")
    .map((line, idx) => (idx === 0 && line.startsWith("#!") ? line : /^\s*#/.test(line) ? "" : line))
    .join("\n");
}
const tidy = (s) => s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");

function stripperFor(file) {
  const ext = extname(file).toLowerCase();
  const base = file.toLowerCase().split("/").pop();
  if (ext in TS_LIKE) {
    return (t) => stripTsLike(t, TS_LIKE[ext]);
  }
  if (ext === ".css" || ext === ".scss") {
    return stripCss;
  }
  if (ext === ".html" || ext === ".htm") {
    return stripHtml;
  }
  if (ext === ".sql") {
    return stripSql;
  }
  if (ext === ".yml" || ext === ".yaml" || ext === ".toml" || ext === ".sh" || ext === ".bash" || base === "dockerfile") {
    return stripHashFullLine;
  }
  return null; // config we keep verbatim (e.g. no known comment syntax)
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────────────
const tracked = execSync("git ls-files", { cwd: REPO, maxBuffer: 256 * 1024 * 1024 })
  .toString()
  .split("\n")
  .filter(Boolean);
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
    const fn = stripperFor(rel);
    if (!fn) {
      copyFileSync(src, dst);
      copied++;
      continue;
    }
    const orig = readFileSync(src, "utf8");
    if (orig.includes("\u0000")) {
      copyFileSync(src, dst);
      copied++;
      continue;
    } // binary guard
    writeFileSync(dst, tidy(fn(orig)));
    stripped++;
  } catch (err) {
    errored++;
    console.error("ERR", rel, err.message);
  }
}

// sanity: every tracked CODE file must exist in the mirror (the footgun the rsync version had)
const missing = tracked
  .filter((r) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(r) && !DROP_PREFIX.some((p) => r.startsWith(p)))
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
  console.error("MISSING CODE FILES (should be 0):", missing.slice(0, 20));
  process.exit(1);
}
console.log(`\nnext:  biome format --write "${TARGET}"   ·   tokei "${TARGET}"`);
