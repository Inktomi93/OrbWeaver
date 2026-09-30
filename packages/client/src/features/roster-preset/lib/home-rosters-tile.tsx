// The roster feature's Home "Rosters" tile, registered once in `compose/home-tiles.ts`.

import { Button } from "@orb/ui/button";
import { Users } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { TrailingArrow } from "#components";
import { useTRPC } from "#data";
import type { HomeTileContribution } from "#state";
import { openModal, rememberHomeTileSettledHidden, useHomeTileSettledHidden } from "#state";
import { HomeRostersTileBody } from "../components/home-rosters-tile-body.tsx";

// Between the character faces and temp chat: all three start a chat, and a roster is the group one.
const ROSTERS_TILE_ORDER = 25;

// The fill count inside a remembered box; a device with no memory draws no box at all (see `useVisible`).
const ROSTERS_SKELETON_ROWS = 3;

/** The registry id, which is also this tile's key in the device's box memory. */
const ROSTERS_TILE_ID = "rosterPreset.rosters";

export const rosterPresetHomeTile: HomeTileContribution = {
  id: ROSTERS_TILE_ID,
  title: "Rosters",
  icon: Users,
  order: ROSTERS_TILE_ORDER,
  region: "shelf",
  skeletonRows: ROSTERS_SKELETON_ROWS,
  // An empty library has nothing to start, so the tile is absent. While the read is in flight the gate reserves the
  // tile, because every new account is seeded with rosters, unless this device saw it settle hidden: an empty library
  // then reserves nothing instead of collapsing on every boot.
  useVisible: (): boolean => {
    const trpc = useTRPC();
    const { data: rosters } = useQuery(trpc.rosterPreset.list.queryOptions());
    const settledHiddenBefore = useHomeTileSettledHidden(ROSTERS_TILE_ID);
    const settled = rosters === undefined ? undefined : rosters.length > 0;
    useEffect(() => {
      if (settled !== undefined) {
        rememberHomeTileSettledHidden(ROSTERS_TILE_ID, !settled);
      }
    }, [settled]);
    return settled ?? !settledHiddenBefore;
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
