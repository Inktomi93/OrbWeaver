// The Analytics CONTEXT "Time" tab — when activity happens. Reads `timeseries` (daily points → an
// assistant-turn + output-token histogram), `temporal` (streaks / active days / busiest day + the
// weekday activity vector as a bar-list), and `activityHeatmap` (the 7×24 matrix collapsed to an
// hour-of-day histogram + the peak cell). Read-only analytics.

import { BarList } from "@orb/ui/bar-list";
import { Histogram } from "@orb/ui/histogram";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId } from "#lib";
import { dailyTokenBuckets, dailyTurnBuckets, formatCompact, formatPeak, hourHistogramBuckets, weekdayBarItems } from "../lib/analytics-view-model";
import { RhythmFigures } from "./rhythm-figures";

export function AnalyticsTimeTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading activity…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="activity" onRetry={retry} />}
    >
      <TimeBody />
    </QueryBoundary>
  );
}

function TimeBody(): ReactElement {
  const trpc = useTRPC();
  const { data: points } = useSuspenseQuery(trpc.stats.timeseries.queryOptions());
  const { data: temporal } = useSuspenseQuery(trpc.stats.temporal.queryOptions());
  const { data: heatmap } = useSuspenseQuery(trpc.stats.activityHeatmap.queryOptions());
  const peak = formatPeak(heatmap.peak);

  return (
    <Stack className="min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="section" data-testid={testId("analyticsTimeTab")}>
      <Section heading="Daily replies">
        <Histogram buckets={dailyTurnBuckets(points)} label="Assistant turns per day" />
      </Section>

      <Section heading="Daily tokens">
        <Histogram buckets={dailyTokenBuckets(points)} label="Output tokens per day" />
      </Section>

      <RhythmFigures temporal={temporal} />

      <Section heading="By weekday">
        <BarList items={weekdayBarItems(temporal.dayOfWeek)} label="Messages by weekday" valueFormatter={formatCompact} />
      </Section>

      <Section heading="By hour">
        {peak === null ? null : (
          <Text size="micro" tone="muted">
            Peak: {peak} ({formatCompact(heatmap.peak?.count ?? 0)})
          </Text>
        )}
        <Histogram buckets={hourHistogramBuckets(heatmap.matrix)} label="Messages by hour (UTC)" />
      </Section>
    </Stack>
  );
}
