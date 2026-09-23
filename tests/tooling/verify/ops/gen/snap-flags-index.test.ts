// The snap flag index is a GENERATED law file that agents read cold and GREP. Its two fidelity risks are
// opposite, and only one of them has a check already:
//   · drift from the registry — held by `ledgers:fresh` (the committed bytes vs a fresh derivation, every
//     `pnpm check`), which is why nothing below spells a row COUNT as a literal;
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
import { snapFlagDescriptors } from "../../../../../tooling/src/snap/index.ts";
import { deriveSnapFlagsIndexMarkdown, SNAP_FLAGS_INDEX_STATIC_ROWS } from "../../../../../tooling/src/verify/ops/gen/snap-flags-index.ts";
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

test("the index derives one row per registry flag plus the named static tail, and the tables are well formed", () => {
  const markdown = deriveSnapFlagsIndexMarkdown();
  const bodyRows = markdown.split("\n").filter((candidate) => candidate.startsWith("| `"));

  // Every generated table row is exactly two cells, so no summary can smuggle a bare `|` that would split
  // a row and silently DROP its tail (GFM discards the overflow; the `doc` tool's formatter width guard
  // is what catches that class for hand-authored docs, and this file is outside its population).
  const cells = bodyRows.map((line) => line.split(/(?<!\\)\|/u).slice(1, -1));
  for (const row of cells) {
    expect(row).toHaveLength(2);
  }

  // THE CENSUS IS A RELATIONSHIP, NOT A NUMBER (#2492). This assertion used to read `toBe(123)`; #2445
  // landed `--tap`, regenerated the 124-row file, and left the pin red for every lane afterwards on a
  // tree where nothing was wrong — and the only repair a literal offers is the bump that re-arms it one
  // flag later. Both halves are derived from the SAME registry the generator reads, so a flag added to
  // `snapFlagDescriptors()` moves the expectation with the file. (Whether the COMMITTED file was
  // regenerated is a different question, owned byte-for-byte by `ledgers:fresh`'s `snapFlagsIndexDrift`.)
  const descriptors = snapFlagDescriptors();
  expect(bodyRows).toHaveLength(descriptors.length + SNAP_FLAGS_INDEX_STATIC_ROWS.length);

  // A matching TOTAL is not a matching SET: a dropped flag and an extra tail row add up the same. Pin the
  // membership per flag — exactly one row opens with each descriptor's own token — so a group missing
  // from `SNAP_FLAG_GROUP_ORDER` (which would sort its table out of the document) cannot pass on arithmetic.
  const firstCells = cells.map((row) => (row[0] as string).trim());
  const ownedByFlag = new Set<string>();
  for (const descriptor of descriptors) {
    const owned = firstCells.filter((cell) => cell === `\`${descriptor.flag}\`` || cell.startsWith(`\`${descriptor.flag} `));
    expect(owned, `${descriptor.flag} must own exactly one row of the generated index`).toHaveLength(1);
    ownedByFlag.add(owned[0] as string);
  }

  // Whatever is left is the hand-written tail, and it is NAMED — so a fourth static row can never arrive
  // disguised as a count that still adds up.
  expect(firstCells.filter((cell) => !ownedByFlag.has(cell))).toEqual(SNAP_FLAGS_INDEX_STATIC_ROWS.map((row) => row.cell));
});
