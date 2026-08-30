// THE ROADMAP'S PARITY PIN (#834) — home's "What's coming" tuple against the table it mirrors.
//
// `docs/architecture/proposed/INDEX.md` is the owner-ruled SOURCE for what the region lists (the
// committed-but-unrealized programs: dispositions FUTURE and PARTIAL, never REALIZED or SUPERSEDED), and a
// doc is not a module — the client cannot import a markdown table, so `features/home/lib/roadmap.ts` is a
// hand-curated mirror. A hand-curated mirror rots silently; this file is what makes it rot LOUDLY. It reads
// the table off disk and asserts SET EQUALITY, so promoting a program to REALIZED, retiring one, or adding
// a new FUTURE set REDS here with the row named, instead of leaving home promising a thing that shipped.
//
// THE PARSER'S OWN CONTROL comes first: a regex that stops matching returns an empty row list, and every
// assertion below would then pass vacuously (⊆ ∅ is trivially true) — the exact "silent zero" shape a
// negative claim is never allowed to rest on. So the first test pins a non-trivial row count AND the
// presence of all four dispositions before anything else is asked.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RoadmapProgram } from "../../../../../packages/client/src/features/home/lib/roadmap.ts";
import { HOME_ROADMAP, homeRoadmapTiles } from "../../../../../packages/client/src/features/home/lib/roadmap.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const INDEX_PATH = join(import.meta.dirname, "../../../../../docs/architecture/proposed/INDEX.md");

/** The dispositions the index's own legend defines. `LISTED` is what home may show. */
const LISTED = ["FUTURE", "PARTIAL"] as const;
const RETIRED = ["REALIZED", "SUPERSEDED"] as const;
/** The table has ~19 program rows; a parse that finds fewer than this many is broken, not shrunken. */
const MIN_PARSED_ROWS = 15;
/** Buddy is NOT an index row — it is the purged-pending-return domain, and it keeps its own tile file. */
const BUDDY_TILE_ID = "buddy";
/** Every roadmap doorway sorts after buddy's 80 (`roadmap.ts` ROADMAP_ORDER_BASE). */
const FIRST_ROADMAP_ORDER = 81;
/** A promise with a year or a quarter in it is a date, and the owner ruled this region promises none. */
const DATE_PROMISE_RE = /\b(?:20\d\d|Q[1-4])\b/u;

interface IndexRow {
  readonly set: string;
  readonly disposition: string;
  readonly sprint: number | null;
}

/** Parse the index's one table: `| \`set/\` | **DISPOSITION** | [#N](…/issues/N) |`. A row whose program
 *  cell carries no backticked set (the header, the rule row) or no bolded disposition is not a program. */
function readIndexRows(): readonly IndexRow[] {
  return readFileSync(INDEX_PATH, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .flatMap((line): readonly IndexRow[] => {
      const cells = line.split("|").map((cell) => cell.trim());
      const set = /`([^`]+)`/u.exec(cells[1] ?? "")?.[1];
      const disposition = /\*\*([A-Z]+)\*\*/u.exec(cells[2] ?? "")?.[1];
      if (set === undefined || disposition === undefined) {
        return [];
      }
      const sprint = /issues\/(\d+)/u.exec(cells[3] ?? "")?.[1];
      return [{ set, disposition, sprint: sprint === undefined ? null : Number(sprint) }];
    });
}

const rows = readIndexRows();
const rowOf = (set: string): IndexRow | undefined => rows.find((row) => row.set === set);
const byText = (a: string, b: string): number => a.localeCompare(b);
const setsWithDisposition = (dispositions: readonly string[]): string[] =>
  rows
    .filter((row) => dispositions.includes(row.disposition))
    .map((row) => row.set)
    .toSorted(byText);

test("CONTROL — the INDEX table actually parsed (a broken regex would pass every pin below vacuously)", () => {
  expect(rows.length).toBeGreaterThanOrEqual(MIN_PARSED_ROWS);
  // All four dispositions present: the parse reached the whole table, not just its first block.
  expect([...new Set(rows.map((row) => row.disposition))].toSorted(byText)).toEqual(["FUTURE", "PARTIAL", "REALIZED", "SUPERSEDED"]);
});

test("every roadmap entry mirrors a LISTED index row — same set, same sprint", () => {
  for (const program of HOME_ROADMAP) {
    const row = rowOf(program.set);
    expect(row, `roadmap entry "${program.id}" names \`${program.set}\`, which is not a row in INDEX.md`).toBeDefined();
    expect(row?.disposition, `\`${program.set}\` is ${row?.disposition} in INDEX.md — home lists only FUTURE/PARTIAL`).toBeOneOf([...LISTED]);
    expect(row?.sprint, `\`${program.set}\` links a different sprint in INDEX.md`).toBe(program.sprint);
  }
});

test("no roadmap entry names a REALIZED or SUPERSEDED program — home never promises what shipped or died", () => {
  const retired = setsWithDisposition(RETIRED);
  expect(retired.length).toBeGreaterThan(0);
  expect(HOME_ROADMAP.filter((program) => retired.includes(program.set)).map((program) => program.set)).toEqual([]);
});

test("the tuple IS the LISTED set — a program added to or promoted out of INDEX.md reds here", () => {
  expect(HOME_ROADMAP.map((program) => program.set).toSorted(byText)).toEqual(setsWithDisposition(LISTED));
});

test("the state line follows the disposition, and neither line promises a date", () => {
  const partlyBuilt = (program: RoadmapProgram): boolean => program.state.startsWith("Partly built — ");
  for (const program of HOME_ROADMAP) {
    const isPartial = rowOf(program.set)?.disposition === "PARTIAL";
    expect(partlyBuilt(program), `"${program.id}" is ${isPartial ? "PARTIAL" : "FUTURE"} — its state line disagrees`).toBe(isPartial);
    expect(DATE_PROMISE_RE.test(`${program.gloss} ${program.state}`), `"${program.id}" promises a date`).toBe(false);
  }
});

test("the doorway tiles derive 1:1 from the tuple — dormant arm, tuple copy, buddy-then-roadmap order", () => {
  expect(homeRoadmapTiles.map((tile) => tile.id)).toEqual(HOME_ROADMAP.map((program) => program.id));
  expect(homeRoadmapTiles.map((tile) => tile.id)).not.toContain(BUDDY_TILE_ID);
  expect(new Set(homeRoadmapTiles.map((tile) => tile.id)).size).toBe(homeRoadmapTiles.length);
  expect(homeRoadmapTiles.map((tile) => tile.order)).toEqual(HOME_ROADMAP.map((_program, index) => FIRST_ROADMAP_ORDER + index));
  for (const [index, tile] of homeRoadmapTiles.entries()) {
    const program = HOME_ROADMAP[index];
    // The `{dormant}` arm, not a body function: a doorway renders no control, and building the program
    // means replacing this field, which deletes the promise in the same edit.
    expect(typeof tile.body, `"${tile.id}" must be a dormant doorway, not a live body`).not.toBe("function");
    expect(tile.body).toEqual({ dormant: { reason: program?.state, teaser: program?.gloss } });
  }
});
