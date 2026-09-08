// The Analytics CONTEXT "Time" tab — when activity happens. Reads `timeseries` (daily points → an
// assistant-turn + output-token histogram), `temporal` (streaks / active days / busiest day + the
// weekday activity vector as a bar-list), and `activityHeatmap` (the true 7×24 weekday×hour matrix as a
// <Heatmap> with a VisualMap gradient + the peak cell). Read-only analytics.
//
// SCOPE HONESTY (side-eye rail-analytics 2026-08-19 P1b). `daily_stats` is owner+day grain — no character
// axis — so `timeseries` and `temporal` cannot narrow to the leaderboard-drilled character whose face the
// CONTEXT band shows. The tab says so rather than passing library numbers off as that character's. The
// heatmap alone COULD scope (it is a canon scan), but a scoped chart between two unscoped ones is a worse
// lie than one honest statement over a uniform tab.

import { BarList } from "@orb/ui/bar-list";
import { Heatmap } from "@orb/ui/heatmap";
import { Histogram } from "@orb/ui/histogram";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useTRPC } from "#data";
import { testId } from "#lib";
import {
  activityHeatmapMatrix,
  dailyTokenBuckets,
  dailyTurnBuckets,
  formatCompact,
  formatCount,
  formatPeak,
  seriesTokenProvenance,
  weekdayBarItems,
} from "../lib/analytics-view-model.ts";
import { LibraryScopeNotice } from "./library-scope-notice.tsx";
import { RhythmFigures } from "./rhythm-figures.tsx";

export function AnalyticsTimeTab(): ReactElement {
  return (
    // THE SCROLL BOX IS THE TAB'S, NOT THE BODY'S (#1727, the #1133 hoist — the models tab's header carries
    // the mechanism). Hoisted, the reservation's measuring wrapper sits INSIDE the scroller, where an
    // auto-height child is exactly what a scroller wants, and the scroller survives the read.
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid={testId("analyticsTimeTab")}>
      <QueryBoundary
        fallback={<Text voice="gloss">Loading activity…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="activity" onRetry={retry} />}
        reserveKey="analytics.time"
      >
        <TimeBody />
      </QueryBoundary>
    </Stack>
  );
}

function TimeBody(): ReactElement {
  const trpc = useTRPC();
  const { data: points } = useSuspenseQuery(trpc.stats.timeseries.queryOptions());
  const { data: temporal } = useSuspenseQuery(trpc.stats.temporal.queryOptions());
  const { data: heatmap } = useSuspenseQuery(trpc.stats.activityHeatmap.queryOptions());
  const peak = formatPeak(heatmap.peak);
  const tokensOutProvenance = seriesTokenProvenance(points);

  return (
    <Stack gap="section">
      <LibraryScopeNotice reason="Daily activity is rolled up per day across every character, with no per-character breakdown to narrow to." />

      {/* `formatCompact` on the value axis, like every figure beside it: the token histogram used to print
          raw digits while the stat rows printed "1.2M" — one surface, two number vocabularies (P2f). */}
      <Section heading="Daily replies">
        <Histogram buckets={dailyTurnBuckets(points)} countFormatter={formatCompact} label="Assistant turns per day" />
      </Section>

      <Section heading="Daily tokens">
        <Histogram
          buckets={dailyTokenBuckets(points)}
          countFormatter={(count): string => formatCount(count, tokensOutProvenance)}
          label="Output tokens per day"
        />
      </Section>

      <RhythmFigures temporal={temporal} />

      <Section heading="By weekday">
        <BarList items={weekdayBarItems(temporal.dayOfWeek)} label="Messages by weekday" valueFormatter={formatCompact} />
      </Section>

      <Section heading="By weekday and hour">
        {peak === null ? null : (
          <Text voice="gloss">
            Peak: {peak} ({formatCompact(heatmap.peak?.count ?? 0)})
          </Text>
        )}
        <Heatmap countFormatter={formatCompact} label="Messages by weekday and hour (UTC)" matrix={activityHeatmapMatrix(heatmap.matrix)} />
      </Section>
    </Stack>
  );
}
