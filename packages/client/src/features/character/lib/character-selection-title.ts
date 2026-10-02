// The Characters section's `useSelectionTitle` — what the narrow (phone) topbar calls this SCREEN. With a
// character open it names the PERSON, not the section (side-eye P2): cache-first + gated, sharing the
// `character.get` read the editor beside it already made, so this is a cache hit; `null` until it lands ⇒
// the shell prints the section label rather than a blank bar.
//
// THE ARM IS THE SELECTION, NOT WHETHER A NAME LANDED (#1670 follow-up). This used to answer "did
// `character.get` give me a name yet?" and fall through to the census when it had not — so an OPEN member
// whose read was still in flight printed the LIBRARY's size over her, and a member whose name is legitimately
// empty would print it for good. The question the shell is asking is "what is this SCREEN", and the screen is
// decided by the SELECTION: with somebody open the answer is her name or nothing (the shell then prints the
// section label rather than a blank bar); the census belongs only to the arm where the screen IS the roster.
// The sibling sections gate on their selection for exactly this reason — chat titles are stored `""` until
// renamed, so there the name-landed spelling would have been permanently wrong rather than a flash.
//
// WITH NOBODY OPEN IT NAMES THE LIBRARY *AND ITS SIZE* (#1670). On a phone the LIST pane IS the screen and
// the ONE-NAME rule (shell.css) sheds the LIST band's title — and the census travels INSIDE that title
// (`components/list-pane-header.tsx`: "THE COUNT TRAVELS WITH THE TITLE"), so a phone printed the library's
// size nowhere at all: a 320-character library and an empty one read identically. The count goes back with
// the noun that survives, which on a phone is this one — so the desktop's `Characters 320` and the phone's
// `Characters · 320` are the same statement in the same place, the screen's name.
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
  const selectedCharacterId = useSelectedCharacterId();
  const { data } = useGatedQuery(selectedCharacterId, (id) => trpc.character.get.queryOptions({ characterId: id }));
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally
  // for exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`).
  const census = useCharacterCensus();
  if (selectedCharacterId !== null) {
    // Somebody is open, so this screen is HERS whatever the read has done. `null` while the name is in
    // flight (or empty) hands the shell its section label — never the roster's census over a member.
    const name = data?.name ?? "";
    return name.length === 0 ? null : name;
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
