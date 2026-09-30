// Chat's "Start a chat" HOME tile contribution (chat-owned,
// because the tile's data and intent are "start a chat" and homing the faces in `features/character`
// would fork a body that already exists).

import { Users } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { HomeQuickPicksTileBody } from "../components/home-quick-picks-tile-body.tsx";
import { QUICK_PICKS_TILE_ID, useStarterRegion } from "./home-starter-region.ts";

const QUICK_PICKS_TILE_ORDER = 20;

/** The fill count inside the reserved block: one row of faces through the skeleton pitch. */
const QUICK_PICKS_SKELETON_ROWS = 4;

/** The settled body block at every desktop width (#177). Home is one column below the shelf's reflow step and two
 *  even columns past it, and "Start with" lays six faces in one row in both, so the box is a constant. Re-measure
 *  with the `#177` first-boot CT's printed table if the cell anatomy or `QUICK_PICKS_LIMIT` changes. */
const QUICK_PICKS_SKELETON_BLOCK_PX = 184;

export const chatQuickPicksTile: HomeTileContribution = {
  id: QUICK_PICKS_TILE_ID,
  // The mockup's approved band copy for the face shelf: "Start a chat" named the verb, "Start with" names
  // the choice you are actually making under a row of faces.
  title: "Start with",
  icon: Users,
  order: QUICK_PICKS_TILE_ORDER,
  region: "shelf",
  useRegion: useStarterRegion,
  skeletonBlock: QUICK_PICKS_SKELETON_BLOCK_PX,
  skeletonRows: QUICK_PICKS_SKELETON_ROWS,
  body: () => <HomeQuickPicksTileBody />,
};
