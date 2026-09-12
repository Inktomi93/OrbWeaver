// The snap flag index is a GENERATED law file that agents read cold and GREP. Its two fidelity risks are
// opposite, and only one of them has a check already:
//   · drift from the registry — held by `ledgers:fresh` (123 derived rows, re-derived every `pnpm check`);
//   · SEARCH fidelity — held by nothing, until this file.
//
// The second is live, not hypothetical. `flags.md` is deliberately OUTSIDE the docs formatter's population
// (`doc-catalog/ops/format.ts`, the `GENERATED` fence) because the formatter wants four of its 123 rows
// escaped, and those escapes DESTROY grep targets: measured 2026-09-12, `__orb` goes 2 hits -> 0 and
// `path[,path]` goes 2 -> 0. The tempting way to retire that fence is to let the generator emit the
// escaped bytes so both doors agree — which closes the deadlock by making a law file unsearchable.
//
// THIS IS A PIN AGAINST A FUTURE WRONG FIX, not against a current defect — an unusual shape, stated
// plainly because a reader's instinct on meeting an exclusion is to remove it, and one of the two ways to
// remove this one is catastrophic. It asserts the GREP TARGETS, so escaping them reds HERE, at the
// generator, naming the token — rather than surfacing later as "why can nobody find `__orb`".
// `git grep -l '__orb'` is 255 tracked files across every layer; this document is where a lane LEARNS
// that vocabulary. The sanctioned removal is the opposite direction and is recorded in the fence comment:
// put those tokens in CODE SPANS in `snap/ops/flags-metadata.ts`, after which the output is canonical AND
// greppable and the fence can be deleted for the right reason.
import { deriveSnapFlagsIndexMarkdown } from "../../../../../tooling/src/verify/ops/gen/snap-flags-index.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

/** Literal occurrences — the thing a cold agent's `rg` actually counts. */
function hits(text: string, literal: string): number {
  return text.split(literal).length - 1;
}

test("the generated flag index keeps the literals a cold agent greps for", () => {
  const markdown = deriveSnapFlagsIndexMarkdown();

  // `__orb` is the dev-bridge global every rendered-probe lane searches for; an escaped `\_\_orb` renders
  // identically and is invisible to every one of those searches.
  expect(hits(markdown, "__orb")).toBeGreaterThan(0);
  expect(markdown).not.toContain("\\_\\_orb");

  // `selector=path[,path]` is the argv shape for the two file-input flags.
  expect(hits(markdown, "path[,path]")).toBeGreaterThan(0);
  expect(markdown).not.toContain("path\\[,path]");
});

test("the index derives one row per registry flag, and the tables are well formed", () => {
  const markdown = deriveSnapFlagsIndexMarkdown();
  const rows = markdown.match(/^\| `/gmu) ?? [];

  // The ratchet holds this at 123; asserting it here means a CONTENT change cannot arrive disguised as a
  // formatting change — the row count is the thing that must not move when the file's form is edited.
  expect(rows.length).toBe(123);

  // Every generated table row is exactly two cells, so no summary can smuggle a bare `|` that would split
  // a row and silently DROP its tail (GFM discards the overflow; `doc-catalog`'s width guard is what
  // catches that class, and this file is outside its population).
  for (const line of markdown.split("\n").filter((candidate) => candidate.startsWith("| `"))) {
    const cells = line.split(/(?<!\\)\|/u).slice(1, -1);
    expect(cells).toHaveLength(2);
  }
});
