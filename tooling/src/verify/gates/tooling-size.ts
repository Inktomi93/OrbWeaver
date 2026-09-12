// Gate: tooling-size — tooling source stays below the decomposition caps in Core-Tooling-Law §4.3.
// Gate modules are the declared carve: a single-purpose contract can be longer than ordinary tooling.
import { defineGate } from "../contract/policy.ts";
import { authoredLineCount } from "../lib/source-line-count.ts";

const CAP_DEFAULT = 450;
const CAP_CLI = 200;
const MESSAGE =
  "a @orb/tooling source file exceeds the hard line cap (default 450; cli.ts 200) — split into ops/ files or extract pure helpers to lib/; a monolith tool is the drawer this package exists to end (docs/architecture/core/Core-Tooling-Law.md §4.3).";

export const gate = defineGate({
  id: "tooling-size",
  family: "tooling-size",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling"], notUnder: ["tooling/src/verify/gates/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "decompose: one ops/ file per command family, pure logic to lib/, shapes to contract/; a cli.ts holds argv parse + dispatch only.",
  create: (ctx) => ({
    visitFile: (sourceFile) => {
      const path = ctx.relativePath(sourceFile);
      const cap = path.endsWith("/cli.ts") ? CAP_CLI : CAP_DEFAULT;
      const lines = authoredLineCount(sourceFile);
      if (lines > cap) {
        ctx.report.file(path, {
          line: cap + 1,
          column: 1,
          message: `${lines} lines (cap ${cap}) — decompose before it grows (docs/architecture/core/Core-Tooling-Law.md §4.3)`,
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "tooling/src/snap/ops/big.ts": "export const x = 1;\n".repeat(CAP_DEFAULT + 1) },
      expect: { count: 1, line: CAP_DEFAULT + 1, messageIncludes: "cap 450" },
      why: "one line over the default cap — the decomposition trigger",
    },
    {
      mode: "source",
      files: { "tooling/src/snap/cli.ts": "export const x = 1;\n".repeat(CAP_CLI + 1) },
      expect: { count: 1, line: CAP_CLI + 1, messageIncludes: "cap 200" },
      why: "a cli.ts over its tighter cap — argv parse + dispatch only",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "tooling/src/snap/ops/fits.ts": "export const x = 1;\n".repeat(CAP_DEFAULT) },
      why: "exactly at the cap — passes",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/long-gate.ts": "export const x = 1;\n".repeat(CAP_DEFAULT + 1),
        "tooling/src/verify/lib/admitted-control.ts": "export const admitted = true;\n",
      },
      why: "the declared verify/gates carve excludes the long gate while an admitted legal file keeps the proof population nonempty",
    },
  ],
});
