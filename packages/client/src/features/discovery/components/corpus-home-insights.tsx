// THE CORPUS OVERVIEW'S TWO BELOW-FOLD INVENTORY BLOCKS — "Never played" and "Model economics".
//
// WHY THEY LEFT THE SURFACE (the `component-size` cap, 2026-08-23). They were inline arms of
// `corpus-home-surface.tsx`, which is the overview's COMPOSITION: four suspended reads, the derived
// analysis state, the masthead, the focal/rail grid. Both blocks then grew the honesty each of them owed
// — a denominator, a coverage sentence, a ranked-and-capped series — and the composition file is not where
// a section's own copy belongs. Same seam `corpus-home-charts.tsx` was cut on: the surface keeps the
// queries, these keep what a block LOOKS like, and each takes the READ'S STATE rather than a query object
// so a story can drive it with no data layer.
//
// ── WHAT WAS WRONG WITH BOTH, AND IT WAS ONE THING (side-eye populated arm 2026-08-23) ────────────────
// Each block reported a fraction of what it knew and named no denominator, so on the audited 327-character
// library both were read as statements about the whole library and both were false:
//   • NEVER PLAYED rendered eight names — the window of a virtualized list of 204 — under a bare heading
//     with no count and no ordering. 204 of 327 characters never played is 62% of the library and the most
//     actionable fact the overview holds; the surface presented it as eight names ([P2-4]).
//   • MODEL ECONOMICS guarded on SPEND, which is right on the guard's own terms and catastrophic on its
//     data: 141 of 142 routes carry `costUsd: null` (a local model has no dollar cost, and OpenRouter rows
//     arrive estimated), while `generations` and `tokensOut` are populated on ALL of them. So a library
//     with 11,321 generations and 7.96M returned tokens rendered as one bar reading $0.08, drawn at full
//     width in accent orange — the heaviest visual weight on the page spent on its smallest number, and a
//     reader's honest conclusion is either "my 896-chat library cost eight cents" or "this is broken"
//     ([P1-1]).
// The fix in both places is the same shape: rank and render the quantity the data ACTUALLY carries, state
// the denominator, and keep the sparse metric as an ANNOTATION where it exists rather than as the gate.

import { modelDisplayName } from "@orb/kit/model-name";
import { BarList } from "@orb/ui/bar-list";
import { Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows } from "#data";
import { selectCorpusCharacter } from "#state";
import { formatCount } from "../lib/corpus-analysis-state.ts";
import { chartLabelWithDenominator, toBarItems, topRanked } from "../lib/corpus-charts.ts";
import { CharacterAvatar } from "./character-avatar.tsx";

type UnusedCharacter = inferOutput<Trpc["discovery"]["unusedCharacters"]>[number];
type ModelRoute = inferOutput<Trpc["discovery"]["modelRouting"]>[number];

const MONEY_PRECISION = 2;
const ROW_ESTIMATE_PX = 52;
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
  return (
    <Section kicker="Never played" level={2}>
      {/* THE COUNT, AND THE ORDER (side-eye populated arm, [P2-4]). The list is virtualized, so what a
          reader SEES is a window — eight rows of 204 — and a windowed list with no total reads as a
          complete one. The ordering is stated for the same reason the gem shelf states its rank: this list
          is alphabetical by name (`domain/discovery/verbs/insights.ts`, `orderBy(asc(characters.name))`),
          which without a caption is indistinguishable from a top-8 of something. Both facts in one line,
          bounded by the reading measure so it cannot become the 145-chars/line finding it sits beside. */}
      <Text className="max-w-(--reading-measure)" voice="gloss">
        {`${formatCount(characters.length)} of ${formatCount(libraryCharacters)} characters have never been played — collected and never opened. Listed A–Z; scroll for the rest.`}
      </Text>
      <VirtualList
        aria-label="Never played characters"
        className="max-h-96"
        estimateSize={(): number => ROW_ESTIMATE_PX}
        fadeEdge={true}
        gapToken="row"
        getItemKey={(character): string => character.characterId}
        items={characters}
        renderItem={(character): ReactElement => (
          <ListRow
            clickable={true}
            leading={<CharacterAvatar hash={character.avatarHash} id={character.characterId} name={character.name} />}
            onClick={(): void => selectCorpusCharacter(character.characterId)}
            subtitle="Collected but never played"
            title={character.name}
          />
        )}
      />
    </Section>
  );
}

/** The section's summary sentence: what the library actually did, and how far the cost column reaches.
 *  Separated from the component because it is the [P1-1] claim in one place — a coverage statement that
 *  drifts from the series beside it is the defect wearing a caption. */
function economicsSummary(routes: readonly ModelRoute[]): string {
  const generations = routes.reduce((total, route) => total + route.generations, 0);
  const tokens = routes.reduce((total, route) => total + (route.tokensOut ?? 0), 0);
  const models = new Set(routes.map((route) => route.model)).size;
  const priced = routes.filter((route) => route.costUsd !== null && route.costUsd > 0).length;
  const estimated = routes.some((route) => route.tokensOutProvenance === "estimated");
  return [
    `${formatCount(generations)} generations across ${formatCount(models)} models`,
    `${estimated ? "~" : ""}${formatCount(tokens)} tokens returned`,
    // THE SPARSE METRIC STATES ITS REACH INSTEAD OF GATING THE SECTION. "Cost recorded for 1 of 142
    // routes" is a fact about the accounting; "$0.08" alone was a claim about the library.
    `cost recorded for ${formatCount(priced)} of ${formatCount(routes.length)} routes`,
  ].join(" · ");
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
        <Text className="max-w-(--reading-measure)" voice="gloss">
          {economicsSummary(routes)}
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
      </Stack>
    </Section>
  );
}
