// CT: the rack row's LEADING GLYPH COLUMN (#483 / side-eye 2026-08-22 P3-6).
//
// THE DEFECT: F-17 made the glyph per-MARKER so the column would carry information, and for markers it does.
// A literal has no marker, so it fell back to one Pencil meaning "the author wrote this" — a fact every
// literal shares. Measured live on an ST-import preset (the common shape, mostly literal sections): the first
// FOURTEEN rack rows were fourteen identical Pencil discs in one hue, i.e. a decorative column wearing the
// badge grammar this surface uses for information.
//
// THE PIN is geometric and per-row, not a census of one row: the disc must be ABSENT on every literal row and
// PRESENT on every marker row of the same rack — a count alone would pass if the branch inverted.
//
// It mounts `RackStory`, which is the real Prompt view over a real autosave boundary and whose fixture mixes
// three literals (Alpha · DeleteMe · Zeta) with three markers (Post-history · World info (before) · the
// pivot). The assertion is on `[data-slot=list-row-leading]`, the slot ListRow renders only when its `leading`
// prop is supplied — so "absent" here means the slot was not passed, never that it is merely invisible.

import { expect, test } from "@playwright/experimental-ct-react";
import { RackStory } from "./_rack-stories.tsx";

const LIST_ROW_ROOT = '[data-slot="list-row-root"]';
const LEADING = '[data-slot="list-row-leading"]';

/** The story fixture's own rack rows, by the name each prints. The fixture's `chat_history` section is NOT
 *  here: the PIVOT renders as its own `PivotBand`, never a `SectionRow` (`assembly-rack.tsx` branches on
 *  `isPivotSection` before it reaches this row), so it has no leading slot to have an opinion about. */
const LITERAL_ROWS = ["Alpha", "DeleteMe", "Zeta"];
const MARKER_ROWS = ["Post-history", "World info (before)"];

test("P3-6 the rack's glyph disc appears on MARKER rows only — a literal row carries no leading slot", async ({ mount }) => {
  const rack = await mount(<RackStory />);
  await expect(rack.locator(LIST_ROW_ROOT, { hasText: "Alpha" }).first()).toBeVisible();

  // The VECTOR, per row, in one evaluation — `<row title> → does it render a disc?`. A count alone would
  // pass with the branch inverted; this states which rows are which.
  const discs = await rack.locator(LIST_ROW_ROOT).evaluateAll(
    (rows, leadingSelector) =>
      rows.map((row) => ({
        name: row.querySelector('[data-slot="list-row-title"]')?.textContent ?? "?",
        disc: row.querySelector(leadingSelector) !== null,
      })),
    LEADING,
  );
  expect(
    discs.filter((row) => LITERAL_ROWS.includes(row.name)).map((row) => row.disc),
    "no literal row carries a glyph disc",
  ).toEqual([false, false, false]);
  expect(
    discs.filter((row) => MARKER_ROWS.includes(row.name)).map((row) => row.disc),
    "every marker row keeps the glyph that discriminates it",
  ).toEqual([true, true]);

  // …and the column as a whole is now a MINORITY of the rack, which is the finding's own shape: it appears
  // where it discriminates. Five rack rows, two discs.
  await expect(rack.locator(LEADING)).toHaveCount(MARKER_ROWS.length);
});
