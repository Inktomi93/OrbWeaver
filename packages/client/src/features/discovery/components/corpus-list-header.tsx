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
// home the CONTEXT band shares so the two cannot drift.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";
import { distilledCensus } from "../lib/corpus-vocabulary.ts";

export function CorpusListHeader(): ReactElement {
  const trpc = useTRPC();
  const { data: catalog } = useQuery(trpc.discovery.catalog.queryOptions());

  return <ListPaneHeader count={distilledCensus(catalog?.totalDistilled ?? 0, catalog?.totalCharacters ?? 0)} title="Corpus" />;
}
