// The Analytics list reads owner-scoped leaderboard rows with server name search and sort keys from
// LEADERBOARD_SORTS/ANALYTICS_SORT_OPTIONS. Selection drills stats into Content; this section has no
// create action.
//
// Search must reach beyond the page cap, not filter only loaded rows. analytics-search-store lets the band
// census and surface rows read the same narrowed query; the deferred key retains rows while the next
// request resolves (a deferred key under the boundary). VirtualList bounds DOM and emits list semantics, while useLeaderboardRoving gives row
// bodies one tab stop with Arrow/Home/End navigation.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { ChartColumn, Icon, Search } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { shownValue, Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { VirtualList } from "@orb/ui/virtual-list";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { LibraryRow, ListPage, QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import { CLEAR_SEARCH_NAME, ESTIMATED_ROW_PX, NO_MATCHES_TITLE, testId, useFocusListArrival } from "#lib";
import { selectAnalyticsCharacterFromList, setAnalyticsSearchQuery, useAnalyticsSearchQuery, useSelectedAnalyticsCharacterId } from "#state";
import { ANALYTICS_NO_ACTIVITY_TEXT } from "../lib/analytics-copy.ts";
import { ANALYTICS_SEARCH_NAME, analyticsSortName } from "../lib/analytics-names.ts";
import {
  ANALYTICS_DEFAULT_SORT,
  ANALYTICS_SORT_OPTIONS,
  disambiguatedNames,
  formatCompactNoun,
  formatDurationMs,
  formatTokens,
} from "../lib/analytics-view-model.ts";
import { LEADERBOARD_ROW_ATTR } from "../lib/leaderboard-row-attr.ts";
import { useLeaderboardRoving } from "../lib/use-leaderboard-roving.ts";

// The sort-id union derived from the shared vocabulary (a local, non-exported alias — §7.4
// homes EXPORTED types in a contract home; this list-only union has no cross-boundary consumer).
type SortId = (typeof ANALYTICS_SORT_OPTIONS)[number]["id"];

// The leaderboard page + row shapes, inferred off the verb's own output (local aliases — the page is
// contract-owned; this only names the inferred shape for the body's props).
type LeaderboardPage = inferOutput<Trpc["stats"]["leaderboard"]>;
type LeaderboardPageRow = LeaderboardPage["rows"][number];

const SKELETON_ROW_COUNT = 6;

export function AnalyticsListSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusListArrival(surfaceRef);
  const [sort, setSort] = useState<SortId>(ANALYTICS_DEFAULT_SORT);
  const search = useAnalyticsSearchQuery();

  return (
    <ListPage
      body="bounded"
      data-testid={testId("analyticsListSurface")}
      filters={
        <ToggleGroup
          aria-label="Sort characters"
          fill={true}
          data-testid={testId("analyticsLeaderboardSort")}
          value={[sort]}
          onValueChange={(picked): void => setSort((picked[0] ?? ANALYTICS_DEFAULT_SORT) as SortId)}
        >
          {ANALYTICS_SORT_OPTIONS.map((option) => (
            <Toggle key={option.id} value={option.id} aria-label={analyticsSortName(option.label)}>
              {option.label}
            </Toggle>
          ))}
        </ToggleGroup>
      }
      ref={surfaceRef}
      // The search is the reach past the page cap; the sort orders the page that comes back.
      search={<Input aria-label={ANALYTICS_SEARCH_NAME} onValueChange={setAnalyticsSearchQuery} placeholder={ANALYTICS_SEARCH_NAME} value={search} />}
      skipTo="Skip to characters"
    >
      <LeaderboardRows sort={sort} search={search} />
    </ListPage>
  );
}

function LeaderboardRows({ sort, search }: { readonly sort: SortId; readonly search: string }): ReactElement {
  // The roving container is the ALWAYS-MOUNTED wrapper below, not the rows arm: the rows appear on a later
  // commit (the query resolves after the skeleton), and a ref attached only to that arm is null when the
  // hook's mount effect runs. The wrapper is stable, so its `childList`/`tabindex` observer catches the
  // windowed rows the moment `VirtualList` mounts them.
  const rowsRef = useRef<HTMLDivElement>(null);
  useLeaderboardRoving(rowsRef);
  // A search keystroke re-keys the page. The deferred key keeps the prior rows on screen while the next page
  // loads, so only the first load shows the boundary's skeleton; the boundary keys on the same deferred values.
  const trimmed = useDeferredValue(search.trim());
  const deferredSort = useDeferredValue(sort);
  // The bounded height is this wrapper's — `VirtualList` throws at mount on an unbounded scroll element — and
  // it is also the roving container (the Arrow-key contract over the windowed row bodies).
  return (
    <Stack ref={rowsRef} minHeight="shrinks" grow={true}>
      <QueryBoundary
        resetKeys={[deferredSort, trimmed]}
        fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the leaderboard" onRetry={retry} />}
      >
        <LeaderboardPageRows sort={deferredSort} trimmed={trimmed} />
      </QueryBoundary>
    </Stack>
  );
}

function LeaderboardPageRows({ sort, trimmed }: { readonly sort: SortId; readonly trimmed: string }): ReactElement {
  const trpc = useTRPC();
  const selectedId = useSelectedAnalyticsCharacterId();
  const { data: page } = useSuspenseQuery(trpc.stats.leaderboard.queryOptions({ sort, ...(trimmed === "" ? {} : { search: trimmed }) }));
  return <LeaderboardBody page={page} selectedId={selectedId} trimmed={trimmed} />;
}

function LeaderboardBody({
  page,
  selectedId,
  trimmed,
}: {
  readonly page: { readonly rows: readonly LeaderboardPageRow[]; readonly total: number };
  readonly selectedId: CharacterId | null;
  readonly trimmed: string;
}): ReactElement {
  if (page.rows.length === 0) {
    return trimmed === "" ? (
      // No action: activity rolls up from chatting, and this read-only pane has no verb that makes any.
      <EmptyState action={null} icon={<Icon icon={ChartColumn} size="lg" />} title={ANALYTICS_NO_ACTIVITY_TEXT} />
    ) : (
      <EmptyState
        action={
          <Button variant="outline" size="sm" onClick={(): void => setAnalyticsSearchQuery("")}>
            {CLEAR_SEARCH_NAME}
          </Button>
        }
        description={`No character matches "${trimmed}".`}
        icon={<Icon icon={Search} size="lg" />}
        title={NO_MATCHES_TITLE}
      />
    );
  }

  // Two characters can share a name; the row, its accessible name and the crown callout were then
  // identical. The map is computed over the WHOLE page so a ref appears on both twins, never just one.
  const names = disambiguatedNames(page.rows);

  return (
    <VirtualList
      aria-label="Character leaderboard"
      height="fill"
      estimateSize={(): number => ESTIMATED_ROW_PX.ranked}
      fadeEdge={true}
      gapToken="row"
      getItemKey={(row): string => row.characterId}
      items={page.rows}
      renderItem={(row, index): ReactElement => (
        // The wrapper names the row's character, so Back from its drill can hand focus back to it.
        <Stack {...{ [LEADERBOARD_ROW_ATTR]: row.characterId }}>
          <LibraryRow
            data-testid={testId("analyticsLeaderboardRow")}
            leading={
              // A fixed track, so a two-digit rank leaves the names where a one-digit rank put them.
              <Text voice="datum" ink="muted" width="control" textAlign="center">
                {index + 1}
              </Text>
            }
            onSelect={(): void => selectAnalyticsCharacterFromList(row.characterId)}
            selected={selectedId === row.characterId}
            subtitle={`${formatCompactNoun(row.assistantTurns, "reply", "replies")} · ${formatDurationMs(row.totalGenTimeMs)}`}
            subtitleStep="label"
            title={names[row.characterId] ?? row.name}
            trailing={
              <Text voice="datumMono" whitespace="nowrap">
                {shownValue(formatTokens(row.tokensOut, row.tokensOutProvenance))}
              </Text>
            }
          />
        </Stack>
      )}
    />
  );
}
