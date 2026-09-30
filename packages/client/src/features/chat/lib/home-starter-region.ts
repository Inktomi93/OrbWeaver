import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { HomeTileRegion } from "#state";
import { RECENTS_LIMIT } from "../components/home-recents-tile-body.tsx";

/**
 * Where "Start with" lands: the hearth while the house has no room, else the shelf.
 *
 * @remarks With no room to resume, the hearth holds only the first-room greeting and the section rail and ends hundreds
 * of pixels above the shelf. "Start with" is that house's first step and the one move that levels the columns: moving
 * the rosters and temp chat tiles as well tips the void to the shelf side (`home-column-balance.suite.ct.tsx`).
 */
export function useStarterRegion(): HomeTileRegion {
  const trpc = useTRPC();
  const page = useQuery(trpc.chat.listChats.queryOptions({ limit: RECENTS_LIMIT })).data;
  return page?.totalCount === 0 ? "hearth" : "shelf";
}
