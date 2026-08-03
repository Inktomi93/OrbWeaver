// Gate: no-nul-bytes-in-source (Core-Enforcement-Active-Gates.md) — a RAW NUL (0x00) byte inside a tracked
// text source. Every other instrument is blind to it (tsc, biome, eslint, the CT suites and check:structure
// were ALL green on the file that carried one), while GIT classifies the file BINARY: `git show --stat` then
// prints `Bin 13848 -> 40068 bytes` instead of a diff, so a 26KB change to a gate reviews as nothing at all.
// DECLARED LIMITS: four roots (packages/·tests/·scripts/·docs/), a text-extension fence, first-NUL-per-line.
import type { Dirent } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

// The roots a source NUL can hide in. The repo-root config files are deliberately OUT (a NUL in
// `vitest.config.ts` is a mustPass-documented blind spot, not a shape this gate has ever seen).
const SCAN_ROOTS: readonly string[] = ["packages", "tests", "scripts", "docs"];
// Directories that hold generated / vendored bytes — a NUL there is not authored source.
const SKIP_DIRS: ReadonlySet<string> = new Set<string>([".git", "node_modules", "dist", "coverage", ".cache", ".turbo", "generated"]);
// The text-source extension fence. Anything outside it (png/woff/db/…) is legitimately binary.
const TEXT_EXT_RE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|md|css|scss|sql|html|yml|yaml|txt|sh)$/u;

const NUL = 0;
const NEWLINE = 0x0a;

const MESSAGE =
  "a RAW NUL (0x00) byte is embedded in a text source file. Nothing else in the battery sees it — tsc, " +
  "biome, eslint, the CT suites and `pnpm check:structure` all stay GREEN — but git classifies the file as " +
  "BINARY, so every future `git show --stat` / diff on it prints `Bin <n> -> <m> bytes` instead of the " +
  "change, and the review of that change is a blank. The tell is exactly that `Bin` line on a " +
  "packages/**/*.ts path. See scripts/check/GATE-AUTHORING.md.";

const FIX =
  "if the NUL is MEANINGFUL (the composite-key separator idiom — a template joining two key parts across " +
  'one, or `h.update("\\u0000")`), ' +
  "keep the semantics and spell it as the ESCAPE `\\u0000`; the file becomes plain text and the joined value " +
  "is byte-identical. If it is accidental (a stray byte pasted into a template literal), delete it: " +
  "`sed -i 's/\\x00//g' <file>`. NEVER delete a separator NUL — that collides `a|bc` with `ab|c`. Re-verify " +
  "with `git show --stat` on the next commit: the path must print a line count, not `Bin`.";

/** Every text-source file under a scan root, in a deterministic order. */
function textFiles(root: string, relDir: string, out: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(join(root, relDir), { withFileTypes: true, encoding: "utf8" });
  } catch {
    return; // a root absent from this tree (a conformance temp dir plants only some) — nothing to scan
  }
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      textFiles(root, rel, out);
    } else if (TEXT_EXT_RE.test(entry.name)) {
      out.push(rel);
    }
  }
}

/** The 1-based line number of every NUL byte in a buffer, one entry per OCCURRENCE. */
function nulLines(bytes: Buffer): number[] {
  const out: number[] = [];
  let line = 1;
  for (const byte of bytes) {
    if (byte === NEWLINE) {
      line += 1;
    } else if (byte === NUL) {
      out.push(line);
    }
  }
  return out;
}

function scan(ctx: GateRunCtx): void {
  for (const rootDir of SCAN_ROOTS) {
    const files: string[] = [];
    textFiles(ctx.root, rootDir, files);
    for (const rel of files) {
      for (const line of nulLines(readFileSync(join(ctx.root, rel)))) {
        ctx.report({ file: rel, line, column: 0 });
      }
    }
  }
}

export const gate: GateDescriptor = {
  name: "no-nul-bytes-in-source",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // it walks the real filesystem, not the changed set
  fsBacked: true,
  message: MESSAGE,
  fix: FIX,
  run: scan,
  mustFlag: [
    {
      // The founding shape: a NUL inside a template literal — invisible in every editor and every linter,
      // and the exact byte that made a source file diff as `Bin` for its whole life.
      files: { "packages/server/src/domain/x/verbs/y.ts": "export const key = `a\u0000b`;\n" },
      expect: { count: 1 },
      why: "the founding shape — a raw NUL inside a template literal (the separator idiom written as a BYTE); tsc/biome/eslint are all green on it while git prints `Bin` for every diff",
    },
    {
      // Not just template literals: a plain string arg, and a NUL inside a COMMENT (which no escape can
      // rescue — the fix there is rewording). Two occurrences in one file ⇒ two findings.
      files: { "packages/kit/src/x.ts": '// the separator is \u0000 here\nexport const s = "\u0000";\n' },
      expect: { count: 2 },
      why: "one NUL in a comment and one in a plain string literal — per-OCCURRENCE reporting, and the comment case proves the gate is not template-literal-shaped",
    },
    {
      files: { "docs/architecture/core/__probe.md": "---\nkind: law\n---\n\nprose with a \u0000 in it.\n" },
      expect: { count: 1 },
      why: "a NUL in a doc — markdown is a tracked text source too, and a binary-classified law doc reviews as `Bin` exactly like code",
    },
    {
      files: { "scripts/check/gates/__probe.ts": 'const GAP = "\u0000";\nexport const gate = { name: "__probe", mustFlag: [1], mustPass: [1], gap: GAP };\n' },
      expect: { count: 1 },
      why: "the gate corpus scans ITSELF — the live instance of this defect was `dangling-refs.ts`'s own `GAP` const, which made that gate's 26KB rewrite diff as `Bin 13848 -> 40068`",
    },
  ],
  mustPass: [
    {
      files: { "packages/server/src/domain/x/verbs/y.ts": 'export const key = `a\\u0000b`;\nexport const s = "\\u0000";\n' },
      why: "the SANCTIONED spelling: the separator written as the two-character ESCAPE `\\u0000`. Same runtime bytes in the joined value, zero NULs in the source — this is what the fix produces",
    },
    {
      files: { "packages/ui/src/x.ts": 'export const emoji = "— ✓ … ‘’";\nexport const cr = "a\\r\\nb\\tc";\n' },
      why: "multi-byte UTF-8, an em dash, and real control ESCAPES (\\r\\n\\t) are all fine — the gate matches the single byte 0x00 and nothing else, so it never fires on ordinary non-ASCII text",
    },
    {
      // DECLARED LIMIT: the extension fence. A genuinely binary asset under a scanned root is skipped.
      files: { "tests/support/fixtures/tiny.png": "\u0000PNG\u0000\u0000binary\u0000" },
      why: "DECLARED LIMIT — a real binary asset (`.png`) under a scanned root is outside the text-extension fence and must not fire; only text-source extensions are judged",
    },
  ],
};
