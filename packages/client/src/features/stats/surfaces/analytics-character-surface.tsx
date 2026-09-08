// The Analytics CONTENT drill (a character selected in the leaderboard) — one character's turn
// economics. Reads `character` (the single-character rollup: turns, words, tokens, cost, gen figures)
// and `latency` scoped to that character (on-read TTFT/gen percentiles the rollup can't store). Its
// ONE affordance is Back to the dashboard; there is no primary action (Analytics is read-only).
//
// THE INSET RIDES THIS SURFACE'S OWN SCROLLER (#1200) — see `analytics-overview-surface.tsx`'s header for
// why Analytics' twin surfaces each carry their own inset rather than a shared one at `analytics-content.tsx`.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { ArrowLeft, ChartColumn, Icon } from "@orb/ui/icons";
import { Grid, Section, Stack } from "@orb/ui/layout";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useTRPC } from "#data";
import { testId, timeLib, useFocusOnMount } from "#lib";
import {
  formatCompact,
  formatCount,
  formatDurationMs,
  formatMs,
  formatPercent,
  formatThroughput,
  formatUsd,
  UNRECORDED_NOTE,
} from "../lib/analytics-view-model.ts";

export interface AnalyticsCharacterSurfaceProps {
  readonly characterId: CharacterId;
  readonly onBack: () => void;
}

export function AnalyticsCharacterSurface({ characterId, onBack }: AnalyticsCharacterSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" data-testid={testId("analyticsCharacterSurface")}>
      {/* THE SCROLL BOX IS THE SURFACE'S, NOT THE BODY'S (#1727, the #1133 hoist — `character-editor-surface`
          paid for the class first). `reserveKey`'s measuring Stack is auto-height, so a scroller under the
          boundary resolves `h-full` to `auto` and the surface stops scrolling; hoisted, the measuring wrapper
          sits INSIDE the scroller and the scroller survives the read. The inset and the `analytics-content`
          slot ride the scroller, which is where #1200 put them. */}
      <Stack className="relative h-full min-h-0 overflow-y-auto overscroll-contain" data-slot="analytics-content" padding="section">
        <QueryBoundary
          fallback={<Text voice="gloss">Loading character stats…</Text>}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="these stats" onRetry={retry} />}
          reserveKey="analytics.character"
        >
          <CharacterBody characterId={characterId} onBack={onBack} />
        </QueryBoundary>
      </Stack>
    </Stack>
  );
}

function CharacterBody({ characterId, onBack }: { readonly characterId: CharacterId; readonly onBack: () => void }): ReactElement {
  const trpc = useTRPC();
  const { data: stats } = useSuspenseQuery(trpc.stats.character.queryOptions({ characterId }));
  const { data: latency } = useSuspenseQuery(trpc.stats.latency.queryOptions({ kind: "character", characterId }));
  // Non-suspending name read — only used to NAME the empty state; the figures below already carry
  // the name via `stats.name`, so this degrades quietly to a generic sentence until the cache populates.
  const { data: character } = useQuery(trpc.character.get.queryOptions({ characterId }));
  const drilledName = character?.name.trim() ?? "";

  if (stats === null) {
    return (
      <EmptyState
        icon={<Icon icon={ChartColumn} size="lg" />}
        title="No stats yet"
        description={
          drilledName.length > 0
            ? `${drilledName} has no rolled-up activity yet. Play a chat with them, then come back.`
            : "This character has no rolled-up activity. Play a chat with them, then come back."
        }
        action={
          <Button intent="secondary" size="sm" onClick={onBack}>
            <Icon icon={ArrowLeft} size="sm" />
            Back
          </Button>
        }
      />
    );
  }

  return (
    <Stack gap="section">
      <Button intent="ghost" size="sm" onClick={onBack} className="self-start">
        <Icon icon={ArrowLeft} size="sm" />
        Back
      </Button>

      <Stack gap="field">
        <Text className="text-title leading-title font-semibold">{stats.name}</Text>
        {stats.lastActivityAt === null ? null : (
          // Relative in the text, the exact stamp in `title=` — the one time vocabulary this column speaks.
          <Text voice="gloss" title={timeLib.formatDateTime(stats.lastActivityAt)}>
            Last active {timeLib.formatRelative(stats.lastActivityAt)}
          </Text>
        )}
      </Stack>

      <Section heading="Activity">
        <Stack gap="block">
          {/* A real grid, not flex-wrap (side-eye rail-analytics 2026-08-19 Taste) — even 1fr tracks at a
              fixed column-min, so the column-gap is uniform at every width instead of the flex voids. */}
          <Grid cols="cell" gap="block">
            <StatFigure label="Chats" value={formatCompact(stats.chats)} />
            <StatFigure label="Replies" value={formatCompact(stats.assistantTurns)} />
            <StatFigure label="Your turns" value={formatCompact(stats.userTurns)} />
            <StatFigure label="Swipes" value={formatCompact(stats.swipes)} />
            {/* ONE definition of "Words" across both surfaces (P2d): your turns + the replies you kept.
                This tile used to be `assistantWords` under the same label the dashboard used for the
                TOTAL, so the drill's number could never be reconciled with the dashboard's. */}
            <StatFigure label="Words" value={formatCompact(stats.userWords + stats.assistantWords)} />
            <StatFigure label="Assistant words" value={formatCompact(stats.assistantWords)} />
            <StatFigure label="Forked chats" value={formatCompact(stats.forkedChats)} />
          </Grid>
          <Text voice="gloss">
            Words counts your turns and the replies you kept; the {formatCompact(stats.swipeWords)} words in swipes you didn't keep are not included.
          </Text>
        </Stack>
      </Section>

      <Section heading="Economics">
        <Stack gap="block">
          <Grid cols="cell" gap="block">
            <StatFigure label="Tokens in" value={formatCount(stats.tokensIn, stats.tokensInProvenance)} />
            <StatFigure label="Tokens out" value={formatCount(stats.tokensOut, stats.tokensOutProvenance)} />
            <StatFigure label="Spend" value={formatUsd(stats.costUsd)} />
            {/* Per-character cache accounting does not exist: `character_stats` carries no cache columns
                at all (the rollup is owner+model grain), so this tile printed a hard-coded 0%. It now
                reads the em dash the absence has always deserved. */}
            <StatFigure label="Cache hits (of input)" value={formatPercent(stats.cacheHitRate, stats.tokensInProvenance)} />
            <StatFigure label="Reasoning (of replies)" value={formatPercent(stats.reasoningRate)} />
            {/* The reasoning WINDOW beside the reasoning RATE (#184) — the per-character half of the same
                unrendered rollup column. */}
            <StatFigure label="Time reasoning" value={formatDurationMs(stats.reasoningMs)} />
            <StatFigure label="Throughput" value={formatThroughput(stats.throughputTps, stats.tokensOutProvenance)} />
          </Grid>
          <Text voice="gloss">
            Cache hits is the share of the tokens you sent that the provider served from its prompt cache — it is not rolled up per character, so it reads as a
            dash here. {UNRECORDED_NOTE}
          </Text>
        </Stack>
      </Section>

      <Section heading="Latency">
        <Grid cols="cell" gap="block">
          <StatFigure label="Avg TTFT" value={formatMs(latency.avgTtftMs)} />
          <StatFigure label="p50 TTFT" value={formatMs(latency.p50TtftMs)} />
          <StatFigure label="p90 TTFT" value={formatMs(latency.p90TtftMs)} />
          <StatFigure label="Avg gen" value={formatMs(latency.avgGenMs)} />
          <StatFigure label="p50 gen" value={formatMs(latency.p50GenMs)} />
          <StatFigure label="p90 gen" value={formatMs(latency.p90GenMs)} />
        </Grid>
      </Section>
    </Stack>
  );
}
