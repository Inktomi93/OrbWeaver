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
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { selectCorpusCharacter } from "#state";
import { toGenreSeries } from "../lib/corpus-charts";
import { CorpusDistillEmptyState } from "./corpus-distill-empty-state";

const SKELETON_ROW_COUNT = 3;

export function CorpusMapTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the map" onRetry={retry} />}
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
        description="The semantic map projects your distilled, indexed cards. Distill your library, then come back."
      />
    );
  }

  // The point `id` round-trips a CharacterId through <Scatter>'s opaque string slot; it re-brands here at
  // the click boundary (the value came straight off `corpusProjection`, so the brand is genuine).
  const series = toGenreSeries(points.map((p) => ({ id: p.characterId, label: p.name, x: p.x, y: p.y, genre: p.genre })));

  return (
    <Stack gap="block" className="min-h-0 flex-1">
      <Text size="micro" tone="muted">
        {points.length} cards, projected by semantic similarity, colored by genre. Click a card to open its dossier.
      </Text>
      <Stack className="aspect-square w-full">
        <Scatter className="h-full w-full" label="Corpus semantic map" onPointClick={(id): void => selectCorpusCharacter(id as CharacterId)} series={series} />
      </Stack>
    </Stack>
  );
}
