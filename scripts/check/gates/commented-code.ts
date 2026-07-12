// Gate: commented-code — a `//` comment whose content is a parked code STATEMENT (starts with a code
// keyword and ends in `;`/`{`/`}`). Delete it — git history keeps it; comments are for prose, not
// parked code. Conservative on purpose (prose comments, doc refs, and `// e.g. …` notes never match).
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const CODE_COMMENT_RE =
  /^\s*\/\/\s*(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|throw|await)\b.*[;{}]\s*$/u;

const COMMENTED_CODE_MESSAGE =
  "commented-out code — delete it (git history keeps it). Comments are for prose, not parked code (Documentation-Law.md §Code comments).";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const commentedCode: Check = {
  name: "commented-code",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      for (const [index, line] of sf.getFullText().split("\n").entries()) {
        if (CODE_COMMENT_RE.test(line)) {
          violations.push({
            file: relPath(root, sf.getFilePath()),
            line: index + 1,
            message: COMMENTED_CODE_MESSAGE,
          });
        }
      }
    }
    return violations;
  },
};

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a per-FILE line-scan gate via visitFile) ─────────────────────
// The legacy raw-line scan as a per-file hook (byte-identical — no §2.4 comment-range upgrade here; that
// intended finding CHANGE lands separately, behind its own parity diff). A `//` line whose content is a
// parked code statement is flagged at its line. Not fsBacked (pure AST text). Kept ALONGSIDE the legacy.
export const gate: GateDescriptor = {
  name: "commented-code",
  docRow: "Documentation-Law.md §Code comments",
  status: "active",
  scopeSafety: "incremental-safe",
  message: COMMENTED_CODE_MESSAGE,
  fix: "delete the parked code — git history keeps it; comments are for prose (WHY), not commented-out statements.",
  // Pinned to packages+tests: the §2.2 diagnostic-legibility fold-in added scripts/check/gates/** to the
  // workspace globs; a gate file's own `// export const …` activation-snippet comments are documentation,
  // not parked code — this pin keeps the scanner's findings byte-identical to before the fold-in.
  scanRoot: (p) => !p.startsWith("scripts/check/gates/"),
  visitFile: (sf, ctx) => {
    for (const [index, line] of sf.getFullText().split("\n").entries()) {
      if (CODE_COMMENT_RE.test(line)) {
        ctx.report({
          file: relPath(ctx.root, sf.getFilePath()),
          line: index + 1,
          column: 0,
          token: "commented code",
        });
      }
    }
  },
  mustFlag: [
    {
      files: "// const dead = compute();\nexport const x = 1;\n",
      at: "packages/ui/src/x/x.ts",
      why: "a `//`-parked code statement (`const … ;`) — delete it, git history keeps it",
    },
  ],
  mustPass: [
    {
      files: "// this explains WHY the value is 1 (a prose comment)\nexport const x = 1;\n",
      at: "packages/ui/src/x/y.ts",
      why: "a prose comment (no code keyword + terminator) — the conservative scan leaves it alone",
    },
  ],
};
