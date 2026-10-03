// The Analytics CONTEXT "Time" tab — when activity happens, on the VIEWER's calendar. One read, the
// `timeseries` quarter-hour timeline, folded through the time seam into local days (the reply and token
// histograms, the rhythm trio), weekdays (the bar-list) and weekday × hour (the <Heatmap>).
//
// SCOPE HONESTY (side-eye rail-analytics 2026-08-19 P1b). The timeline is owner grain — no character axis —
// so this tab cannot narrow to the leaderboard-drilled character whose face the CONTEXT band shows. The tab
// says so rather than passing library numbers off as that character's.

import { BarList } from "@orb/ui/bar-list";
import { Heatmap } from "@orb/ui/heatmap";
import { Histogram } from "@orb/ui/histogram";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import {
  activityHeatmapMatrix,
  dailyTokenBuckets,
  dailyTurnBuckets,
  formatCompact,
  formatCount,
  formatPeak,
  seriesTokenProvenance,
  UNRECORDED_NOTE,
  weekdayBarItems,
} from "../lib/analytics-view-model.ts";
import { localTimeline, rhythmOf } from "../lib/local-calendar-folds.ts";
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
  const { data: buckets } = useSuspenseQuery(trpc.stats.timeseries.queryOptions());
  const timeline = localTimeline(buckets, timeLib.calendarPosition);
  const tokensOutProvenance = seriesTokenProvenance(timeline.days);
  const tokenBuckets = dailyTokenBuckets(timeline.days, timeLib);

  return (
    <Stack gap="section">
      <LibraryScopeNotice reason="Activity over time is rolled up across every character, with no per-character breakdown to narrow to." />

      {/* `formatCompact` on the value axis, like every figure beside it: the token histogram used to print
          raw digits while the stat rows printed "1.2M" — one surface, two number vocabularies (P2f). */}
      <Section heading="Daily replies">
        <Histogram buckets={dailyTurnBuckets(timeline.days, timeLib)} countFormatter={formatCompact} label="Assistant turns per day" />
      </Section>

      <Section heading="Daily tokens">
        {tokenBuckets.length === 0 ? (
          <Text voice="gloss">No output token accounting recorded in this period.</Text>
        ) : (
          <Histogram buckets={tokenBuckets} countFormatter={(count): string => formatCount(count, tokensOutProvenance)} label="Output tokens per day" />
        )}
        <Text voice="gloss">Aggregate only. Days with unrecorded output tokens are omitted. {UNRECORDED_NOTE}</Text>
      </Section>

      <RhythmFigures rhythm={rhythmOf(timeline.days)} />

      <Section heading="By weekday">
        <BarList items={weekdayBarItems(timeline.weekdayActivity)} label="Messages by weekday" valueFormatter={formatCompact} />
      </Section>

      <Section heading="By weekday and hour">
        {timeline.peak === null ? null : (
          <Text voice="gloss">
            Peak: {formatPeak(timeline.peak)} ({formatCompact(timeline.peak.count)})
          </Text>
        )}
        <Heatmap countFormatter={formatCompact} label="Messages by weekday and hour" matrix={activityHeatmapMatrix(timeline.weekHourTurns)} />
      </Section>
    </Stack>
  );
}
