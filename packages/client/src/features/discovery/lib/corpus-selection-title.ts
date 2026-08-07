// The Corpus section's `useSelectionTitle` — the mobile pushed frame's topbar names the DOSSIER's subject,
// not the section (side-eye P2). Cache-first + gated: it shares the `character.get` read the dossier beside
// it already made; `null` until it lands ⇒ the shell prints the section label rather than a blank bar.
// (Its own three lines rather than a shared helper: `client-features-no-cross` bars importing character's.)

import { useGatedQuery, useTRPC } from "#data";
import { useSelectedCorpusCharacterId } from "#state";

export function useCorpusSelectionTitle(): string | null {
  const trpc = useTRPC();
  const { data } = useGatedQuery(useSelectedCorpusCharacterId(), (id) => trpc.character.get.queryOptions({ characterId: id }));
  const name = data?.name ?? "";
  return name.length === 0 ? null : name;
}
