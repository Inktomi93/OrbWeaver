// The roster feature's Home "Rosters" tile, registered once in `compose/home-tiles.ts`.

import { Button } from "@orb/ui/button";
import { Users } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { TrailingArrow } from "#components";
import { useTRPC } from "#data";
import type { HomeTileContribution } from "#state";
import { forgetSurfaceBox, openModal, useSurfaceBox } from "#state";
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
  // An empty library has nothing to start, so the tile is absent. While the read is in flight the gate answers from
  // this device's box memory, as "Other rooms" does: a hidden tile is never measured, so a guess that reserves a box
  // collapses on every boot of an empty library. A settled empty list forgets its box.
  useVisible: (): boolean => {
    const trpc = useTRPC();
    const { data: rosters } = useQuery(trpc.rosterPreset.list.queryOptions());
    const remembered = useSurfaceBox(ROSTERS_TILE_ID) !== null;
    const visible = rosters === undefined ? remembered : rosters.length > 0;
    const settledHidden = rosters !== undefined && !visible;
    useEffect(() => {
      if (settledHidden) {
        forgetSurfaceBox(ROSTERS_TILE_ID);
      }
    }, [settledHidden]);
    return visible;
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
