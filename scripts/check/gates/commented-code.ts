// Gate: commented-code — a `//` comment whose content is a parked code STATEMENT (starts with a code
// keyword and ends in `;`/`{`/`}`). Delete it — git history keeps it; comments are for prose, not
// parked code. Conservative on purpose (prose comments, doc refs, and `// e.g. …` notes never match).
import type { Check, Violation } from "../harness.ts";

const CODE_COMMENT_RE =
  /^\s*\/\/\s*(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|throw|await)\b.*[;{}]\s*$/u;

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
            message:
              "commented-out code — delete it (git history keeps it). Comments are for prose, not parked code (Documentation-Law.md §Code comments).",
          });
        }
      }
    }
    return violations;
  },
};
