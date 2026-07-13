// Gate: commented-code — a `//` comment whose content is a parked code STATEMENT (starts with a code
// keyword and ends in `;`/`{`/`}`). Delete it — git history keeps it; comments are for prose, not
// parked code. Conservative on purpose (prose comments, doc refs, and `// e.g. …` notes never match).
import type { GateDescriptor } from "../contract.ts";

const CODE_COMMENT_RE =
  /^\s*\/\/\s*(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|throw|await)\b.*[;{}]\s*$/u;

const COMMENTED_CODE_MESSAGE =
  "commented-out code — delete it (git history keeps it). Comments are for prose, not parked code (Documentation-Law.md §Code comments).";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const gate: GateDescriptor = {
  name: "commented-code",
  docRow: "Documentation-Law.md §Code comments",
  status: "active",
  scopeSafety: "incremental-safe",
  message: COMMENTED_CODE_MESSAGE,
  fix: "delete the parked code — git history keeps it; comments are for prose (WHY), not commented-out statements.",
  // A gate file's own `// export const …` activation-snippet comments are documentation, not parked code.
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
