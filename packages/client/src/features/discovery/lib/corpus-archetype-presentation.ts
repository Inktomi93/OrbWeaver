import type { CorpusDestination } from "#lib";
import { disambiguateLabels } from "./corpus-charts.ts";
import { facetLabel } from "./corpus-vocabulary.ts";

/** The map, analysis tab and selected detail share one naming decision over the complete response. */
export function resolveCorpusArchetypeNames(clusters: readonly Extract<CorpusDestination, { kind: "cluster" }>["cluster"][]): readonly string[] {
  return disambiguateLabels(
    clusters.map((cluster) => ({
      label: facetLabel(cluster.baseLabel),
      facets: ("artStyle" in cluster ? [cluster.artStyle, cluster.palette, cluster.mood] : [cluster.genre, cluster.tone, ...cluster.topTags])
        .concat(cluster.members[0]?.name ?? "")
        .filter((facet): facet is string => facet !== null && facet !== ""),
    })),
  );
}
