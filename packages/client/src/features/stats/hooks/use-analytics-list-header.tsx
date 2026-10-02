// The Corpus Insights LIST chrome-band header (north-star §4 N1/N2, §6.3, D66 A1) — the content the
// `.shell-panel-header` band wraps for the LIST panel: the "INSIGHTS" micro-caps mode title + a live
// leaderboard count on the left. Insights is READ-ONLY (A2: no create), so the band is title + count
// only — the census, never an addition (contrast the chats band's ONE primary New). Flows into the band
// through the Insights mode's `useListHeader` data (`insights-mode.tsx`), so the domain-agnostic shell never names
// a feature.
//
// The cluster itself is the shared `ListPaneHeader` composite (§11.2); the count READ moved out to
// `hooks/use-analytics-census.ts` with #1676, because the phone topbar reads it too — the two rulings below
// are that read's, and they moved with it.
//
// ONE VISIBLE CENSUS *PER REGIME* (#1676, the #1670 class). On a phone the ONE-NAME rule (shell.css) sheds
// this band's title and the census travels INSIDE it (`list-pane-header.tsx`: "THE COUNT TRAVELS WITH THE
// TITLE"), so the leaderboard's size was printed NOWHERE there. It now also rides the topbar's screen title
// (`lib/analytics-selection-title.ts`), the noun that survives.
// It is a non-suspending `useQuery` sharing the `leaderboard` cache with the list surface below (the
// DEFAULT_SORT key), so no extra fetch: the title renders immediately and the count settles in place
// instead of the whole band suspending.
//
// THE COUNT STATES A RELATIONSHIP, NOT A LENGTH (side-eye rail-analytics 2026-08-19 P2g). The band read
// `ANALYTICS 50` against a 328-character library, because `rows.length` on a page capped at 50 IS the cap.
// The verb now returns the ranked `total` beside the page, so a truncated band reads `50 of 328` — the
// string arm of `ListPaneHeader.count`, minted for exactly this (a page-BOUNDED count that already read
// `100+` off its own limit). An untruncated band keeps the bare number: `12 of 12` is noise.
//
// THE CENSUS ANSWERS OFF THE SAME LENS AS THE ROWS (P2g). The search lives in `analytics-search-store` (the
// preset-search precedent) precisely so this band — rendered by the shell, in a different part of the tree
// than the rows — narrows WITH them: under a search, `total` is the MATCH count, so the band reads "3 of 3"
// / "50 of 120 matches" rather than "50 of 328" beside three rows. The key mirrors the surface's DEFAULT_SORT
// read exactly (search omitted when empty), so on the rest state the two still share one cached page.

// The hook supplies view data; the shell owns the band renderer. Actions and overlays retain their existing behavior.

import type { ListPaneHeaderView } from "#lib";
import { CORPUS_MODE_LABELS } from "#lib";
import { useAnalyticsCensus } from "../hooks/use-analytics-census.ts";

export function useAnalyticsListHeader(active = true): ListPaneHeaderView {
  const count = useAnalyticsCensus(active);
  return { count: count ?? 0, title: CORPUS_MODE_LABELS.insights };
}
