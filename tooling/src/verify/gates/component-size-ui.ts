// Gate: component-size-ui — the @orb/ui member of the component-size family. Primitive sources have a
// hard 450-line cap. Test, CT, fixture, generated, and ambient declaration files are outside the subject.
import { defineGate } from "../contract/policy.ts";
import { authoredLineCount } from "../lib/source-line-count.ts";

const CAP = 450;
const OVER_CAP_LINES = CAP + CAP;
const MESSAGE =
  "an @orb/ui source file exceeds the hard 450-line cap — split the primitive into part files or extract pure logic to lib/ (UI-Primitives-and-Reuse.md §13.7).";

export const gate = defineGate({
  id: "component-size-ui",
  family: "component-size",
  authority: "hard",
  severity: "error",
  population: {
    in: ["@ui"],
    notUnder: ["**/node_modules/**", "**/dist/**", "**/__screenshots__/**"],
    notNamed: [
      "*.test.ts",
      "*.test.tsx",
      "*.spec.ts",
      "*.spec.tsx",
      "*.ct.ts",
      "*.ct.tsx",
      "*.fixtures.ts",
      "*.fixtures.tsx",
      "*.gen.ts",
      "*.gen.tsx",
      "*.d.ts",
    ],
  },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "split the primitive into part files, or extract pure logic to lib/; one primitive remains one sealed component.",
  create: (ctx) => ({
    visitFile: (sourceFile) => {
      const lines = authoredLineCount(sourceFile);
      if (lines > CAP) {
        ctx.report.file(ctx.relativePath(sourceFile), { line: CAP + 1, column: 1, message: `${lines} lines (cap ${CAP}) — split the primitive.` });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/big/big.tsx": "export const x = 1;\n".repeat(CAP + 1) },
      expect: { count: 1, line: CAP + 1, messageIncludes: "cap 450" },
      why: "a UI source one line over the cap",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/small/small.tsx": "export const x = 1;\n" },
      why: "a small UI source is below the cap",
    },
    {
      mode: "source",
      files: { "packages/ui/src/edge/edge.tsx": "export const x = 1;\n".repeat(CAP) },
      why: "a UI source exactly at the cap passes",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/x/in-scope.tsx": "export const x = 1;\n",
        "packages/ui/src/x/x.ct.tsx": "export const x = 1;\n".repeat(OVER_CAP_LINES),
        "packages/ui/src/x/x.fixtures.tsx": "export const x = 1;\n".repeat(OVER_CAP_LINES),
        "packages/ui/src/x/x.d.ts": "export const x = 1;\n".repeat(OVER_CAP_LINES),
      },
      why: "CT, fixture, and ambient declaration files are excluded regardless of size",
    },
  ],
});
