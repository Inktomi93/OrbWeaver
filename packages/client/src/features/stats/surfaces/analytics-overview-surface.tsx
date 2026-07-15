// The Analytics CONTENT dashboard (nothing drilled) — the composed turn-economics home. Reads four
// owner-scoped stats verbs: `freshness` (the rollup recency + the has-any-data gate), `wrapped` (the
// highlight reel + embedded temporal streaks), `overview` (the full economics figures), and `momentum`
// (rising / falling characters over the last two active months). The top-character callout drills into
// that character's stats; momentum renders as ranked delta bars. With no data the surface teaches a
// next step (start a chat) instead of showing a wall of zeros.

import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { ChartColumn, Crown, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, useTRPC } from "#data";
import { testId, timeLib, useFocusOnMount } from "#lib";
import { setActiveSection } from "#state";
import {
  formatCompact,
  formatDurationMs,
  formatMs,
  formatPercent,
  formatSignedDelta,
  momentumBarItems,
} from "../lib/analytics-view-model";

export function AnalyticsOverviewSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Stack
      ref={surfaceRef}
      tabIndex={-1}
      className="h-full min-h-0 outline-none"
      data-testid={testId("analyticsOverviewSurface")}
    >
      <QueryBoundary
        fallback={<Text tone="muted">Loading your analytics…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load your analytics.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <OverviewBody />
      </QueryBoundary>
    </Stack>
  );
}

function OverviewBody(): ReactElement {
  const trpc = useTRPC();
  const { data: freshness } = useSuspenseQuery(trpc.stats.freshness.queryOptions());
  const { data: wrapped } = useSuspenseQuery(trpc.stats.wrapped.queryOptions());
  const { data: overview } = useSuspenseQuery(trpc.stats.overview.queryOptions());
  const { data: momentum } = useSuspenseQuery(trpc.stats.momentum.queryOptions());

  // `hasData` is the runtime gate; overview/wrapped are still typed `| null` (an absent rollup), so
  // guard all three together — no data ⇒ the teaching state instead of a wall of zeros.
  if (!freshness.hasData || overview === null || wrapped === null) {
    return (
      <Stack className="h-full min-h-0 place-content-center">
        <EmptyStateNoData />
      </Stack>
    );
  }

  const temporal = wrapped.temporal;
  const rising = momentumBarItems(momentum.rising);
  const falling = momentumBarItems(momentum.falling);

  return (
    <Stack className="h-full min-h-0 overflow-y-auto overscroll-contain" gap="section">
      <Text size="micro" tone="muted">
        {freshness.computedAt === null
          ? "Not computed yet"
          : `Updated ${timeLib.formatRelative(freshness.computedAt)}`}
      </Text>

      <Section heading="Year in review">
        <Stack gap="block">
          <Row gap="block" className="flex-wrap">
            <StatFigure label="Characters" value={formatCompact(wrapped.characters)} />
            <StatFigure label="Chats" value={formatCompact(wrapped.chats)} />
            <StatFigure label="Words" value={formatCompact(wrapped.words)} />
            <StatFigure label="Replies" value={formatCompact(wrapped.replies)} />
            <StatFigure label="Swipes" value={formatCompact(wrapped.swipes)} />
            <StatFigure label="Forked chats" value={formatCompact(wrapped.forkedChats)} />
            <StatFigure label="Spend" value={`$${wrapped.costUsd.toFixed(2)}`} />
            <StatFigure label="Time generating" value={formatDurationMs(wrapped.genTimeMs)} />
          </Row>
          {wrapped.topCharacter === null ? null : (
            <ListRow
              leading={<Icon icon={Crown} size="sm" />}
              title={wrapped.topCharacter.name}
              subtitle="Your most-played character — open the list to drill into any character"
              actions={
                <Text size="micro" tone="muted" className="whitespace-nowrap font-mono">
                  {formatCompact(wrapped.topCharacter.assistantTurns)} replies
                </Text>
              }
            />
          )}
        </Stack>
      </Section>

      <Section heading="Rhythm">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Active days" value={formatCompact(temporal.activeDays)} />
          <StatFigure label="Longest streak" value={`${temporal.longestStreakDays}d`} />
          <StatFigure
            label="Busiest day"
            value={temporal.busiestDay === null ? "—" : formatCompact(temporal.busiestDay.count)}
          />
        </Row>
      </Section>

      <Section heading="Economics">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Tokens in" value={formatCompact(overview.tokensIn)} />
          <StatFigure label="Tokens out" value={formatCompact(overview.tokensOut)} />
          <StatFigure label="Avg gen" value={formatMs(overview.avgGenMs)} />
          <StatFigure label="p50 gen" value={formatMs(overview.p50GenMs)} />
          <StatFigure label="p90 gen" value={formatMs(overview.p90GenMs)} />
          <StatFigure label="Avg TTFT" value={formatMs(overview.avgTtftMs)} />
          <StatFigure label="Throughput" value={`${overview.throughputTps.toFixed(1)} t/s`} />
          <StatFigure label="Cache hits" value={formatPercent(overview.cacheHitRate)} />
          <StatFigure label="Reasoning" value={formatPercent(overview.reasoningRate)} />
        </Row>
      </Section>

      <Section heading="Momentum">
        {momentum.latestMonth === null ? (
          <Text size="micro" tone="muted">
            Not enough recent activity to compare months yet.
          </Text>
        ) : (
          <Stack gap="block">
            <Text size="micro" tone="muted">
              {momentum.prevMonth} → {momentum.latestMonth}
            </Text>
            <Row gap="section" className="flex-wrap items-start">
              <MomentumColumn label="Rising" rows={rising} sign={1} />
              <MomentumColumn label="Falling" rows={falling} sign={-1} />
            </Row>
          </Stack>
        )}
      </Section>
    </Stack>
  );
}

function MomentumColumn({
  label,
  rows,
  sign,
}: {
  readonly label: string;
  readonly rows: readonly { readonly id: string; readonly label: string; readonly value: number }[];
  readonly sign: number;
}): ReactElement {
  if (rows.length === 0) {
    return (
      <Stack gap="field" className="min-w-48 flex-1">
        <Text size="micro" tone="muted" transform="caps">
          {label}
        </Text>
        <Text size="micro" tone="muted">
          None this month.
        </Text>
      </Stack>
    );
  }
  return (
    <Stack className="min-w-48 flex-1">
      <BarList
        items={rows}
        label={label}
        valueFormatter={(value): string => formatSignedDelta(sign * value)}
      />
    </Stack>
  );
}

function EmptyStateNoData(): ReactElement {
  return (
    <EmptyState
      icon={<Icon icon={ChartColumn} size="lg" />}
      title="No analytics yet"
      description="Play a chat and your turn economics — tokens, cost, latency — will show up here."
      action={
        <Button intent="primary" size="sm" onClick={(): void => setActiveSection("chats")}>
          Go to Chats
        </Button>
      }
    />
  );
}
