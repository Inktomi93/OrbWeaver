// Gate: tooling-size (docs/architecture/core/Core-Tooling-Law.md §4.3) — the tooling twin of component-size: any
// tooling/src file >450 lines is RED; a cli.ts >200 is RED (argv parse + dispatch ONLY — the cap is what
// decomposes the monoliths BEFORE they land: snap 4,513 / ast 6,241 / codemod-kit 3,385 cannot move
// un-split). DECLARED CARVE: `verify/gates/**` is cap-exempt after P6 — a gate file is a single-purpose
// contract-headed module (largest live: 883 lines) and splitting one is worse than a long one. Counts comment lines (comments-INTENDED, like component-size).
import type { GateDescriptor } from "../contract/gate.ts";

const CAP_DEFAULT = 450;
const CAP_CLI = 200;
const TOOLING_PREFIX = "tooling/src/";
const GATES_CARVE = "tooling/src/verify/gates/";
const TRAILING_NL = /\n$/u;
/** The one home for browser.ts's deferred ceiling — the map row and both control arms derive from it. */
const BROWSER_DEFERRED_CEILING = 482;

/** DEFERRED CEILINGS — owner ruling 2026-09-03. NOT a carve and NOT a suppression: a dated, SHRINK-ONLY
 *  ceiling with a stated end condition, the `CLOCK_SITES` idiom this repo already uses. The file may not
 *  GROW past the number recorded here (a line over it is RED exactly as the cap is), the number may only
 *  ever be lowered, and the row DIES when its issue lands. A row whose issue is closed but which still sits
 *  here is the strand class we keep paying for — delete it the moment the decomposition is real. */
const DEFERRED_CEILINGS: ReadonlyMap<string, { readonly ceiling: number; readonly why: string; readonly ends: string }> = new Map([
  [
    "tooling/src/_shared/browser.ts",
    {
      ceiling: BROWSER_DEFERRED_CEILING,
      why: "#1285's attachRecordedContext took it 439 -> 482, and the two obvious extractions are both blocked by real constraints, not by effort: arms B and H of tooling-shared-plumbing name THIS FILE as the only legal `chromium.launch` and `connectOverCDP` site, so the two most movable functions cannot move; lifting the lifecycle block needs a value re-export that trips lint/performance/noBarrelFile (measured); lifting attachRecordedContext needs the Probe* shapes back from browser.ts and depcruise reds the cycle (measured, exit 2).",
      ends: "#1288 — ends when the Probe* shapes get their own type home and attachRecordedContext moves out; both dead ends are recorded on that row so the next attempt does not re-walk them.",
    },
  ],
]);

function relOf(abs: string): string | null {
  const i = abs.replace(/\\/gu, "/").indexOf(`/${TOOLING_PREFIX}`);
  return i === -1 ? null : abs.slice(i + 1);
}

export const gate: GateDescriptor = {
  name: "tooling-size",
  docRow: "Core-Enforcement-Active-Gates.md (docs/architecture/core/Core-Tooling-Law.md §4.3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a @orb/tooling source file exceeds the hard line cap (default 450; cli.ts 200) — split into ops/ files or extract pure helpers to lib/; a monolith tool is the drawer this package exists to end (docs/architecture/core/Core-Tooling-Law.md §4.3).",
  fix: "decompose: one ops/ file per command family, pure logic to lib/, shapes to contract/; a cli.ts holds argv parse + dispatch only.",
  scanRoot: (p) => p.startsWith(TOOLING_PREFIX),
  visitFile: (sf, ctx) => {
    const rel = relOf(sf.getFilePath());
    if (rel === null || rel.startsWith(GATES_CARVE)) {
      return;
    }
    // Trim a single trailing newline so a file ending in "\n" isn't counted one line over (the
    // component-size counting rule).
    const lines = sf.getFullText().replace(TRAILING_NL, "").split("\n").length;
    const deferred = DEFERRED_CEILINGS.get(rel);
    const cap = deferred?.ceiling ?? (rel.endsWith("/cli.ts") ? CAP_CLI : CAP_DEFAULT);
    if (lines > cap) {
      const tail =
        deferred === undefined
          ? "decompose before it grows"
          : `over its DEFERRED, SHRINK-ONLY ceiling — this file may not grow while its decomposition is deferred (${deferred.ends})`;
      // The pointer stays a LITERAL at the end of this template: diagnostic-legibility reads the message
      // statically and cannot see through an interpolated tail.
      ctx.report({ file: rel, line: 0, column: 0, message: `${lines} lines (cap ${cap}) — ${tail} (docs/architecture/core/Core-Tooling-Law.md §4.3)` });
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project") {
      return;
    }
    for (const [rel, row] of DEFERRED_CEILINGS) {
      const sf = ctx.project.getSourceFiles().find((f) => f.getFilePath().replace(/\\/gu, "/").endsWith(`/${rel}`));
      if (sf === undefined) {
        continue; // not on this tree — cannot judge the row, and a bare zero is never a verdict
      }
      const lines = sf.getFullText().replace(TRAILING_NL, "").split("\n").length;
      const realCap = rel.endsWith("/cli.ts") ? CAP_CLI : CAP_DEFAULT;
      if (lines <= realCap) {
        ctx.report({
          file: "tooling/src/verify/gates/tooling-size.ts",
          line: 1,
          column: 0,
          message: `STALE DEFERRAL: ${rel} is ${lines} lines, back under the real cap of ${realCap} — its deferred ceiling row has outlived the problem. Delete the row (${row.ends}); a one-sided exemption rots into a lie, because the next file written past the cap at that path inherits an exemption nobody granted it. The row lives in tooling/src/verify/gates/tooling-size.ts.`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: "export const x = 1;\n".repeat(CAP_DEFAULT + 1),
      at: "tooling/src/snap/ops/big.ts",
      expect: { messageIncludes: "cap 450" },
      why: "one line over the default cap — the decomposition trigger",
    },
    {
      files: "export const x = 1;\n".repeat(CAP_CLI + 1),
      at: "tooling/src/snap/cli.ts",
      expect: { messageIncludes: "cap 200" },
      why: "a cli.ts over its tighter cap — argv parse + dispatch only",
    },
    {
      files: "export const x = 1;\n".repeat(BROWSER_DEFERRED_CEILING + 1),
      at: "tooling/src/_shared/browser.ts",
      expect: { messageIncludes: "SHRINK-ONLY" },
      why: "the deferral is SHRINK-ONLY — one line over the recorded 482 ceiling is RED, so a deferred file cannot keep growing",
    },
  ],
  mustPass: [
    {
      files: "export const x = 1;\n".repeat(CAP_DEFAULT),
      at: "tooling/src/snap/ops/fits.ts",
      why: "exactly at the cap — passes",
    },
    {
      files: "export const x = 1;\n".repeat(CAP_DEFAULT + 1),
      at: "tooling/src/verify/gates/long-gate.ts",
      why: "the DECLARED verify/gates carve — a gate file over the default cap is deliberate (§4.3)",
    },
    {
      files: "export const x = 1;\n".repeat(BROWSER_DEFERRED_CEILING),
      at: "tooling/src/_shared/browser.ts",
      why: "exactly at its deferred ceiling — passes, which is the whole point of recording a number instead of exempting the path",
    },
  ],
};
