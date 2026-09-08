// The Corpus CONTEXT "Map" tab — the semantic galaxy. `corpusProjection` gives each card's embedding
// projected to 2D (PCA); this renders them through @orb/ui's interactive <Scatter> primitive, grouped
// into genre series (colored by the chart ramp, so a custom theme retints). Clicking a point selects
// that character's dossier into CONTENT (`selectCorpusCharacter`) — the point-level drill the old
// inert inline-SVG scatter could NOT carry (an interactive role on a raw SVG is belt-blocked in
// features), which is the whole reason this tab moved onto the real primitive (north-star §6.4).

import type { CharacterId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Scatter } from "@orb/ui/scatter";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { selectCorpusCharacter } from "#state";
import { toGenreSeries } from "../lib/corpus-charts.ts";
import { facetLabel } from "../lib/corpus-vocabulary.ts";
import { CorpusDistillEmptyState } from "./corpus-distill-empty-state.tsx";

const SKELETON_ROW_COUNT = 3;

export function CorpusMapTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />}
      fill={true}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the map" onRetry={retry} />}
      reserveKey="corpus.map"
    >
      <MapBody />
    </QueryBoundary>
  );
}

function MapBody(): ReactElement {
  const trpc = useTRPC();
  const { data: points } = useSuspenseQuery(trpc.discovery.corpusProjection.queryOptions());

  if (points.length === 0) {
    return (
      <CorpusDistillEmptyState
        title="No map yet"
        // TRUTH-REPAIR (#164's rider from the #154 lane): the projection is a PCA over CARD EMBEDDINGS —
        // `corpusProjection` reads the index, not `character_summaries`. Distillation only colours the points
        // by genre; a fully indexed, undistilled library still has a map. Saying "distill your library, then
        // come back" sent a user to the wrong pass to fix an empty chart.
        description="The semantic map projects your indexed cards. Run the image and card index, then come back — distilling colours the points by genre."
      />
    );
  }

  // The point `id` round-trips a CharacterId through <Scatter>'s opaque string slot; it re-brands here at
  // the click boundary (the value came straight off `corpusProjection`, so the brand is genuine).
  // THE KEY SPEAKS THE READER'S VOCABULARY (side-eye corpus re-pass #3, P3-C). The key printed the
  // distiller's raw token — `slice-of-life 115` — while the other three consumers of a facet on this section
  // already route through `facetLabel`. It is a display projection at the render edge: the grouping key, and
  // everything stored, stay exactly the token they were.
  const series = toGenreSeries(points.map((p) => ({ id: p.characterId, label: p.name, x: p.x, y: p.y, genre: p.genre }))).map((s) => ({
    ...s,
    name: facetLabel(s.name),
  }));

  return (
    // THE PLOT TAKES THE PANEL (side-eye corpus re-pass #2, P3-9). The chart was `aspect-square`, so at the
    // CONTEXT pane's 420px width it drew a 420px box in a ~700px panel and left ~270px of dead space under
    // its legend — and `flex-1` could not close it, because the tab body it sits in is a block scroller, not
    // a flex column, so the rail's height never reached this Stack. `h-full` takes the panel's height (the
    // TabsPanel is a definite-height flex child of the Tabs column) and the plot flexes into what the gloss
    // and the key leave. A FIT fix, not a count gate: the square was never a requirement of the projection,
    // which is a PCA into an arbitrary 2D frame and reads the same at any aspect. The min-height keeps it a
    // chart rather than a strip if a host ever hands it no height at all.
    <Stack gap="block" className="h-full min-h-0 flex-1">
      <Text voice="gloss">{points.length} cards, projected by semantic similarity, colored by genre. Click a card to open its dossier.</Text>
      <Stack className="min-h-96 w-full flex-1">
        {/* THE KEY IS THE HALF THAT COULD BE READ (side-eye corpus re-pass B5). The tab said "colored by
            genre" and named no genre anywhere — eight-pixel dots in five hues with no decoder, over ~350px
            of empty panel. The meaning was carried by colour ALONE, which is both the accessibility failure
            and the reason the plot answered nothing. `legend` is @orb/ui's, not this file's: ui owns the
            palette (so the swatch matches the plot by construction) and ui is the only painter. */}
        <Scatter
          className="h-full w-full"
          // The plot's own box, not the primitive's 320px default (P3-9): the frame is a flex column at the
          // wrapper's height, so a percentage height lets the canvas take everything the key does not.
          height="100%"
          label="Corpus semantic map"
          legend={true}
          onPointClick={(id): void => selectCorpusCharacter(id as CharacterId)}
          series={series}
        />
      </Stack>
    </Stack>
  );
}
