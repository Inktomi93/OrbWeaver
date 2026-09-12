// The snap flag index is a GENERATED law file that agents read cold and GREP. Its two fidelity risks are
// opposite, and only one of them has a check already:
//   · drift from the registry — held by `ledgers:fresh` (123 derived rows, re-derived every `pnpm check`);
//   · SEARCH fidelity — held by nothing, until this file.
//
// THE EXCLUSION THIS PIN WAS WRITTEN BESIDE IS GONE, AND THE PIN IS STRICTLY BETTER FOR IT (#2178).
// `flags.md` used to sit OUTSIDE the docs formatter's population because the formatter wanted four of its
// 123 rows escaped, and those escapes DESTROY grep targets: measured 2026-09-12, `__orb` goes 2 hits -> 0
// and `path[,path]` goes 2 -> 0. The tempting way to retire that fence was to let the generator emit the
// escaped bytes so both doors agreed — closing the deadlock by making a law file unsearchable. It was
// refused, and the fix went to the SOURCE: the four registry summaries carry CODE SPANS
// (`snap/ops/flags-metadata.ts`), inside which `_` and `[` are literal, so the output is canonical AND
// greppable and the file is now admitted to `check:docs` with no exclusion at all.
//
// So this stopped guarding an EXCLUSION and now guards the PROPERTY directly — which is what it was
// really for. `git grep -l '__orb'` on `main` is 255 tracked files across every layer, and this document
// is where a lane LEARNS that vocabulary. Anyone who later "simplifies" those summaries by dropping the
// backticks reds HERE, at the generator, naming the token, instead of shipping an index nobody can search.
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
