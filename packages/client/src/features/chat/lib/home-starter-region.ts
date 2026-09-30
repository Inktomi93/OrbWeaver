import { usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC } from "#data";
import type { HomeTileRegion } from "#state";
import { rememberHomeRegion, useRememberedHomeRegion } from "#state";
import { QUICK_PICKS_LIMIT } from "../components/home-quick-picks-tile-body.tsx";
import { RECENTS_LIMIT } from "../components/home-recents-tile-body.tsx";

/** The quick-picks tile id, which is also its key in the device's region memory. */
export const QUICK_PICKS_TILE_ID = "chat.quickPicks";

function regionFor(roomCount: number): HomeTileRegion {
  return roomCount === 0 ? "hearth" : "shelf";
}

/**
 * Where "Start with" lands: the hearth while the house has no room, else the shelf.
 *
 * @remarks With no room to resume, the hearth holds only the first-room greeting and the section rail. Until the room
 * list settles, the tile stands where it last settled on this device; a device with no memory holds it out of both
 * columns (`null`) rather than guess, because a wrong guess moves it across columns once the list lands. A list that
 * errors or pauses offline ends the hold in the hearth.
 */
export function useStarterRegion(): HomeTileRegion | null {
  const trpc = useTRPC();
  const chats = useQuery(trpc.chat.listChats.queryOptions({ limit: RECENTS_LIMIT }));
  const page = chats.data;
  // While the tile is held its body is unmounted, so its faces read would wait behind the room list. Start it here.
  usePrefetchQuery(trpc.character.list.queryOptions({ limit: QUICK_PICKS_LIMIT }));
  const remembered = useRememberedHomeRegion(QUICK_PICKS_TILE_ID);
  const settled = page === undefined ? undefined : regionFor(page.totalCount);
  useEffect(() => {
    if (settled !== undefined) {
      rememberHomeRegion(QUICK_PICKS_TILE_ID, settled);
    }
  }, [settled]);
  // A room list that failed or is waiting for the network may not arrive for a long time, and holding the tile keeps
  // the whole shelf invisible, so it falls back to the hearth, the new account's column.
  const unreachable = chats.isError || chats.isPaused;
  return settled ?? remembered ?? (unreachable ? "hearth" : null);
}
