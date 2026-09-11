// Gate: commented-code — parked `//` code statements are deleted; comments explain why.
// TypeScript's shared trivia reader distinguishes real comments from string and template data.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { forEachCommentRange } from "../lib/comment-spans.ts";

const CODE_COMMENT_RE = /^\/\/\s*(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|throw|await)\b.*[;{}]\s*$/u;
const MESSAGE = "commented-out code — delete it (git history keeps it). Comments are for prose, not parked code (Documentation-Law.md §Code comments).";

export const gate = defineGate({
  id: "commented-code",
  family: "commented-code",
  authority: "hard",
  severity: "error",
  population: { of: "all", why: "parked code is forbidden in every compiler source except gate contract prose", notUnder: ["tooling/src/verify/gates/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "delete the parked code — git history keeps it; comments are for prose (WHY), not commented-out statements.",
  create: (ctx) => ({
    visitFile: (sourceFile) => {
      const path = ctx.relativePath(sourceFile);
      const seen = new Set<number>();
      forEachCommentRange(sourceFile, (range) => {
        if (range.kind !== SyntaxKind.SingleLineCommentTrivia || seen.has(range.pos)) {
          return;
        }
        seen.add(range.pos);
        const comment = sourceFile.getFullText().slice(range.pos, range.end);
        if (CODE_COMMENT_RE.test(comment)) {
          const position = sourceFile.getLineAndColumnAtPos(range.pos);
          ctx.report.file(path, { line: position.line, column: position.column, token: "commented code" });
        }
      });
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/x/x.ts": "// const dead = compute();\nexport const x = 1;\n" },
      expect: { line: 1, token: "commented code" },
      why: "a parked const statement is code retained as a comment",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/x/y.ts": "// this explains WHY the value is 1 (a prose comment)\nexport const x = 1;\n" },
      why: "a prose comment has neither the parked-code keyword and terminator shape",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/template.ts": "export const source = `\n// const rendered = true;\n`;\n" },
      why: "comment-looking text inside a template string is data, not parked code",
    },
  ],
});
