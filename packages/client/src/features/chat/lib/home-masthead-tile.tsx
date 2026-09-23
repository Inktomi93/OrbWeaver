// Chat's MASTHEAD contribution — home's opening sentence (program #102, mockup variant C). One more
// co-located file plus one array member at the door, exactly like every other tile: home renders a
// `masthead`-region contribution and never learns that the count in it came from chat.
//
// WHY IT IS A TILE AND NOT SOMETHING HOME OWNS: the sentence is about YOUR ROOMS, and `client-features-
// no-cross` makes an `import … from "#features/chat"` in home RED. The only alternatives were a static
// "Home" (the chrome this pass deletes) or home reaching for `trpc.chat` itself, which would move chat's
// data AND intent into the host — the exact thing the tile ownership rule homes here instead.
//
// It carries NO `action` and NO `icon` in the frame: the masthead region is deliberately chrome-less (see
// `HomeTileRegion`), so `icon` here is only what the ⌘K/registry surfaces would show if they ever list a
// tile by glyph — it paints nothing on home.

import { Compass } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { HomeMastheadBody } from "../components/home-masthead-body.tsx";

const MASTHEAD_TILE_ORDER = 0;

/** ONE row, MEASURED, not counted (#92 · #102). The body is two LINES — the count sentence and the
 *  left-off line — and the obvious declaration was therefore `2`. It was wrong, and this tile sits ABOVE
 *  everything on the page, so being wrong here moves every block below it: at `2` the first-boot drive
 *  scored CLS **0.1278** (over the 0.1 budget) with a 0.0527 entry reading `main moved 0px,-55px` plus
 *  four kicker separators — the masthead OVER-reserving by about one skeleton row and the page snapping
 *  up when the read landed. At `1` the same drive scores **0.0748**. A skeleton ROW is not a text LINE:
 *  the row pitch is a bar plus its gap, and two display/body lines fit inside one of them.
 *  Re-measure this number if the masthead's copy grows a third line; do not re-derive it by counting. */
const MASTHEAD_SKELETON_ROWS = 1;

/** …AND ONE ROW IS STILL 6.75px TOO TALL (#177). The row count above is the closest a ~48px pitch can get
 *  to a two-line heading block, and that residual moved the ENTIRE page: measured on the live home at
 *  1280×900 with the tRPC responses held so the loading state is observable, the masthead reserved 64px
 *  and settled at 57.25, and the boot's `__orb.motion()` recorded the whole Home-content main moving
 *  0px,-7px — every tile in both columns, from the surface's first block. Two lines of display + body
 *  type is a CONSTANT (it is the same block whether you have 0 chats or 500), so the honest reservation is
 *  the measurement itself, through `skeletonBlock`. Re-measure with the same probe if the masthead's copy
 *  grows a third line; the row count stays as the fill-count fallback. */
const MASTHEAD_SKELETON_BLOCK_PX = 57;

export const chatMastheadTile: HomeTileContribution = {
  id: "chat.masthead",
  title: "Home",
  icon: Compass,
  order: MASTHEAD_TILE_ORDER,
  region: "masthead",
  skeletonBlock: MASTHEAD_SKELETON_BLOCK_PX,
  skeletonRows: MASTHEAD_SKELETON_ROWS,
  body: () => <HomeMastheadBody />,
};
