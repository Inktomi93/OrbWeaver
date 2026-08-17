// Chat's "Pick up where you left off" HOME tile contribution (home-section-spec §3.3). One file + one
// array member at the main.tsx door is the ENTIRE cost of putting chat's recents on home; home is never
// edited and never imports chat.
//
// CD3 RE-RULED, 2026-08-16 (owner pick on program #102, mockup variant C). This header used to read:
// "The trailing action is a ghost — the ONE accent primary on home belongs to temp chat (CD3)." That is
// no longer the ruling and the sentence is kept here, struck, rather than deleted, because it was a
// RECORDED decision and a reader deserves to know it was overturned rather than forgotten. Home's one
// focal is now the RESUME-ROOM HERO in this tile's body — a `--color-speaker` stripe plus the rationed
// `--shadow-glow` on a ::before, no accent fill at all — and temp chat demotes to a secondary button.
// The reason the owner gave for the swap is the reason the old ruling looks wrong in hindsight: the
// finding under review was "the live conversations are not the loudest thing on home", and a page whose
// only accent was a throwaway-room button was precisely that complaint.
//
// The trailing action stays a GHOST, which is unchanged and now for a stronger reason: the hero is the
// accent, so nothing else on this block may compete with it.

import { Button } from "@orb/ui/button";
import { MessagesSquare } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { setActiveSection } from "#state";
import { HomeRecentsTileBody, RECENTS_LIMIT } from "../components/home-recents-tile-body.tsx";

const RECENTS_TILE_ORDER = 10;

/** The FIRST-BOOT box, in skeleton rows (#92). NOT `RECENTS_LIMIT`: the body is one HERO plus
 *  `RECENTS_LIMIT - 1` dense rows, and the hero is about three rows tall (a 64px cast strip beside a
 *  headline, two clamped prose lines, and a meta line). Eight equal rows under-reserve a hero-plus-seven
 *  body by a hero's worth, which is the shift this declaration exists to stop — it was the app's worst
 *  one (a 3-row skeleton settling into eight rows moved every tile below it 308px). Derived from the
 *  body's own limit so the two cannot drift; from boot two on the MEASURED box wins. */
const RECENTS_SKELETON_ROWS = RECENTS_LIMIT + 2;

export const chatRecentsTile: HomeTileContribution = {
  id: "chat.recents",
  // The mockup's approved band copy. "Recent chats" named a data set; this names what you do with it,
  // which is what the block leads the page with.
  title: "Pick up where you left off",
  icon: MessagesSquare,
  order: RECENTS_TILE_ORDER,
  region: "hearth",
  skeletonRows: RECENTS_SKELETON_ROWS,
  action: (
    <Button intent="ghost" onClick={(): void => setActiveSection("chats")} size="sm">
      All chats →
    </Button>
  ),
  body: () => <HomeRecentsTileBody />,
};
