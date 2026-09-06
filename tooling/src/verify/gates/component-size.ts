// Gate: component-size (Core-Laws-and-Precedents.md / UI-Architecture-and-Layout.md §2.1). Client
// sources have a hard line cap. The verdict is per-file, so scoped runs remain complete and no
// filesystem walk or ResourceHost tree is required.
import { defineGate } from "../contract/policy.ts";
import { authoredLineCount } from "../lib/source-line-count.ts";

const ROUTES_PREFIX = "packages/client/src/routes/";
const CAP_DEFAULT = 450;
const CAP_ROUTE = 500;
const MESSAGE =
  "a client source file exceeds the hard line cap (default 450, routes 500) — split it into sub-files or extract pure logic; a god-component is a UI-Architecture-and-Layout.md §2.1 smell.";

export const gate = defineGate({
  id: "component-size",
  family: "component-size",
  authority: "hard",
  severity: "error",
  population: {
    in: ["@client"],
    notUnder: ["**/node_modules/**", "**/dist/**", "**/__screenshots__/**"],
    notNamed: ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx", "*.gen.ts", "*.gen.tsx", "*.d.ts"],
    ext: ["ts", "tsx"],
  },
  analysis: "syntax",
  execution: "selected-files",
  resources: [],
  message: MESSAGE,
  fix: "split the file into sub-files, or extract a self-contained vocabulary/config into state/ or lib/ and re-export it from the original front door.",
  create: (ctx) => ({
    visitFile: (sourceFile) => {
      const path = ctx.relativePath(sourceFile);
      const cap = path.startsWith(ROUTES_PREFIX) ? CAP_ROUTE : CAP_DEFAULT;
      const lines = authoredLineCount(sourceFile);
      if (lines > cap) {
        ctx.report.file(path, { line: cap + 1, column: 1, message: `${lines} lines (cap ${cap}) — split the file; the cap is a structural guard.` });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/big/big.tsx": "export const x = 1;\n".repeat(CAP_DEFAULT + 1) },
      expect: { count: 1, line: CAP_DEFAULT + 1, messageIncludes: "cap 450" },
      why: "a client file one line over the default cap",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/small/small.tsx": "export const x = 1;\n" },
      why: "a small client file is below the cap",
    },
    {
      mode: "source",
      files: { "packages/client/src/boundary/boundary.tsx": "export const x = 1;\n".repeat(CAP_DEFAULT) },
      why: "a client file exactly at the cap passes",
    },
  ],
});
