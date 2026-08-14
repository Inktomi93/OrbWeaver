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
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { testId, timeLib, useFocusOnMount } from "#lib";
import { setActiveSection } from "#state";
import { RhythmFigures } from "../components/rhythm-figures.tsx";
import { isRecomputeAlreadyRunning, useRecomputeStats } from "../hooks/use-recompute-stats.ts";
import { formatCompact, formatDurationMs, formatMs, formatPercent, formatSignedDelta, momentumBarItems } from "../lib/analytics-view-model.ts";

export function AnalyticsOverviewSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" data-testid={testId("analyticsOverviewSurface")}>
      <QueryBoundary
        fallback={<Text voice="gloss">Loading your analytics…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your analytics" onRetry={retry} />}
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
    <Stack className="relative h-full min-h-0 overflow-y-auto overscroll-contain" gap="section">
      <Row align="center" justify="between" gap="row">
        <Text voice="gloss">{freshness.computedAt === null ? "Not computed yet" : `Updated ${timeLib.formatRelative(freshness.computedAt)}`}</Text>
        <RecomputeButton />
      </Row>

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
                <Text voice="gloss" className="whitespace-nowrap font-mono">
                  {formatCompact(wrapped.topCharacter.assistantTurns)} replies
                </Text>
              }
            />
          )}
        </Stack>
      </Section>

      <RhythmFigures temporal={temporal} />

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
          <Text voice="gloss">Not enough recent activity to compare months yet.</Text>
        ) : (
          <Stack gap="block">
            <Text voice="gloss">
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

/** Rebuild the caller's rollups from canon, awaited, and re-read the dashboard. The rollups are maintained
 *  live on the chat write path, so this is the repair affordance for a drifted/imported library — the same
 *  pass the `reconcile-stats` workload runs, minus the queue round-trip.
 *
 *  The button disables while its OWN call is in flight; the server's per-user single-flight gate covers the
 *  case this cannot see (another tab, or a pass still running from before this mount) by refusing with
 *  CONFLICT — surfaced as the quiet notice below, since the running pass will still land. */
function RecomputeButton(): ReactElement {
  const recompute = useRecomputeStats({ trpc: useTRPC(), invalidation: useInvalidation() });
  return (
    <Row align="center" gap="field">
      {isRecomputeAlreadyRunning(recompute.error) ? (
        <Text voice="gloss" role="status">
          A recompute is already running — it'll finish on its own.
        </Text>
      ) : null}
      <Button intent="ghost" size="sm" disabled={recompute.isPending} onClick={(): void => recompute.mutate(undefined)}>
        {recompute.isPending ? "Recomputing…" : "Recompute now"}
      </Button>
    </Row>
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
        <Text voice="kicker">{label}</Text>
        <Text voice="gloss">None this month.</Text>
      </Stack>
    );
  }
  return (
    <Stack className="min-w-48 flex-1">
      <BarList items={rows} label={label} valueFormatter={(value): string => formatSignedDelta(sign * value)} />
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
