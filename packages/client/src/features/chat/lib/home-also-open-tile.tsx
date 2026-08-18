// Chat's "Other rooms" HOME tile contribution — the second of chat's two hearth blocks (program #102's
// mockup, side-eye 2026-08-16 F6/F13). One file + one array member at the door, exactly like every other
// tile; the WHY of the split lives in `home-also-open-tile-body.tsx`.
//
// IT SHIPPED AS "Also open" AND WAS RETITLED (owner ruling 2026-08-17, #150). A room has no open/closed
// state in this product — nothing opens one and nothing closes one — so the old title named a property the
// model does not have, and the honest reading of the block is "the rest of your rooms". The FILE, the
// contribution id (`chat.alsoOpen`) and the `data-home-tile` hook keep the old spelling on purpose: they are
// wire vocabulary that every CT and story selector is written against, and renaming an id to match a label
// is how a rename becomes a migration.
//
// It carries the "All chats →" link that used to sit on the pick-up band, which is where the mock draws it
// and where it stops sharing a line with the "Chats" jump pill.

import { Button } from "@orb/ui/button";
import { MessagesSquare } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { TrailingArrow } from "#components";
import { useTRPC } from "#data";
import type { HomeTileContribution } from "#state";
import { setActiveSection } from "#state";
import { HomeAlsoOpenTileBody } from "../components/home-also-open-tile-body.tsx";
import { RECENTS_LIMIT } from "../components/home-recents-tile-body.tsx";

/** Between the hero (10) and the jump rail (40) — the mock's order down the hearth column. */
const ALSO_OPEN_TILE_ORDER = 15;

/** The FIRST-BOOT box (#92): the hero takes `items[0]`, so this list is at most one row short of the page
 *  the shared query asks for. Derived from that limit, never a second number that can drift from it. */
const ALSO_OPEN_SKELETON_ROWS = RECENTS_LIMIT - 1;

export const chatAlsoOpenTile: HomeTileContribution = {
  id: "chat.alsoOpen",
  title: "Other rooms",
  icon: MessagesSquare,
  order: ALSO_OPEN_TILE_ORDER,
  region: "hearth",
  skeletonRows: ALSO_OPEN_SKELETON_ROWS,
  // A BAND OVER AN EMPTY LIST IS THE CHROME THIS PASS DELETES: with one room open there is nothing else to
  // be also-open, and the block disappears whole rather than rendering a named region with no rows in it.
  // The gate reads the SAME query key the two bodies suspend on (`useQuery`, non-suspense — no second
  // fetch, no boundary of its own, and `useVisible` is called unconditionally over the door-frozen list,
  // so the hook call is legal here). While that read is in flight it answers TRUE: the steady state of an
  // account with recents is a populated list, and reserving the block and then removing it on the rare
  // one-room account is a smaller shift than withholding it and growing the column on every boot.
  useVisible: (): boolean => {
    const trpc = useTRPC();
    const { data: page } = useQuery(trpc.chat.listChats.queryOptions({ limit: RECENTS_LIMIT }));
    return page === undefined || page.items.length > 1;
  },
  action: (
    // The arrow is DECORATIVE (rail sweep P3-14): the button's accessible name is "All chats", not
    // "All chats →" — a glyph is not part of an affordance's name.
    <Button intent="ghost" onClick={(): void => setActiveSection("chats")} size="sm">
      All chats
      <TrailingArrow />
    </Button>
  ),
  body: () => <HomeAlsoOpenTileBody />,
};
