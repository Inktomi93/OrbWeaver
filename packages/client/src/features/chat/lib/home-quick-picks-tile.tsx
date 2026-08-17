// Chat's "Start a chat" HOME tile contribution (home-section-spec §3.3, owner decision H6 — chat-owned,
// because the tile's data and intent are "start a chat" and homing the faces in `features/character`
// would fork a body that already exists).

import { Button } from "@orb/ui/button";
import { Users } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { setActiveSection } from "#state";
import { HomeQuickPicksTileBody } from "../components/home-quick-picks-tile-body.tsx";

const QUICK_PICKS_TILE_ORDER = 20;

/** The first-boot skeleton-row count that reserves the body's SETTLED height — see the `skeletonRows`
 *  note below for the pitch arithmetic (measured 320px settled → 6 rows). */
const QUICK_PICKS_SKELETON_ROWS = 6;

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
  skeletonRows: QUICK_PICKS_SKELETON_ROWS,
  action: (
    <Button intent="ghost" onClick={(): void => setActiveSection("characters")} size="sm">
      All characters →
    </Button>
  ),
  body: () => <HomeQuickPicksTileBody />,
};
