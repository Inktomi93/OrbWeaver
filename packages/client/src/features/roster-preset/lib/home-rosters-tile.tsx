// The roster feature's Home "Rosters" tile, registered once in `compose/home-tiles.ts`.

import { Button } from "@orb/ui/button";
import { Users } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { TrailingArrow } from "#components";
import { useTRPC } from "#data";
import type { HomeTileContribution } from "#state";
import { openModal } from "#state";
import { HomeRostersTileBody } from "../components/home-rosters-tile-body.tsx";

// Between the character faces and temp chat: all three start a chat, and a roster is the group one.
const ROSTERS_TILE_ORDER = 25;

// A first boot has no measured box and renders the seeded rosters (D263).
const ROSTERS_SKELETON_ROWS = 3;

export const rosterPresetHomeTile: HomeTileContribution = {
  id: "rosterPreset.rosters",
  title: "Rosters",
  icon: Users,
  order: ROSTERS_TILE_ORDER,
  region: "shelf",
  skeletonRows: ROSTERS_SKELETON_ROWS,
  // An empty library has nothing to start, so the tile is absent. While the read is in flight the gate
  // answers true, because a seeded account's steady state is a populated list.
  useVisible: (): boolean => {
    const trpc = useTRPC();
    const { data: rosters } = useQuery(trpc.rosterPreset.list.queryOptions());
    return rosters === undefined || rosters.length > 0;
  },
  action: (
    // The arrow is decorative; the name is "All rosters".
    <Button intent="ghost" onClick={(): void => openModal("savedRosters")} size="sm">
      All rosters
      <TrailingArrow />
    </Button>
  ),
  body: () => <HomeRostersTileBody />,
};
