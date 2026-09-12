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
      expect: { count: 1, line: 1, token: "commented code" },
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
    {
      mode: "source",
      files: {
        "packages/ui/src/x/anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/x-example.ts": "// const dead = compute();\nexport const gateish = 1;\n",
      },
      why: "THE SELF-SCAN FENCE (`pd-citation-integrity`'s class). A gate module's own proof fixtures and its header's quoted shapes are parked code INSIDE this policy's scan root by construction — this policy's own `mustFlag[0]` string is one. Dropping `notUnder: [\"tooling/src/verify/gates/**\"]` reds this row, so nothing silently widens the corpus into reporting itself. The `packages/ui` sibling is the in-population ANCHOR: a fixture holding only the subtracted path admits nothing and comes back a `[population]` TOOL ERROR rather than a finding (cb-v-unaudited-finals L9)",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/prose.ts": "// if the value is missing we fall back to the seed\nexport const x = 1;\n" },
      why: "THE TERMINATOR FENCE, and it is the fence that prevents a MASS false positive: prose routinely OPENS with a statement keyword (`if`, `return`, `type`, `for`). What separates a sentence from a statement is that a statement ENDS in `;`/`{`/`}`. Dropping `[;{}]` from the pattern reds this row",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/block.ts": "/* const dead = compute(); */\nexport const x = 1;\n" },
      why: "THE COMMENT-KIND FENCE. Parked code in a BLOCK comment is out of subject — the policy is deliberately scoped to the `//` spelling, which is what its own message and `fix` name. The kind test and the `^//` regex anchor are MUTUALLY REDUNDANT here (each alone rejects this text), so §4.1's joint procedure applies: cutting the `SingleLineCommentTrivia` test AND widening the anchor to `/^\\/[/*]/` TOGETHER reds this row and only this row. Neither cut alone did, and neither did the joint one before this fixture existed — the clean cut was a missing FIXTURE, not a redundant pair (cb-v-unaudited-finals L10)",
    },
  ],
});
