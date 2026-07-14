// The Corpus CONTEXT "Map" tab — the semantic galaxy. `corpusProjection` gives each card's embedding
// projected to 2D (PCA); this renders them as a plain inline-SVG scatter (@orb/ui ships no scatter
// primitive; a token-colored inline svg is the sanctioned data-viz path — north-star §3). Points are
// normalized into the viewBox and colored by GENRE via the SVG `fill` attribute set to a `var(--color-*)`
// token ref (the one belt-clean coloring channel — a feature may not className/style raw SVG). A legend
// names each genre color. Read-only: point-level click-to-dossier is belt-blocked (an interactive widget
// role on a raw SVG element is forbidden in features), so navigation stays with the LIST browse rows.

import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import type { GenrePalette } from "../lib/corpus-charts";
import { assignGenreColors } from "../lib/corpus-charts";
import { CorpusDistillEmptyState } from "./corpus-distill-empty-state";

const VIEW = 100;
const PAD = 6;
const DOT_R = 1.6;
const DOT_OPACITY = 0.7;
const HALF = 2;
const LEGEND_DOT = 10;
const LEGEND_DOT_R = 4;
const SKELETON_ROW_COUNT = 3;

interface Point {
  readonly name: string;
  readonly genre: string | null;
  readonly x: number;
  readonly y: number;
}

export function CorpusMapTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />}
      renderError={(_error, retry): ReactElement => (
        <QueryErrorState label="the map" onRetry={retry} />
      )}
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

  const palette = assignGenreColors(points.map((p) => p.genre));
  const placed = normalize(points);

  return (
    <Stack gap="block" className="min-h-0 flex-1">
      <Text size="micro" tone="muted">
        {points.length} cards, projected by semantic similarity, colored by genre.
      </Text>
      <Stack className="aspect-square w-full">
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          width="100%"
          height="100%"
          role="img"
          aria-label="Corpus semantic map"
          data-testid={testId("corpusContextMap")}
        >
          {placed.map((point) => (
            <circle
              key={`${point.cx}-${point.cy}-${point.name}`}
              cx={point.cx}
              cy={point.cy}
              r={DOT_R}
              fill={palette.fillFor(point.genre)}
              fillOpacity={DOT_OPACITY}
            >
              <title>{point.name}</title>
            </circle>
          ))}
        </svg>
      </Stack>
      <Legend palette={palette} />
    </Stack>
  );
}

function Legend({ palette }: { readonly palette: GenrePalette }): ReactElement | null {
  if (palette.legend.length === 0) {
    return null;
  }
  return (
    <Row align="center" gap="block" className="flex-wrap">
      {palette.legend.map((swatch) => (
        <Row key={swatch.genre} align="center" gap="field" className="shrink-0">
          <svg
            width={LEGEND_DOT}
            height={LEGEND_DOT}
            viewBox={`0 0 ${LEGEND_DOT} ${LEGEND_DOT}`}
            aria-hidden={true}
          >
            <circle
              cx={LEGEND_DOT / HALF}
              cy={LEGEND_DOT / HALF}
              r={LEGEND_DOT_R}
              fill={swatch.fill}
            />
          </svg>
          <Text size="micro" tone="muted">
            {swatch.genre}
          </Text>
        </Row>
      ))}
    </Row>
  );
}

interface PlacedPoint {
  readonly name: string;
  readonly genre: string | null;
  readonly cx: number;
  readonly cy: number;
}

/** Map the raw PCA coordinates into the padded viewBox (a degenerate axis collapses to the center). */
function normalize(points: readonly Point[]): readonly PlacedPoint[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = VIEW - PAD * 2;
  const scale = (value: number, min: number, max: number): number =>
    max === min ? VIEW / HALF : PAD + ((value - min) / (max - min)) * span;
  return points.map((p) => ({
    name: p.name,
    genre: p.genre,
    cx: scale(p.x, minX, maxX),
    cy: scale(p.y, minY, maxY),
  }));
}
