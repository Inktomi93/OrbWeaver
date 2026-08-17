// Chat's "Start a chat" HOME tile contribution (home-section-spec §3.3, owner decision H6 — chat-owned,
// because the tile's data and intent are "start a chat" and homing the faces in `features/character`
// would fork a body that already exists).

import { Button } from "@orb/ui/button";
import { Users } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { setActiveSection } from "#state";
import { HomeQuickPicksTileBody } from "../components/home-quick-picks-tile-body.tsx";

const QUICK_PICKS_TILE_ORDER = 20;

/** Three rows of fixed cells (two per shelf-width row at `QUICK_PICKS_LIMIT` = 6), plus one for the
 *  caption pair — see the `skeletonRows` note below. */
const QUICK_PICKS_SKELETON_ROWS = 4;

export const chatQuickPicksTile: HomeTileContribution = {
  id: "chat.quickPicks",
  // The mockup's approved band copy for the face shelf: "Start a chat" named the verb, "Start with" names
  // the choice you are actually making under a row of faces.
  title: "Start with",
  icon: Users,
  order: QUICK_PICKS_TILE_ORDER,
  region: "shelf",
  // The FIRST-BOOT reservation (#92). The body is a fixed-cell GRID now, not `QUICK_PICKS_LIMIT` rows: at
  // the shelf's width it tiles two per row, so six faces are three rows of cells, and each cell is a 64px
  // portrait over two caption lines. Four skeleton rows is that box; declaring six would over-reserve and
  // pull the blocks under it UP when the read lands, which is the same defect pointed the other way.
  skeletonRows: QUICK_PICKS_SKELETON_ROWS,
  action: (
    <Button intent="ghost" onClick={(): void => setActiveSection("characters")} size="sm">
      All characters →
    </Button>
  ),
  body: () => <HomeQuickPicksTileBody />,
};
