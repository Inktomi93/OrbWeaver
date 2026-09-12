// Gate: component-size (Core-Laws-and-Precedents.md / UI-Architecture-and-Layout.md §2.1). Client
// sources have a hard line cap. The verdict is per-file, so scoped runs remain complete and no
// filesystem walk or ResourceHost tree is required.
//
// FAMILY: `component-size`, shared with `component-size-ui`. The shared reader is
// `lib/source-line-count.ts#authoredLineCount` (module + function), so both halves count a file one way
// and cannot drift apart; the two differ only in root and exclusion list.
// POPULATION PORT: BYTE-IDENTICAL. The legacy gate was `fsBacked` and WALKED `packages/client/src`,
// skipping the `node_modules`/`dist`/`__screenshots__` directories and `/\.(?:test|spec|gen)\.tsx?$/`
// plus `.d.ts`; the declaration above is that walk expressed as population algebra.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 1,318 admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (70a944751^) — the conversion's parent.
import { defineGate } from "../contract/policy.ts";
import { authoredLineCount } from "../lib/source-line-count.ts";

const ROUTES_PREFIX = "packages/client/src/routes/";
const CAP_DEFAULT = 450;
const CAP_ROUTE = 500;
/** Comfortably past BOTH caps, so a `notNamed` fixture's excluded siblings are silent only because they are
 *  outside the subject — never because they happened to fit under one of the two caps. */
const OVER_CAP_LINES = CAP_ROUTE + CAP_ROUTE;
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
  },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
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
    {
      mode: "source",
      files: { [`${ROUTES_PREFIX}big.tsx`]: "export const x = 1;\n".repeat(CAP_ROUTE + 1) },
      expect: { count: 1, line: CAP_ROUTE + 1, messageIncludes: "cap 500" },
      why: "THE ROUTE CAP, in the flagging direction: a route file one line over 500. `line` and `messageIncludes` both name the ROUTE cap LITERALLY, so this row dies on ANY change to `CAP_ROUTE` in EITHER direction — measured at 450 (the finding moves to `line 451` / `cap 450`) and at 900 (`line 901` / `cap 900`). The `mustPass` twin below carries the other half and dies on LOWERING ONLY: its 451-line fixture goes MORE silent as the cap rises, so the two rows TOGETHER pin the branch, not this one alone. Until 2026-09-12 no row placed a file under `packages/client/src/routes/` at all, so `CAP_ROUTE = 500 → 450` AND `→ 1` were both CLEAN and the 500-line cap this message advertises was enforced by nothing (cb-v-unaudited-finals L7)",
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
    {
      mode: "source",
      files: { [`${ROUTES_PREFIX}over-default.tsx`]: "export const x = 1;\n".repeat(CAP_DEFAULT + 1) },
      why: "THE ROUTE CAP, in the silent direction. The size is deliberately keyed to `CAP_DEFAULT + 1`, NOT to `CAP_ROUTE`: a fixture sized from the constant under test moves WITH the cut and can never discriminate (measured here — a `repeat(CAP_ROUTE)` draft survived `CAP_ROUTE → 450` because the fixture shrank to 450 too). This file is one line over the DEFAULT cap and silent only because the route branch handed it the higher one, so any `CAP_ROUTE` below 451 reds it",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/x/in-scope.tsx": "export const x = 1;\n",
        "packages/client/src/x/x.test.tsx": "export const x = 1;\n".repeat(OVER_CAP_LINES),
        "packages/client/src/x/x.spec.ts": "export const x = 1;\n".repeat(OVER_CAP_LINES),
        "packages/client/src/x/x.gen.ts": "export const x = 1;\n".repeat(OVER_CAP_LINES),
        "packages/client/src/x/x.d.ts": "export const x = 1;\n".repeat(OVER_CAP_LINES),
      },
      why: "THE SUBJECT FENCE: test, spec, generated and ambient declaration files are outside the subject regardless of size, and the in-scope sibling is the population ANCHOR that keeps the fixture from admitting nothing. Replacing `notNamed` with a name that matches none of them reds this row with four findings. The family sibling `component-size-ui` has pinned the identical list since its conversion; this half — on the LARGER population — did not, which is one family running two standards (cb-v-unaudited-finals L8)",
    },
  ],
});
