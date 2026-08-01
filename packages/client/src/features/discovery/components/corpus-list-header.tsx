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

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";

export function CorpusListHeader(): ReactElement {
  const trpc = useTRPC();
  const { data: catalog } = useQuery(trpc.discovery.catalog.queryOptions());

  return <ListPaneHeader count={catalog?.totalDistilled ?? 0} title="Corpus" />;
}
