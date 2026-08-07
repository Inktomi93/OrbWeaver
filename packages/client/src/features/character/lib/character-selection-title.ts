// The Characters section's `useSelectionTitle` — the mobile pushed frame's topbar names the PERSON, not the
// section (side-eye P2). Cache-first + gated: it shares the `character.get` read the editor beside it
// already made, so this is a cache hit; `null` until it lands ⇒ the shell prints the section label rather
// than a blank bar.
//
// Corpus and Analytics drill the same ENTITY from their own selection stores and each carry their own
// three-line twin: `client-features-no-cross` bars them from importing this one, and a shared home would
// have to be a fourth place that knows about three sections' stores.

import { useGatedQuery, useTRPC } from "#data";
import { useSelectedCharacterId } from "#state";

export function useCharactersSelectionTitle(): string | null {
  const trpc = useTRPC();
  const { data } = useGatedQuery(useSelectedCharacterId(), (id) => trpc.character.get.queryOptions({ characterId: id }));
  const name = data?.name ?? "";
  return name.length === 0 ? null : name;
}
