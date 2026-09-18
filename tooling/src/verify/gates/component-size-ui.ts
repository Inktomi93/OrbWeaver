// Gate: component-size-ui — the @orb/ui member of the component-size family. Primitive sources have a
// hard 450-line cap. Test, CT, fixture, generated, and ambient declaration files are outside the subject.
//
// FAMILY: `component-size`, shared with `component-size`. The shared reader is
// `lib/source-line-count.ts#authoredLineCount` (module + function) — the same function both halves count
// with, which is what makes this a family rather than two policies that happen to be about file length.
// POPULATION PORT: BYTE-IDENTICAL. The legacy gate WALKED `packages/ui/src` with the same skipped
// directories and the WIDER name exclusion `/\.(?:test|spec|ct|fixtures|gen)\.tsx?$/` plus `.d.ts` —
// which is why this half's `notNamed` carries `*.ct.*`/`*.fixtures.*` and the client half does not.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 364 admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (70a944751^) — the conversion's parent.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `component-size-ui` descriptor at d59803f7f00233b70d97820311f9f706c911336e, the parent of the conversion
// `70a944751` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The legacy
// descriptor had no `scanRoot`, so its effective population is its in-run path filter — fs walk of `packages/ui/src`,
// SKIP_DIRS {node_modules,dist,__screenshots__}, `.ts`/`.tsx` minus `/\.(?:test|spec|ct|fixtures|gen)\.tsx?$/` and
// `.d.ts`. Over the SAME 7,047 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`; the walk-based filter over every tracked `.ts`/`.tsx` path) it admits 358
// and the final `population` admits 358 (the bare harness dispatch was 7,047). legacy − final = ∅. final − legacy =
// ∅. Controls: inside `packages/ui/src/art/art-bleed/__cbbhr_in_art-bleed.tsx` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` rejected by both.
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
        ctx.report.file(ctx.relativePath(sourceFile), {
          line: CAP + 1,
          column: 1,
          message: `${lines} lines (cap ${CAP}) — split the primitive (UI-Primitives-and-Reuse.md §13.7).`,
        });
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
