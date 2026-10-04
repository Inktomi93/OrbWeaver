// Corpus-home-insights owns the Never played and Model economics block presentation, not the surface's
// queries. It receives read state so stories can exercise the block without a data layer; the composition
// retains its four reads and derived masthead/focal/rail.
//
// Both blocks report a ranked, bounded quantity with its denominator rather than implying the visible
// window is the whole library. Model economics does not gate on spend: local/estimated routes may carry
// generations and tokens with absent dollar cost. Sparse cost is an annotation where recorded, never a
// fabricated zero or a gate hiding populated quantities.

import { modelDisplayName } from "@orb/kit/model-name";
import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows } from "#data";
import { selectCorpusArtifact, selectCorpusCharacter } from "#state";
import { formatCount } from "../lib/corpus-analysis-state.ts";
import { chartLabelWithDenominator, toBarItems, topRanked } from "../lib/corpus-charts.ts";
import { CharacterAvatar } from "./character-avatar.tsx";

type UnusedCharacter = inferOutput<Trpc["discovery"]["unusedCharacters"]>[number];
type ModelRoute = inferOutput<Trpc["discovery"]["modelRouting"]>[number];

const MONEY_PRECISION = 2;
const ROW_ESTIMATE_PX = 52;
/** How many never-played rows the page shows before "Show all". */
const NEVER_PLAYED_HEAD = 8;
/** The placeholder row count for a deferred below-fold section — the sibling charts' own number. */
const SKELETON_ROWS = 3;
/** How many routes the chart draws. A route list is a LONG TAIL (142 rows = 4,544px of canvas, which is
 *  the 4,304px block a previous pass deleted); the head is the reading and the denominator carries the
 *  rest. Matched to the keyword cap so the two below-fold charts are one visual weight. */
const ROUTE_BAR_CAP = 12;

function money(value: number): string {
  return `$${value.toFixed(MONEY_PRECISION)}`;
}

/** Never-played characters — a deferred read, so it owns a skeleton, an error, and an absence. */
export function CorpusNeverPlayedSection({
  characters,
  libraryCharacters,
  pending,
  failed,
  onRetry,
}: {
  readonly characters: readonly UnusedCharacter[] | undefined;
  /** The owned-character total this count is OUT OF — the base [P2-4] found missing. */
  readonly libraryCharacters: number;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
}): ReactElement | null {
  if (pending) {
    // A BELOW-FOLD PENDING SECTION KEEPS ITS PLACE (side-eye 2026-08-21). `null`-while-pending is the
    // sibling charts' old defect: the settled section pops in under whatever the reader is looking at.
    return <SkeletonRows count={SKELETON_ROWS} shape="line" />;
  }
  if (failed) {
    return <QueryErrorState label="your never-played characters" onRetry={onRetry} />;
  }
  if (characters === undefined || characters.length === 0) {
    // The rail says what has not run; a section with nothing renders nothing (the surface's header).
    return null;
  }
  return <NeverPlayedList characters={characters} libraryCharacters={libraryCharacters} />;
}

/** The list FLOWS in the page scroll: a short head of rows, then "Show all" for the rest, never a scroller of
 *  its own cut at some row with dead space below. */
function NeverPlayedList({
  characters,
  libraryCharacters,
}: {
  readonly characters: readonly UnusedCharacter[];
  readonly libraryCharacters: number;
}): ReactElement {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? characters : characters.slice(0, NEVER_PLAYED_HEAD);
  return (
    <Section kicker="Never played" level={2}>
      {/* THE COUNT, AND THE ORDER (side-eye populated arm, [P2-4]). A capped list with no total reads as a
          complete one. The ordering is stated for the same reason the gem shelf states its rank: this list
          is alphabetical by name (`domain/discovery/verbs/insights.ts`), which without a caption is
          indistinguishable from a top-8 of something. Both facts in one line, bounded by the reading measure
          so it cannot become the 145-chars/line finding it sits beside. */}
      <Text className="max-w-(--reading-measure-prose)" voice="gloss">
        {`${formatCount(characters.length)} of ${formatCount(libraryCharacters)} characters have never been played — collected and never opened. Listed A–Z.`}
      </Text>
      <Stack aria-label="Never played characters" gap="row" role="list">
        {shown.map((character) => (
          <Stack key={character.characterId} role="listitem">
            <ListRow
              clickable={true}
              leading={<CharacterAvatar hash={character.avatarHash} id={character.characterId} name={character.name} />}
              onClick={(): void => selectCorpusCharacter(character.characterId)}
              subtitle="Collected but never played"
              title={character.name}
            />
          </Stack>
        ))}
      </Stack>
      {showAll || characters.length <= NEVER_PLAYED_HEAD ? null : (
        <Button className="self-start" intent="ghost" onClick={(): void => setShowAll(true)} size="sm">
          {`Show all ${formatCount(characters.length)}`}
        </Button>
      )}
    </Section>
  );
}

/**
 * The section's summary sentence: what the library actually did, and how far the cost column reaches.
 * Separated from the component because it is the [P1-1] claim in one place — a coverage statement that
 * drifts from the series beside it is the defect wearing a caption.
 *
 * THE COST CLAUSE NAMES WHAT IT IS ABOUT, OR IT IS NOT SAID (side-eye se-verify-4 N6). It read "cost
 * recorded for 1 of 142 routes" — true, and a dead end: the chart draws the twelve BUSIEST routes, the one
 * priced route is nowhere near that head on a local-model library, so the sentence pointed at a row the
 * surface never shows and no control on the page could reach. Two arms, and both are taken where they
 * apply. When nothing is priced the clause is DROPPED (a coverage statement about an empty column is a
 * sentence about nothing). When something is priced the clause carries the money — the total, and the
 * route's own name while there is exactly one — so the reader meets the datum the clause is about instead
 * of a promise that it exists somewhere.
 */
function economicsSummary(routes: readonly ModelRoute[]): string {
  const generations = routes.reduce((total, route) => total + route.generations, 0);
  const tokens = routes.reduce((total, route) => total + (route.tokensOut ?? 0), 0);
  const models = new Set(routes.map((route) => route.model)).size;
  const estimated = routes.some((route) => route.tokensOutProvenance === "estimated");
  const counted = routes.filter((route) => route.tokensOut !== null).length;
  return [
    `${formatCount(generations)} generations across ${formatCount(models)} models`,
    counted === 0
      ? "returned tokens not recorded"
      : `${estimated ? "~" : ""}${formatCount(tokens)} tokens returned; accounting available for ${formatCount(counted)} of ${formatCount(routes.length)} routes`,
    ...costClause(routes),
  ].join(" · ");
}

/** The cost coverage clause, or nothing at all — see {@link economicsSummary} for why "1 of 142" alone was
 *  a dead end. Returned as a 0-or-1 array so the caller's `join` has no empty segment to leave behind. */
function costClause(routes: readonly ModelRoute[]): string[] {
  const priced = routes.filter((route) => route.costUsd !== null);
  if (priced.length === 0) {
    return [];
  }
  const total = priced.reduce((sum, route) => sum + (route.costUsd ?? 0), 0);
  const reach = `${money(total)} reported across ${formatCount(priced.length)} of ${formatCount(routes.length)} routes`;
  const only = priced[0];
  return priced.length === 1 && only !== undefined ? [`${reach} (${only.genre} → ${modelDisplayName(only.model)})`] : [reach];
}

/** A route's bar label: the route, with its dollar cost ANNOTATED when the accounting has one. The cost is
 *  the rider on a bar measured in generations — never the bar itself, which is the whole of [P1-1]. */
function routeLabel(route: ModelRoute): string {
  const name = `${route.genre} → ${modelDisplayName(route.model)}`;
  return route.costUsd === null || route.costUsd <= 0 ? name : `${name} · ${money(route.costUsd)}`;
}

/**
 * Model economics — the library's ROUTING, measured by the quantity every route carries.
 *
 * The guard is now "are there routes", not "did any of them cost money": a local-model instance records a
 * route per (genre × model) with a complete generation count and a null price, and gating on the price
 * threw away the whole section's content to protect against a column of zeros that no longer exists (the
 * bars are generations; the dollars are a label on the routes that have them).
 */
export function CorpusModelEconomicsSection({
  routes,
  pending,
  failed,
  onRetry,
}: {
  readonly routes: readonly ModelRoute[] | undefined;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
}): ReactElement | null {
  if (pending) {
    return <SkeletonRows count={SKELETON_ROWS} shape="line" />;
  }
  if (failed) {
    return <QueryErrorState label="your model economics" onRetry={onRetry} />;
  }
  if (routes === undefined || routes.length === 0) {
    return null;
  }
  // The server orders by genre then generations, which is a BROWSING order and not this chart's rank —
  // `toBarItems` treats array order as the rank and does not sort, so the head is taken here.
  const busiest = topRanked(routes, (route) => route.generations, ROUTE_BAR_CAP);
  return (
    <Section kicker="Model economics" level={2}>
      <Stack gap="block">
        <Text className="max-w-(--reading-measure-prose)" voice="gloss">
          {economicsSummary(routes)}
        </Text>
        <Text className="max-w-(--reading-measure-prose)" voice="gloss">
          Aggregate routing for characters with a distilled genre. Token estimates remain approximate; accounting coverage counts routes, not individual
          generations. Cost classifications are not retained in this aggregate.
        </Text>
        <BarList
          // `quiet`, not the default accent: this is reference data at the foot of a surface whose accent
          // budget belongs to its focal island and its one door (§14 physics 4; the 28.69%-in-one-viewport
          // census is what a full-height accent bar list costs).
          intent="quiet"
          items={toBarItems(busiest.rows, routeLabel, (route) => route.generations)}
          label={chartLabelWithDenominator("Busiest routes", busiest.rows.length, busiest.total, "routes")}
          valueFormatter={formatCount}
        />
        <VirtualList
          aria-label="Model routes"
          className="max-h-96"
          estimateSize={(): number => ROW_ESTIMATE_PX}
          getItemKey={(route): string => `${route.genre}|${route.model}|${route.provider ?? ""}`}
          items={routes}
          renderItem={(route): ReactElement => (
            <ListRow
              clickable={true}
              title={routeLabel(route)}
              subtitle={`${route.generations} generations`}
              onClick={(): void => selectCorpusArtifact({ kind: "modelroute", route })}
            />
          )}
        />
      </Stack>
    </Section>
  );
}
