// The Analytics LIST chrome-band header (north-star §4 N1/N2, §6.3, D66 A1) — the content the
// `.shell-panel-header` band wraps for the LIST panel: the "ANALYTICS" micro-caps section title + a live
// leaderboard count on the left. Analytics is READ-ONLY (A2: no create), so the band is title + count
// only — the census, never an addition (contrast the chats band's ONE primary New). Flows into the band
// through the section definition's `listHeader` slot (`analytics-section.tsx`), the same definition-owned
// seam the topbar `header` rides — the domain-agnostic shell never names a feature.
//
// The cluster itself is the shared `ListPaneHeader` composite (§11.2); this file owns only the count read.
// It is a non-suspending `useQuery` sharing the `leaderboard` cache with the list surface below (the
// DEFAULT_SORT key), so no extra fetch: the title renders immediately and the count settles in place
// instead of the whole band suspending.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";
import { ANALYTICS_DEFAULT_SORT } from "../lib/analytics-view-model";

export function AnalyticsListHeader(): ReactElement {
  const trpc = useTRPC();
  const { data: rows } = useQuery(trpc.stats.leaderboard.queryOptions({ sort: ANALYTICS_DEFAULT_SORT }));

  return <ListPaneHeader count={rows?.length ?? 0} title="Analytics" />;
}
