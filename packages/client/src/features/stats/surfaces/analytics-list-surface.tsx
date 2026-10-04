// The Analytics list reads owner-scoped leaderboard rows with server name search and sort keys from
// LEADERBOARD_SORTS/ANALYTICS_SORT_OPTIONS. Selection drills stats into Content; this section has no
// create action.
//
// Search must reach beyond the page cap, not filter only loaded rows. analytics-search-store lets the band
// census and surface rows read the same narrowed query; keepPreviousData retains rows while the next
// request resolves. VirtualList bounds DOM and emits list semantics, while useLeaderboardRoving gives row
// bodies one tab stop with Arrow/Home/End navigation.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { VirtualList } from "@orb/ui/virtual-list";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { ListSearch } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { selectAnalyticsCharacterFromList, setAnalyticsSearchQuery, useAnalyticsSearchQuery, useSelectedAnalyticsCharacterId } from "#state";
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

// The sort-id union derived from the shared vocabulary (a local, non-exported alias — no-inline-types
// gates EXPORTED types outside a contract home; this list-only union has no cross-boundary consumer).
type SortId = (typeof ANALYTICS_SORT_OPTIONS)[number]["id"];

// The leaderboard page + row shapes, inferred off the verb's own output (local aliases — the page is
// contract-owned; this only names the inferred shape for the body's props).
type LeaderboardPage = inferOutput<Trpc["stats"]["leaderboard"]>;
type LeaderboardPageRow = LeaderboardPage["rows"][number];

const SKELETON_ROW_COUNT = 6;
/** The row's first-paint height guess (rank + title + subtitle + trailing tokens); rows re-measure after mount. */
const ESTIMATED_ROW_PX = 64;

export function AnalyticsListSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const [sort, setSort] = useState<SortId>(ANALYTICS_DEFAULT_SORT);
  const search = useAnalyticsSearchQuery();

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" data-testid={testId("analyticsListSurface")} gap="block">
      {/* §14 LIST anatomy: search → sort → rows. The search is the reach past the page cap; the sort orders
          the page that comes back. */}
      <ListSearch>
        <Input aria-label="Search characters" onValueChange={setAnalyticsSearchQuery} placeholder="Search characters" value={search} />
      </ListSearch>
      <ToggleGroup
        aria-label="Sort characters"
        className="grid w-full grid-cols-2"
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
      <LeaderboardRows sort={sort} search={search} />
    </Stack>
  );
}

function LeaderboardRows({ sort, search }: { readonly sort: SortId; readonly search: string }): ReactElement {
  const trpc = useTRPC();
  const selectedId = useSelectedAnalyticsCharacterId();
  // The roving container is the ALWAYS-MOUNTED wrapper below, not the rows arm: the rows appear on a later
  // commit (the query resolves after the skeleton), and a ref attached only to that arm is null when the
  // hook's mount effect runs. The wrapper is stable, so its `childList`/`tabindex` observer catches the
  // windowed rows the moment `VirtualList` mounts them.
  const rowsRef = useRef<HTMLDivElement>(null);
  useLeaderboardRoving(rowsRef);
  // `useQuery` + `keepPreviousData` (not `useSuspenseQuery`): a search keystroke re-keys the page, and
  // suspending would blank the list to a skeleton on every character typed. The empty/error arms are handled
  // inline for the same reason — a boundary cannot keep the prior rows visible.
  const trimmed = search.trim();
  const {
    data: page,
    isPending,
    isError,
    refetch,
  } = useQuery(trpc.stats.leaderboard.queryOptions({ sort, ...(trimmed === "" ? {} : { search: trimmed }) }, { placeholderData: keepPreviousData }));

  // The bounded height is this wrapper's — `VirtualList` throws at mount on an unbounded scroll element — and
  // it is also the roving container (the Arrow-key contract over the windowed row bodies).
  return (
    <Stack ref={rowsRef} className="min-h-0 flex-1">
      <LeaderboardBody isError={isError} isPending={isPending} onRetry={(): void => void refetch()} page={page} selectedId={selectedId} trimmed={trimmed} />
    </Stack>
  );
}

function LeaderboardBody({
  isPending,
  isError,
  onRetry,
  page,
  selectedId,
  trimmed,
}: {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly page: { readonly rows: readonly LeaderboardPageRow[]; readonly total: number } | undefined;
  readonly selectedId: CharacterId | null;
  readonly trimmed: string;
}): ReactElement {
  // The error arm MUST win before the undefined-page skeleton: on a first-load failure the query settles
  // with `isError` true AND `page` still undefined, so a `page === undefined` skeleton check first would
  // pin a PERMANENT skeleton and the retry affordance would be unreachable. `keepPreviousData` keeps prior
  // rows (a defined page) across a keystroke, so this only blanks to the error surface when there is
  // genuinely nothing to keep showing.
  if (isError) {
    return <QueryErrorState label="the leaderboard" onRetry={onRetry} />;
  }
  if (isPending || page === undefined) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (page.rows.length === 0) {
    return trimmed === "" ? (
      <Text voice="gloss">No characters have any rolled-up activity yet.</Text>
    ) : (
      <Stack gap="field" align="start">
        <Text voice="gloss">{`No character matches "${trimmed}".`}</Text>
        <Button intent="secondary" size="sm" onClick={(): void => setAnalyticsSearchQuery("")}>
          Clear search
        </Button>
      </Stack>
    );
  }

  // Two characters can share a name; the row, its accessible name and the crown callout were then
  // identical. The map is computed over the WHOLE page so a ref appears on both twins, never just one.
  const names = disambiguatedNames(page.rows);

  return (
    <VirtualList
      aria-label="Character leaderboard"
      className="h-full"
      estimateSize={(): number => ESTIMATED_ROW_PX}
      fadeEdge={true}
      gapToken="row"
      getItemKey={(row): string => row.characterId}
      items={page.rows}
      renderItem={(row, index): ReactElement => (
        // The wrapper names the row's character, so Back from its drill can hand focus back to it.
        <Stack {...{ [LEADERBOARD_ROW_ATTR]: row.characterId }}>
          <ListRow
            data-testid={testId("analyticsLeaderboardRow")}
            clickable={true}
            selected={selectedId === row.characterId}
            onClick={(): void => selectAnalyticsCharacterFromList(row.characterId)}
            leading={
              <Text voice="gloss" className="font-mono tabular-nums">
                {index + 1}
              </Text>
            }
            title={names[row.characterId] ?? row.name}
            subtitle={`${formatCompactNoun(row.assistantTurns, "reply", "replies")} · ${formatDurationMs(row.totalGenTimeMs)}`}
            actions={
              <Text voice="gloss" className="whitespace-nowrap font-mono">
                {formatTokens(row.tokensOut, row.tokensOutProvenance)}
              </Text>
            }
          />
        </Stack>
      )}
    />
  );
}
