// The Analytics LIST navigator — the character leaderboard. Reads `leaderboard` (owner-scoped ranked
// rows) under a sort toggle whose keys mirror the server's `LEADERBOARD_SORTS` wire enum (the shared
// `ANALYTICS_SORT_OPTIONS` vocabulary in analytics-view-model). Selecting a row drills that character's
// stats into CONTENT (`selectAnalyticsCharacter`); the drilled row reads selected. Per A2 there is no
// create action in this section — the "Analytics" title + count live in the `.shell-panel-header` band
// (`analytics-list-header.tsx`, N1/N2), and the sort toggle is the finder affordance.

import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { selectAnalyticsCharacter, useSelectedAnalyticsCharacterId } from "#state";
import { ANALYTICS_DEFAULT_SORT, ANALYTICS_SORT_OPTIONS, formatCompact, formatDurationMs } from "../lib/analytics-view-model.ts";

// The sort-id union derived from the shared vocabulary (a local, non-exported alias — no-inline-types
// gates EXPORTED types outside a contract home; this list-only union has no cross-boundary consumer).
type SortId = (typeof ANALYTICS_SORT_OPTIONS)[number]["id"];

const SKELETON_ROW_COUNT = 6;

export function AnalyticsListSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const [sort, setSort] = useState<SortId>(ANALYTICS_DEFAULT_SORT);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" data-testid={testId("analyticsListSurface")} gap="block">
      <ToggleGroup
        aria-label="Sort characters"
        data-testid={testId("analyticsLeaderboardSort")}
        value={[sort]}
        onValueChange={(picked): void => setSort((picked[0] ?? ANALYTICS_DEFAULT_SORT) as SortId)}
      >
        {ANALYTICS_SORT_OPTIONS.map((option) => (
          <Toggle key={option.id} value={option.id} aria-label={`Sort by ${option.label}`}>
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
      <Stack className="min-h-0 flex-1">
        <QueryBoundary
          fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="the leaderboard" onRetry={retry} />}
        >
          <LeaderboardRows sort={sort} />
        </QueryBoundary>
      </Stack>
    </Stack>
  );
}

function LeaderboardRows({ sort }: { readonly sort: SortId }): ReactElement {
  const trpc = useTRPC();
  const selectedId = useSelectedAnalyticsCharacterId();
  const { data: rows } = useSuspenseQuery(trpc.stats.leaderboard.queryOptions({ sort }));

  if (rows.length === 0) {
    return <Text voice="gloss">No characters have any rolled-up activity yet.</Text>;
  }

  return (
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="row" role="list">
      {rows.map((row, index) => (
        <ListRow
          key={row.characterId}
          data-testid={testId("analyticsLeaderboardRow")}
          clickable={true}
          selected={selectedId === row.characterId}
          onClick={(): void => selectAnalyticsCharacter(row.characterId)}
          leading={
            <Text voice="gloss" className="font-mono tabular-nums">
              {index + 1}
            </Text>
          }
          title={row.name}
          subtitle={`${formatCompact(row.assistantTurns)} replies · ${formatDurationMs(row.totalGenTimeMs)}`}
          actions={
            <Text voice="gloss" className="whitespace-nowrap font-mono">
              {formatCompact(row.tokensOut)} tok
            </Text>
          }
        />
      ))}
    </Stack>
  );
}
