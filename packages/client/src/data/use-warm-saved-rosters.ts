// The shell reads the saved-roster list once at boot so New chat's first open already knows whether its footer carries the door row: the picker's own read
// would leave in the same batch as the library and arrive with it, too late to size the skeleton. The picker reads the same key, bus-fresh at staleTime Infinity.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { peekQueryData } from "./peek-query.ts";
import { useTRPC } from "./trpc.ts";

export function useWarmSavedRosters(): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The options are rebuilt inside the effect: `queryOptions()` is a fresh object every render, and `trpc` and `queryClient` are stable context values.
  useEffect(() => {
    const rosters = trpc.rosterPreset.list.queryOptions();
    if (peekQueryData(queryClient, rosters.queryKey) === undefined) {
      // A failed warm-up is the picker's own read to retry and surface, so the warming caller swallows it.
      void queryClient.query(rosters).catch(() => undefined);
    }
  }, [queryClient, trpc]);
}
