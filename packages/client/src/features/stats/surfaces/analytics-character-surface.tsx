// The Analytics CONTENT drill (a character selected in the leaderboard) — one character's turn
// economics. Reads `character` (the single-character rollup: turns, words, tokens, cost, gen figures)
// and `latency` scoped to that character (on-read TTFT/gen percentiles the rollup can't store). Its
// ONE affordance is Back to the dashboard; there is no primary action (Analytics is read-only).

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { ArrowLeft, ChartColumn, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId, timeLib, useFocusOnMount } from "#lib";
import { formatCompact, formatMs, formatPercent } from "../lib/analytics-view-model.ts";

export interface AnalyticsCharacterSurfaceProps {
  readonly characterId: CharacterId;
  readonly onBack: () => void;
}

export function AnalyticsCharacterSurface({ characterId, onBack }: AnalyticsCharacterSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" data-testid={testId("analyticsCharacterSurface")}>
      <QueryBoundary
        fallback={<Text voice="gloss">Loading character stats…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="these stats" onRetry={retry} />}
      >
        <CharacterBody characterId={characterId} onBack={onBack} />
      </QueryBoundary>
    </Stack>
  );
}

function CharacterBody({ characterId, onBack }: { readonly characterId: CharacterId; readonly onBack: () => void }): ReactElement {
  const trpc = useTRPC();
  const { data: stats } = useSuspenseQuery(trpc.stats.character.queryOptions({ characterId }));
  const { data: latency } = useSuspenseQuery(trpc.stats.latency.queryOptions({ kind: "character", characterId }));
  // Non-suspending name read — only used to NAME the empty state (P4); the figures below already carry
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
    <Stack className="h-full min-h-0 overflow-y-auto overscroll-contain" gap="section">
      <Button intent="ghost" size="sm" onClick={onBack} className="self-start">
        <Icon icon={ArrowLeft} size="sm" />
        Back
      </Button>

      <Stack gap="field">
        <Text className="text-title leading-title font-semibold">{stats.name}</Text>
        {stats.lastActivityAt === null ? null : <Text voice="gloss">Last active {timeLib.formatRelative(stats.lastActivityAt)}</Text>}
      </Stack>

      <Section heading="Activity">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Chats" value={formatCompact(stats.chats)} />
          <StatFigure label="Replies" value={formatCompact(stats.assistantTurns)} />
          <StatFigure label="Your turns" value={formatCompact(stats.userTurns)} />
          <StatFigure label="Swipes" value={formatCompact(stats.swipes)} />
          <StatFigure label="Words" value={formatCompact(stats.assistantWords)} />
          <StatFigure label="Forked chats" value={formatCompact(stats.forkedChats)} />
        </Row>
      </Section>

      <Section heading="Economics">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Tokens in" value={formatCompact(stats.tokensIn)} />
          <StatFigure label="Tokens out" value={formatCompact(stats.tokensOut)} />
          <StatFigure label="Spend" value={`$${stats.costUsd.toFixed(2)}`} />
          <StatFigure label="Cache hits" value={formatPercent(stats.cacheHitRate)} />
          <StatFigure label="Reasoning" value={formatPercent(stats.reasoningRate)} />
          <StatFigure label="Throughput" value={`${stats.throughputTps.toFixed(1)} t/s`} />
        </Row>
      </Section>

      <Section heading="Latency">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Avg TTFT" value={formatMs(latency.avgTtftMs)} />
          <StatFigure label="p50 TTFT" value={formatMs(latency.p50TtftMs)} />
          <StatFigure label="p90 TTFT" value={formatMs(latency.p90TtftMs)} />
          <StatFigure label="Avg gen" value={formatMs(latency.avgGenMs)} />
          <StatFigure label="p50 gen" value={formatMs(latency.p50GenMs)} />
          <StatFigure label="p90 gen" value={formatMs(latency.p90GenMs)} />
        </Row>
      </Section>
    </Stack>
  );
}
