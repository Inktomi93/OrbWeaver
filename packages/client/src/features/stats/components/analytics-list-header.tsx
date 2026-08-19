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
//
// THE COUNT STATES A RELATIONSHIP, NOT A LENGTH (side-eye rail-analytics 2026-08-19 P2g). The band read
// `ANALYTICS 50` against a 328-character library, because `rows.length` on a page capped at 50 IS the cap.
// The verb now returns the ranked `total` beside the page, so a truncated band reads `50 of 328` — the
// string arm of `ListPaneHeader.count`, minted for exactly this (a page-BOUNDED count that already read
// `100+` off its own limit). An untruncated band keeps the bare number: `12 of 12` is noise.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";
import { ANALYTICS_DEFAULT_SORT } from "../lib/analytics-view-model.ts";

export function AnalyticsListHeader(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useQuery(trpc.stats.leaderboard.queryOptions({ sort: ANALYTICS_DEFAULT_SORT }));
  const shown = page?.rows.length ?? 0;
  const total = page?.total ?? 0;

  return <ListPaneHeader count={total > shown ? `${shown} of ${total}` : shown} title="Analytics" />;
}
