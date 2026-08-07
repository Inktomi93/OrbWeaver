// The Analytics section's `useSelectionTitle` — the mobile pushed frame's topbar names the DRILLED
// character, not the section (side-eye P2). Cache-first + gated, sharing the `character.get` read the drill
// surface already made; `null` until it lands ⇒ the shell prints the section label rather than a blank bar.

import { useGatedQuery, useTRPC } from "#data";
import { useSelectedAnalyticsCharacterId } from "#state";

export function useAnalyticsSelectionTitle(): string | null {
  const trpc = useTRPC();
  const { data } = useGatedQuery(useSelectedAnalyticsCharacterId(), (id) => trpc.character.get.queryOptions({ characterId: id }));
  const name = data?.name ?? "";
  return name.length === 0 ? null : name;
}
