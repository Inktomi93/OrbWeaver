// Chat's "Start a chat" HOME tile contribution (home-section-spec §3.3, owner decision H6 — chat-owned,
// because the tile's data and intent are "start a chat" and homing the faces in `features/character`
// would fork a body that already exists).

import { Button } from "@orb/ui/button";
import { Users } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { setActiveSection } from "#state";
import { HomeQuickPicksTileBody } from "../components/home-quick-picks-tile-body.tsx";

const QUICK_PICKS_TILE_ORDER = 20;

export const chatQuickPicksTile: HomeTileContribution = {
  id: "chat.quickPicks",
  title: "Start a chat",
  icon: Users,
  order: QUICK_PICKS_TILE_ORDER,
  action: (
    <Button intent="ghost" onClick={(): void => setActiveSection("characters")} size="sm">
      All characters →
    </Button>
  ),
  body: () => <HomeQuickPicksTileBody />,
};
