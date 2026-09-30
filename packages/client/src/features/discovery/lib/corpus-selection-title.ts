// The Corpus Explore mode's phone title — the mobile pushed frame's topbar names the DOSSIER's subject,
// not the section (side-eye P2). An inactive mode returns `null` and fetches nothing. Cache-first + gated: it shares the `character.get` read the dossier beside
// it already made; `null` until it lands ⇒ the shell prints the section label rather than a blank bar.
// (Its own lines rather than a shared helper: `client-features-no-cross` bars importing character's.)
//
// WITH NO DOSSIER OPEN IT NAMES THE MODE *AND ITS SIZE* (#1676, the #1670 class). On a phone the LIST pane
// IS the screen and the ONE-NAME rule (shell.css) sheds the LIST band's title — and the census travels INSIDE
// that title (`components/list-pane-header.tsx`), so the catalog's size was printed nowhere at all. The count
// goes back with the noun that survives, which on a phone is this one, and it is the SAME `useCorpusCensus`
// the band reads: `Corpus · 313 of 327` here and `Corpus 313 of 327` there are one statement in one place.

import { useGatedQuery, useTRPC } from "#data";
import { CORPUS_MODE_LABELS } from "#lib";
import { useSelectedCorpusCharacterId } from "#state";
import { useCorpusCensus } from "../hooks/use-corpus-census.ts";

export function useCorpusSelectionTitle(active: boolean): string | null {
  const trpc = useTRPC();
  const characterId = useSelectedCorpusCharacterId();
  const { data } = useGatedQuery(active ? characterId : null, (id) => trpc.character.get.queryOptions({ characterId: id }));
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally for
  // exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`).
  const census = useCorpusCensus(active);
  if (!active) {
    return null;
  }
  const name = data?.name ?? "";
  // THE CENSUS IS THE NO-SELECTION ARM, gated on the SELECTION rather than on "did a name land" (#1676):
  // with a member open this screen is that member's, so an unlanded name heals to the shell's section label,
  // never to the library's size — a true number about the wrong screen is not an improvement on a blank one.
  if (characterId !== null) {
    return name.length === 0 ? null : name;
  }
  // A ZERO CENSUS IS STILL SUPPRESSED, in the band's own spelling (`ListPaneHeader`: "a zero census is noise,
  // not information", and `"0"` is the same fact a caller happened to format) — an empty or settling catalog
  // says `Explore`, never the bare section name, and lets its empty state do the teaching.
  if (census === undefined || census === 0 || census === "0") {
    return CORPUS_MODE_LABELS.explore;
  }
  return `${CORPUS_MODE_LABELS.explore} · ${String(census)}`;
}
