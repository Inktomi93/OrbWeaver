// The corpus-LIST chrome-band header (north-star §4 N1/N2, §6.3) — the content the `.shell-panel-header`
// band wraps for the Corpus LIST panel: the "CORPUS" micro-caps section title + a live distilled-card
// count. Flows into the band through the section definition's `listHeader` slot (`corpus-section.tsx`),
// the same definition-owned seam the chats lane rides — the domain-agnostic shell never names a feature.
//
// Per §2 action-ownership, Corpus is BROWSE-shaped: it has no create verb, so the band carries title +
// count only (P2's "≤1 ember button" is trivially met — zero buttons; the shared `ListPaneHeader` renders
// no action node at all). The count is a non-suspending `useQuery` on the shared `discovery.catalog` cache
// (the browse view below suspends on it already, so no extra fetch): the title renders immediately and
// stays put while the count settles.
//
// THE COUNT NAMES ITS BASE (issue #535). This band printed a bare `CORPUS 313` — `totalDistilled`, the size
// of the DISTILLED catalog the list below it browses — in the same frame as an overview h1 reading "327
// characters". Two true numbers of two different things, one of them unlabelled, and the only reading
// available to a user is that the app disagrees with itself about how many characters they own. `N of TOTAL`
// is the band's own existing idiom for a count that is a subset (`chat-list-header.tsx`,
// `characters-list-header.tsx`, `analytics-list-header.tsx` all print it), and `distilledCensus` is the one
// home the CONTEXT band shares so the two cannot drift. The read itself moved to `hooks/use-corpus-census.ts`
// with #1676 — see below.
//
// ONE VISIBLE CENSUS *PER REGIME* (#1676, the #1670 class). On a phone the ONE-NAME rule (shell.css) sheds
// this band's title and the census travels INSIDE it (`list-pane-header.tsx`: "THE COUNT TRAVELS WITH THE
// TITLE"), so the catalog's size was printed NOWHERE there. It now also rides the topbar's screen title
// (`lib/corpus-selection-title.ts`), the noun that survives — still exactly one visible census on screen,
// per regime, and both readers call the one `useCorpusCensus` so `distilledCensus` is not re-spelled.

import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { CORPUS_MODE_LABELS } from "#lib";
import { useCorpusCensus } from "../hooks/use-corpus-census.ts";

/** The band names the active MODE (D271): the LIST landmark follows it, so the pane announces its finder. */
export function CorpusListHeader(): ReactElement {
  const count = useCorpusCensus();
  return <ListPaneHeader count={count ?? 0} title={CORPUS_MODE_LABELS.explore} />;
}
