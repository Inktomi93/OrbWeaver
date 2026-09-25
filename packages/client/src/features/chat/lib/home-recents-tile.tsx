// Chat's "Pick up where you left off" HOME tile contribution. One file + one
// array member at the main.tsx door is the ENTIRE cost of putting chat's recents on home; home is never
// edited and never imports chat.
//
// CD3 RE-RULED, 2026-08-16 (owner pick on program #102, mockup variant C). This header used to read:
// "The trailing action is a ghost — the ONE accent primary on home belongs to temp chat (CD3)." That is
// no longer the ruling and the sentence is kept here, struck, rather than deleted, because it was a
// RECORDED decision and a reader deserves to know it was overturned rather than forgotten. Home's one
// focal is now the RESUME-ROOM HERO in this tile's body — an elevated island plus the rationed
// `--shadow-glow` on a ::before, no accent fill at all — and temp chat demotes to a secondary button.
// (The stripe that sentence used to name was deleted on the 2026-08-17 rail sweep: a chromatic accent
// border on one edge of a rounded card is a two-rule impeccable violation. See the body's header.)
// The reason the owner gave for the swap is the reason the old ruling looks wrong in hindsight: the
// finding under review was "the live conversations are not the loudest thing on home", and a page whose
// only accent was a throwaway-room button was precisely that complaint.
//
// THE TRAILING ACTION MOVED to the "Other rooms" tile (side-eye 2026-08-16 F13; the tile was titled "Also
// open" then and was retitled by owner ruling 2026-08-17). "All chats →" sat on this
// band, one line away from the "Chats" pill in the jump rail — two labels for one destination on one row —
// and the mock puts it on the also-open kicker, which is the band the link is actually about. This block
// now carries NO trailing affordance at all, which is the stronger reading of the sentence above: the hero
// is the accent, and it is the only thing on its own band.

import { MessagesSquare } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { HomeTileContribution } from "#state";
import { HomeRecentsTileBody, RECENTS_LIMIT } from "../components/home-recents-tile-body.tsx";
import { isFirstRun } from "./home-hearth.ts";

const RECENTS_TILE_ORDER = 10;

/** The FIRST-BOOT box, in skeleton rows (#92). The body is the HERO ALONE now that the also-open list is
 *  its own tile, and the hero is about three rows tall — a headline, two clamped prose lines, and a credit
 *  line (the 64px face strip that used to sit beside them went on the 2026-08-17 rail sweep, which makes
 *  this reservation slightly generous rather than short). It was `RECENTS_LIMIT + 2` when this body rendered the hero AND seven
 *  rows; leaving it there would reserve ten rows for a three-row block and snap the whole hearth column up
 *  when the read landed, which is the same defect in the other direction. Re-measure if the hero grows a
 *  line; do not re-derive it by counting DOM nodes (a skeleton ROW is a bar plus its gap, not a text line). */
const RECENTS_SKELETON_ROWS = 3;

const RESUME_TITLE = "Pick up where you left off";
const FIRST_RUN_TITLE = "Your first room";

// A friend who has only just joined has nothing to pick up; the band names the room as their first one instead.
// The same query key as the body, so this reads the body's one cache entry.
function useRecentsTitle(): string {
  const trpc = useTRPC();
  const page = useQuery(trpc.chat.listChats.queryOptions({ limit: RECENTS_LIMIT })).data;
  return page !== undefined && isFirstRun(page) ? FIRST_RUN_TITLE : RESUME_TITLE;
}

export const chatRecentsTile: HomeTileContribution = {
  id: "chat.recents",
  // The mockup's approved band copy. "Recent chats" named a data set; this names what you do with it,
  // which is what the block leads the page with.
  title: RESUME_TITLE,
  useTitle: useRecentsTitle,
  icon: MessagesSquare,
  order: RECENTS_TILE_ORDER,
  region: "hearth",
  skeletonRows: RECENTS_SKELETON_ROWS,
  body: () => <HomeRecentsTileBody />,
};
