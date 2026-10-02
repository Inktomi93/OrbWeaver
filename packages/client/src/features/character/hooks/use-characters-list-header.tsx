// The Characters LIST chrome-band header — `CHARACTERS` + the count + the ONE primary (New, with Import
// beside it as the band ghost). It closed the A1/N2 gap: characters passed no `useListHeader` data at all, so its
// title + create lived in the in-surface toolbar while every other section had migrated to the band.
//
// ONE MODE (#501, owner ruling 2026-08-22). The band used to SWAP with the pane (D9): a back chevron +
// `CHATS · <name>` + New chat whenever a character was open, because the pane below it had become her chats.
// The pane is the library now whatever is selected, so a swapping band would mislabel it — the band names
// what the pane IS, and the pane is always the library. Her chats moved to the CONTEXT Chats tab, and the
// two affordances the projection band carried went with them: BACK is not needed (nothing was replaced), and
// New chat is the editor hero's primary (CONTENT tier, where she is open) plus the chats pane's own empty
// state.
//
// IT IS ALSO THE ONE VISIBLE HOME OF THE CENSUS (#518, side-eye se-verify-1). `CHARACTERS 320` and the
// filter rail's `320 characters` printed the same number ~130px apart in a 290px column; the band survives
// by the chats precedent (`chat-list-header.tsx` — a list band prints its list's count), and the pane's line
// stays as a spoken live region only. That single-homing is what makes the lens-aware count below
// mandatory rather than a nicety: one visible census that ignored the filters beside it would be the exact
// #490 defect this section inherited from the other.
//
// ONE VISIBLE CENSUS *PER REGIME* (#1670) — #518's ruling survives, its INPUT changed. This band is the one
// home on the DESKTOP; on a phone the ONE-NAME rule (shell.css) sheds this band's title, and the census
// travels inside it, so the library's size was printed NOWHERE. The phone's copy now rides the topbar's
// screen title (`lib/character-selection-title.ts`), which is the noun that survives there — still exactly
// one visible census on screen, still travelling with the title, in both regimes. Both readers call the one
// `useCharacterCensus`, so the lens-awareness above is not re-derived anywhere.

// The hook supplies view data; the shell owns the band renderer. Actions and overlays retain their existing behavior.

import type { ListPaneHeaderView } from "#lib";
import { useMobileViewport } from "#state";
import { CharacterCreateActions } from "../components/character-create-actions.tsx";
import { useCharacterCensus } from "../hooks/use-character-census.ts";
import { CHARACTERS_SECTION_LABEL } from "../lib/characters-section-label.ts";

export function useCharactersListHeader(): ListPaneHeaderView {
  const count = useCharacterCensus();
  // ON A PHONE THE BAND CARRIES NO ACTION, AND SO THE BAND GOES (#1669 arm A, owner-ruled 2026-09-05). The
  // ONE-NAME rule had already shed the title here; the `action` slot was the only thing left keeping a 48px
  // chrome row alive, and shell.css's "…AND THE BAND GOES WITH IT WHEN NOTHING IS LEFT" `:has()` chain sheds
  // the row the moment nothing but the identity cluster is in it. The cluster is not deleted — it MOVES to
  // the phone's topbar trail as a section-scoped chrome entry (`lib/character-create-chrome.tsx`, which
  // states the whole ruling and the measurement it was bought with), so the same two doors are one tap away
  // on the one row a phone always paints. The DESKTOP band is untouched.
  //
  // IT MUST BE AN OMITTED PROP, NEVER A HIDDEN ONE: a `display:none` action is still a child, and the shed
  // rule is `:has(> *:not([data-slot="list-pane-identity"]))` — CSS cannot un-see it.
  const mobile = useMobileViewport();
  return { count: count ?? 0, title: CHARACTERS_SECTION_LABEL, ...(mobile ? {} : { action: <CharacterCreateActions /> }) };
}
