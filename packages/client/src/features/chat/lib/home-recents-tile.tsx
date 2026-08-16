// Chat's "Recent chats" HOME tile contribution (home-section-spec §3.3). One file + one array member at
// the main.tsx door is the ENTIRE cost of putting chat's recents on home; home is never edited and never
// imports chat. The trailing action is a ghost — the ONE accent primary on home belongs to temp chat (CD3).

import { Button } from "@orb/ui/button";
import { MessagesSquare } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { setActiveSection } from "#state";
import { HomeRecentsTileBody, RECENTS_LIMIT } from "../components/home-recents-tile-body.tsx";

const RECENTS_TILE_ORDER = 10;

export const chatRecentsTile: HomeTileContribution = {
  id: "chat.recents",
  title: "Recent chats",
  icon: MessagesSquare,
  order: RECENTS_TILE_ORDER,
  span: "full",
  // The FIRST-BOOT reservation (#92): this tile's body is `RECENTS_LIMIT` rows, so its skeleton is too.
  // It was the app's worst layout shift — a 3-row skeleton settling into eight rows moved every tile
  // below it 308px. From boot two on, the MEASURED box wins (home-tile-box-store).
  skeletonRows: RECENTS_LIMIT,
  action: (
    <Button intent="ghost" onClick={(): void => setActiveSection("chats")} size="sm">
      All chats →
    </Button>
  ),
  body: () => <HomeRecentsTileBody />,
};
