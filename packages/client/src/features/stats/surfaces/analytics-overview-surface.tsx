// The Analytics CONTENT dashboard (nothing drilled) — the composed turn-economics home. Reads four
// owner-scoped stats verbs: `freshness` (the rollup recency + the has-any-data gate), `wrapped` (the
// highlight reel + embedded temporal streaks), `overview` (the full economics figures), and `momentum`
// (rising / falling characters over the last two active months). The top-character callout drills into
// that character's stats; momentum renders as ranked delta bars. With no data the surface teaches a
// next step (start a chat) instead of showing a wall of zeros.
//
// THE INSET LIVES ON THE SCROLLER, ONCE (#1200 — the Corpus precedent, `corpus-content.tsx`). Analytics
// shipped with padding nowhere in its component tree: a 5-level DOM walk from `analytics-content.tsx`
// down read `padding: 0px` at every level. Corpus's own fix moved the inset to its CONTENT-level owner
// because its surfaces carry no scroll of their own — Analytics' two surfaces are the opposite: each owns
// ITS OWN scroll axis independently (`h-full min-h-0 overflow-y-auto overscroll-contain`), pinned by the
// containing-block CT below and mounted standalone in CT stories with no `analytics-content.tsx` wrapper
// at all — so the inset goes on the same element that already owns the scroll here, not one level up.

import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { ChartColumn, Crown, Icon } from "@orb/ui/icons";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useInvalidation, useTRPC } from "#data";
import { testId, timeLib, useFocusOnMount } from "#lib";
import { setActiveSection, useSectionListMode } from "#state";
import { RhythmFigures } from "../components/rhythm-figures.tsx";
import { isRecomputeAlreadyRunning, useRecomputeStats } from "../hooks/use-recompute-stats.ts";
import {
  formatCompact,
  formatCount,
  formatDurationMs,
  formatMonthLabel,
  formatMs,
  formatPercent,
  formatSignedDelta,
  formatThroughput,
  formatUsd,
  momentumBarItems,
  UNRECORDED_NOTE,
} from "../lib/analytics-view-model.ts";

export function AnalyticsOverviewSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" data-testid={testId("analyticsOverviewSurface")}>
      {/* THE SCROLL BOX IS THE SURFACE'S, NOT THE BODY'S (#1727, the #1133 hoist — `character-editor-surface`
          paid for the class first). `reserveKey`'s measuring Stack is auto-height, so a scroller under the
          boundary resolves `h-full` to `auto` and the surface stops scrolling; hoisted, the measuring wrapper
          sits INSIDE the scroller and the scroller survives the read. The inset and the `analytics-content`
          slot ride the scroller, which is where #1200 put them. */}
      <Stack className="relative h-full min-h-0 overflow-y-auto overscroll-contain" data-slot="analytics-content" padding="section">
        <QueryBoundary
          fallback={<Text voice="gloss">Loading your analytics…</Text>}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="your analytics" onRetry={retry} />}
          reserveKey="analytics.overview"
        >
          <OverviewBody />
        </QueryBoundary>
      </Stack>
    </Stack>
  );
}

function OverviewBody(): ReactElement {
  const trpc = useTRPC();
  const { data: freshness } = useSuspenseQuery(trpc.stats.freshness.queryOptions());
  const { data: wrapped } = useSuspenseQuery(trpc.stats.wrapped.queryOptions());
  const { data: overview } = useSuspenseQuery(trpc.stats.overview.queryOptions());
  const { data: momentum } = useSuspenseQuery(trpc.stats.momentum.queryOptions());
  // #451: the list defaults COLLAPSED here, so "open the list" is right by default — but wrong once a
  // reader docks it, and even collapsed the affordance's verbatim name is "Show list panel" (the topbar
  // toggle, `shell-topbar.tsx`), not "open the list" (WCAG 2.5.3, label-in-name).
  const listMode = useSectionListMode("analytics");

  // `hasData` is the runtime gate; overview/wrapped are still typed `| null` (an absent rollup), so
  // guard all three together — no data ⇒ the teaching state instead of a wall of zeros.
  if (!freshness.hasData || overview === null || wrapped === null) {
    // TOP-ALIGNED, NOT PANE-CENTRED, SINCE THE #1727 HOIST — and that is a real appearance delta, recorded
    // rather than hidden. Vertical centring needs free space, which needs a definite height; inside the
    // reservation's auto-height measuring wrapper there is none (`h-full` would resolve to `auto` and
    // `place-content-center` to a no-op), so the honest shape is the one the twin CONTENT surface already
    // ships: the teaching state at the top of the padded pane (`analytics-character-surface`'s own empty arm).
    return <EmptyStateNoData />;
  }

  const temporal = wrapped.temporal;
  const rising = momentumBarItems(momentum.rising);
  const falling = momentumBarItems(momentum.falling);
  // ONE SCALE ACROSS BOTH COLUMNS (side-eye ANALYTICS 2026-08-19, P1d). Rising and Falling are two
  // <BarList>s presented as a comparison; auto-scaled independently they drew +10 and −184 as
  // near-identical full-width bars, with the sign living only in a bar-end label narrow panes clip. The
  // shared maximum is the comparison; the semantic colour below is the redundant channel, not the fix.
  const momentumMax = Math.max(0, ...rising.map((row) => row.value), ...falling.map((row) => row.value));
  const momentumScale = momentumMax > 0 ? momentumMax : undefined;
  const topCharacterSubtitle =
    listMode === "collapsed" ? "Your most-played character — Show list panel to drill into any character" : "Your most-played character";

  return (
    <Stack gap="section">
      <Row align="center" justify="between" gap="row">
        {/* ONE time vocabulary in this column: relative in the text, the exact stamp in `title=` (P2e). */}
        <Text voice="gloss" {...(freshness.computedAt === null ? {} : { title: timeLib.formatDateTime(freshness.computedAt) })}>
          {freshness.computedAt === null ? "Not computed yet" : `Updated ${timeLib.formatRelative(freshness.computedAt)}`}
        </Text>
        <RecomputeButton />
      </Row>

      <Section heading="Year in review">
        <Stack gap="block">
          {/* A real grid, not flex-wrap (side-eye rail-analytics 2026-08-19 Taste): intrinsic-width figures
              in a `flex-wrap` left uneven voids and arbitrary wraps. `cols="cell"` tiles even 1fr tracks at a
              fixed column-min, so the column-gap is uniform at every width. */}
          <Grid cols="cell" gap="block">
            <StatFigure label="Characters" value={formatCompact(wrapped.characters)} />
            <StatFigure label="Chats" value={formatCompact(wrapped.chats)} />
            <StatFigure label="Words" value={formatCompact(wrapped.words)} />
            <StatFigure label="Replies" value={formatCompact(wrapped.replies)} />
            <StatFigure label="Swipes" value={formatCompact(wrapped.swipes)} />
            <StatFigure label="Forked chats" value={formatCompact(wrapped.forkedChats)} />
            <StatFigure label="Spend" value={formatUsd(wrapped.costUsd)} />
            <StatFigure label="Time generating" value={formatDurationMs(wrapped.genTimeMs)} />
          </Grid>
          {/* THE DEFINITIONS, STATED (P2d/P3d). "Words" is your turns PLUS the replies — one definition,
              here and on the drill, where it used to silently mean assistant-only. The swipe words sit
              beside "Swipes" and are NOT in it, which is the exact pair that read as a contradiction. */}
          <Text voice="gloss">
            Words counts your turns and the replies you kept; the {formatCompact(overview.swipeWords)} words in swipes you didn't keep are not included.{" "}
            {UNRECORDED_NOTE}
          </Text>
          {wrapped.topCharacter === null ? null : (
            <ListRow
              leading={<Icon icon={Crown} size="sm" />}
              title={wrapped.topCharacter.name}
              subtitle={topCharacterSubtitle}
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
        <Stack gap="block">
          <Grid cols="cell" gap="block">
            <StatFigure label="Tokens in" value={formatCount(overview.tokensIn, overview.tokensInProvenance)} />
            <StatFigure label="Tokens out" value={formatCount(overview.tokensOut, overview.tokensOutProvenance)} />
            <StatFigure label="Avg gen" value={formatMs(overview.avgGenMs)} />
            <StatFigure label="p50 gen" value={formatMs(overview.p50GenMs)} />
            <StatFigure label="p90 gen" value={formatMs(overview.p90GenMs)} />
            <StatFigure label="Avg TTFT" value={formatMs(overview.avgTtftMs)} />
            <StatFigure label="Throughput" value={formatThroughput(overview.throughputTps, overview.tokensOutProvenance)} />
            {/* THE DENOMINATOR IS IN THE LABEL (P1a/P3d). "Cache hits" alone read 100% on every backend
                that reports cache READS but not cache WRITES — the old ratio's denominator was the two
                cache columns, so it could only ever be 1 or 0. Against input tokens it answers the
                question the tile asks, and it says which question that is. */}
            <StatFigure label="Cache hits (of input)" value={formatPercent(overview.cacheHitRate, overview.tokensInProvenance)} />
            <StatFigure label="Reasoning (of replies)" value={formatPercent(overview.reasoningRate)} />
            {/* The reasoning WINDOW beside the reasoning RATE (#184): the rollups have carried `reasoningMs`
                on three tables and three views with no reader at all, so the number a user's thinking models
                produce had nowhere to land. Same duration voice as "Time generating" above. */}
            <StatFigure label="Time reasoning" value={formatDurationMs(overview.reasoningMs)} />
          </Grid>
          <Text voice="gloss">
            Cache hits is the share of the tokens you sent that the provider served from its prompt cache; Reasoning is the share of replies and swipes that
            produced a thinking pass. {UNRECORDED_NOTE}
          </Text>
        </Stack>
      </Section>

      <Section heading="Momentum">
        {momentum.latestMonth === null ? (
          <Text voice="gloss">Not enough recent activity to compare months yet.</Text>
        ) : (
          <Stack gap="block">
            {/* Month NAMES, not the `YYYY-MM` sort key — the raw form put a second time vocabulary in a
                column that otherwise speaks in relative phrases (P2e). Deliberately absolute: the pair is
                the two most-recent months WITH ACTIVITY, which need not be anywhere near now. */}
            <Text voice="gloss">
              {momentum.prevMonth === null ? "" : formatMonthLabel(momentum.prevMonth)} → {formatMonthLabel(momentum.latestMonth)}
            </Text>
            <Row gap="section" className="flex-wrap items-start">
              <MomentumColumn label="Rising" rows={rising} sign={1} valueMax={momentumScale} />
              <MomentumColumn label="Falling" rows={falling} sign={-1} valueMax={momentumScale} />
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
  valueMax,
}: {
  readonly label: string;
  readonly rows: readonly { readonly id: string; readonly label: string; readonly value: number }[];
  readonly sign: number;
  /** The maximum SHARED with the twin column — the whole reason these two charts are comparable. */
  readonly valueMax: number | undefined;
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
      <BarList
        intent={sign > 0 ? "positive" : "negative"}
        items={rows}
        label={label}
        valueFormatter={(value): string => formatSignedDelta(sign * value)}
        valueMax={valueMax}
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
