// useAnalyticsCensus — the leaderboard's ONE census read. Its own module since #1676 because it now has TWO
// readers: the LIST chrome band (`hooks/use-analytics-list-header.tsx`) and the phone topbar's screen title
// (`lib/analytics-selection-title.ts`), which is where the count lives once the ONE-NAME rule (shell.css)
// sheds the band's title. Both share the `leaderboard` cache with the list surface below (the DEFAULT_SORT
// key), so neither costs a request the pane did not already make.

import { useGatedQuery, useTRPC } from "#data";
import { useAnalyticsSearchQuery } from "#state";
import { ANALYTICS_DEFAULT_SORT } from "../lib/analytics-view-model.ts";

/** `N of TOTAL` while the page is capped, the bare number once it holds everything ranked. */
function censusOf(shown: number, total: number): number | string {
  return total > shown ? `${String(shown)} of ${String(total)}` : shown;
}

/**
 * THE COUNT STATES A RELATIONSHIP, NOT A LENGTH (side-eye rail-analytics 2026-08-19 P2g). It read
 * `ANALYTICS 50` against a 328-character library, because `rows.length` on a page capped at 50 IS the cap.
 * The verb returns the ranked `total` beside the page, so a truncated readout is `50 of 328` — the string arm
 * of `ListPaneHeader.count`, minted for exactly this. An untruncated one keeps the bare number: `12 of 12` is
 * noise.
 *
 * AND IT ANSWERS OFF THE SAME LENS AS THE ROWS (P2g). The search lives in `analytics-search-store` precisely
 * so a reader rendered in a different part of the tree narrows WITH them: under a search, `total` is the MATCH
 * count. The key mirrors the surface's DEFAULT_SORT read exactly (search omitted when empty), so on the rest
 * state everything here shares one cached page.
 *
 * `undefined` until the page lands — the honest "not read yet"; the band's `?? 0` renders nothing either way.
 * `enabled: false` fetches nothing: the phone-title reader runs while another Corpus mode is active.
 */
export function useAnalyticsCensus(enabled = true): number | string | undefined {
  const trpc = useTRPC();
  const trimmed = useAnalyticsSearchQuery().trim();
  const { data: page } = useGatedQuery(enabled ? ANALYTICS_DEFAULT_SORT : null, (sort) =>
    trpc.stats.leaderboard.queryOptions({ sort, ...(trimmed === "" ? {} : { search: trimmed }) }),
  );
  return page === undefined ? undefined : censusOf(page.rows.length, page.total);
}
