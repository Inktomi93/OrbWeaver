// The Characters section's `useSelectionTitle` — what the narrow (phone) topbar calls this SCREEN. With a
// character open it names the PERSON, not the section (side-eye P2): cache-first + gated, sharing the
// `character.get` read the editor beside it already made, so this is a cache hit; `null` until it lands ⇒
// the shell prints the section label rather than a blank bar.
//
// WITH NOBODY OPEN IT NAMES THE LIBRARY *AND ITS SIZE* (#1670). On a phone the LIST pane IS the screen and
// the ONE-NAME rule (shell.css) sheds the LIST band's title — and the census travels INSIDE that title
// (`components/list-pane-header.tsx`: "THE COUNT TRAVELS WITH THE TITLE"), so a phone printed the library's
// size nowhere at all: a 327-character library and an empty one read identically. The count goes back with
// the noun that survives, which on a phone is this one — so the desktop's `Characters 327` and the phone's
// `Characters · 327` are the same statement in the same place, the screen's name.
//
// Corpus and Analytics drill the same ENTITY from their own selection stores and each carry their own
// three-line twin: `client-features-no-cross` bars them from importing this one, and a shared home would
// have to be a fourth place that knows about three sections' stores.

import { useGatedQuery, useTRPC } from "#data";
import { useSelectedCharacterId } from "#state";
import { useCharacterCensus } from "../hooks/use-character-census.ts";
import { CHARACTERS_SECTION_LABEL } from "./characters-section-label.ts";

export function useCharactersSelectionTitle(): string | null {
  const trpc = useTRPC();
  const { data } = useGatedQuery(useSelectedCharacterId(), (id) => trpc.character.get.queryOptions({ characterId: id }));
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally
  // for exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`).
  const census = useCharacterCensus();
  const name = data?.name ?? "";
  if (name.length > 0) {
    return name;
  }
  // A ZERO CENSUS IS STILL SUPPRESSED, in the band's own spelling (`ListPaneHeader`: "a zero census is
  // noise, not information", and `"0"` is the same fact a caller happened to format). An empty library says
  // `Characters` and lets its empty state do the teaching — the count is what distinguishes a populated
  // library from an empty one, and printing `· 0` over copy that already says so is not that distinction.
  if (census === undefined || census === 0 || census === "0") {
    return null;
  }
  return `${CHARACTERS_SECTION_LABEL} · ${String(census)}`;
}
