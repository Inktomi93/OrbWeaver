import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC } from "#data";
import type { HomeTileRegion } from "#state";
import { rememberHomeRegion, useRememberedHomeRegion } from "#state";
import { RECENTS_LIMIT } from "../components/home-recents-tile-body.tsx";

/** The quick-picks tile id, which is also its key in the device's region memory. */
export const QUICK_PICKS_TILE_ID = "chat.quickPicks";

function regionFor(roomCount: number): HomeTileRegion {
  return roomCount === 0 ? "hearth" : "shelf";
}

/**
 * Where "Start with" lands: the hearth while the house has no room, else the shelf.
 *
 * @remarks With no room to resume, the hearth holds only the first-room greeting and the section rail and ends hundreds
 * of pixels above the shelf. "Start with" is that house's first step and the one move that levels the columns: moving
 * the rosters and temp chat tiles as well tips the void to the shelf side (`home-column-balance.suite.ct.tsx`).
 * Until the room list settles, the tile stands where it last settled on this device, so it never moves after first
 * paint. A device with no memory for this account is most often that account's first boot, which has no room, so it
 * starts in the hearth.
 */
export function useStarterRegion(): HomeTileRegion {
  const trpc = useTRPC();
  const page = useQuery(trpc.chat.listChats.queryOptions({ limit: RECENTS_LIMIT })).data;
  const remembered = useRememberedHomeRegion(QUICK_PICKS_TILE_ID);
  const settled = page === undefined ? undefined : regionFor(page.totalCount);
  useEffect(() => {
    if (settled !== undefined) {
      rememberHomeRegion(QUICK_PICKS_TILE_ID, settled);
    }
  }, [settled]);
  return settled ?? remembered ?? "hearth";
}
