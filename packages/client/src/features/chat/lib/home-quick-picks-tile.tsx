// Chat's "Start a chat" HOME tile contribution (chat-owned,
// because the tile's data and intent are "start a chat" and homing the faces in `features/character`
// would fork a body that already exists).

import { Button } from "@orb/ui/button";
import { Users } from "@orb/ui/icons";
import { TrailingArrow } from "#components";
import type { HomeTileContribution } from "#state";
import { setActiveSection } from "#state";
import { HomeQuickPicksTileBody } from "../components/home-quick-picks-tile-body.tsx";

const QUICK_PICKS_TILE_ORDER = 20;

/** The first-boot skeleton-row count that reserves the body's SETTLED height — see the `skeletonRows`
 *  note below for the pitch arithmetic (measured 320px settled → 6 rows). */
const QUICK_PICKS_SKELETON_ROWS = 6;

/** …and "a residual under half a row" is still a shift (#177). Six rows reserve ~304px against the 320.5px
 *  this shelf settles at, so the tile GREW 16.5px on every first boot and pushed temp-chat, databank and
 *  the doorway group down — measured on the live home at 1280×900 with the tRPC responses held so the
 *  loading state is observable, and it was the largest single entry in the boot's `__orb.motion()` list.
 *  The settled box is a constant at the shelf's primary 3-column mount (fixed 136px cells, not N data
 *  rows), so it declares the measurement through `skeletonBlock` instead of the nearest whole row; the row
 *  count above stays as the fill-count fallback. Re-measure with the same probe if the cell size, the cell
 *  anatomy or `QUICK_PICKS_LIMIT` changes.
 *  RE-MEASURED 2026-08-17 (rail sweep P2-9/P3-18): the cell's anatomy changed — its name went up a ramp
 *  step (the `promoted` voice) and both its lines clamp to two WRAPPED lines instead of truncating — so the
 *  settled box grew. 331 is the re-measurement, taken the way this note demands: the `#177` first-boot CT
 *  (`home-surface.ct.tsx`) reported the residual as `chat.quickPicks moved 10.19px` against the old 321.
 *  RE-MEASURED 2026-08-18 (side-eye home re-score #216-d): the cell's name now RESERVES its two lines
 *  (`Text lines={2}` — a clamp caps, it does not reserve, so one- and two-line names started their captions
 *  21px apart in the same row), which adds one line of the `promoted` leading to EVERY row of the shelf.
 *  374 is the re-measurement, taken the way this note demands: the same `#177` CT reported the residual as
 *  `chat.quickPicks moved 43.38px` against the old 331 (two rows × one line).
 *  RE-MEASURED 2026-09-02 (#1144). 376. This one is NOT a drift and NOT a regression, and saying which is
 *  the whole point of the protocol: the cell's SETTLED content changed under a ruled token change. The
 *  integer-line-box pass (`ed55bf193`, 2026-09-01 — one day after the reading above, which is why it was
 *  never re-taken) landed BOTH of the leadings this cell reserves two lines of, and it reserves them in
 *  `lh`, so each one moves the box twice per row: `--leading-title` went from the ratio `1.35` to
 *  `round(1.375rem, 1px)` (the name, `voice="promoted"` `lines={2}`), and the `prose` modifier went from
 *  `leading-body` (`1.55`) to the newly minted `leading-label-relaxed`, `round(1.25rem, 1px)` (the pitch,
 *  `lines={2}`). Whole-pixel line boxes are the POINT of that pass (docs/design/integer-line-boxes.md), so
 *  the settled box is the correct one and the declaration is what was stale. Taken the way this note
 *  demands, from the `#177` CT's own printed table: `chat.quickPicks  reserved 414.00  settled 416.00`
 *  (the tile box; the band above the body is a constant 40px, so the BODY reading is 374 → 376). */
const QUICK_PICKS_SKELETON_BLOCK_PX = 376;

export const chatQuickPicksTile: HomeTileContribution = {
  id: "chat.quickPicks",
  // The mockup's approved band copy for the face shelf: "Start a chat" named the verb, "Start with" names
  // the choice you are actually making under a row of faces.
  title: "Start with",
  icon: Users,
  order: QUICK_PICKS_TILE_ORDER,
  region: "shelf",
  // The FIRST-BOOT reservation (#92; re-derived stickler 2026-08-16 F2). The body is a fixed-cell GRID,
  // not `QUICK_PICKS_LIMIT` rows. Its SETTLED anatomy: `cols="cellFixed"` tiles the shelf's primary width
  // at THREE 136px tracks (861de3e58's `min-w-0` fix took it from 2 → 3), so six faces are two rows of
  // 156px cells (a 136px `Avatar size="fill"` over the name + caption lines) with one `gap-row` between —
  // 2×156 + 8 = ~320px, measured 320.5px live. The old declaration reserved FOUR rows (~208px) against
  // premises that died inside this same merge ("two per row", "64px portraits"), under-reserving ~112px
  // and pushing temp-chat/databank down on first boot. Six skeleton rows is that box through the shared
  // pitch seam (`skeletonRowCountFor(320.5) = round((320.5 − 2·12 + 8)/(40+8)) = 6`, reserving ~304px, a
  // residual under half a row). The declaration is a single number and the cell grid is column-count
  // dependent (a narrower 2-column shelf makes six cells ~484px), so it targets the primary 3-column mount
  // the shelf ships at; the MEASURED box wins on every boot after the first.
  skeletonBlock: QUICK_PICKS_SKELETON_BLOCK_PX,
  skeletonRows: QUICK_PICKS_SKELETON_ROWS,
  action: (
    // The arrow is DECORATIVE (rail sweep P3-14) — the name is "All characters".
    <Button intent="ghost" onClick={(): void => setActiveSection("characters")} size="sm">
      All characters
      <TrailingArrow />
    </Button>
  ),
  body: () => <HomeQuickPicksTileBody />,
};
