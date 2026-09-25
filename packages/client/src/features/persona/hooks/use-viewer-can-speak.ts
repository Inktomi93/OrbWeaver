// Whether the signed-in viewer can speak as a persona: a global pointer names one. The first-run persona gate
// ends by setting both pointers, and that write seeds this read with its own response, so a join that waits for
// it opens the moment the gate closes. A seat is then never created before the joiner has a persona.

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";

/** False while the settings read is in flight, and while neither the current nor the default pointer is set. */
export function useViewerCanSpeak(): boolean {
  const trpc = useTRPC();
  const seeds = useQuery(trpc.settings.getUserSettings.queryOptions()).data?.config.seeds;
  return seeds !== undefined && (seeds.currentPersonaId !== null || seeds.defaultPersonaId !== null);
}
