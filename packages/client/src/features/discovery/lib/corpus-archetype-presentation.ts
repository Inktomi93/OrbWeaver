import type { VisualArchetype } from "@orb/contracts/discovery";
import type { CorpusDestination } from "#lib";
import { disambiguateLabels } from "./corpus-charts.ts";
import { facetLabel } from "./corpus-vocabulary.ts";

/** The map, analysis tab and selected detail share one naming decision over the complete response. */
export function resolveCorpusArchetypeNames(clusters: readonly Extract<CorpusDestination, { kind: "cluster" }>["cluster"][]): readonly string[] {
  return disambiguateLabels(
    clusters.map((cluster) => ({
      label: "analysedMembers" in cluster && cluster.analysedMembers === 0 ? corpusFamilyMemberNames(cluster) : facetLabel(cluster.baseLabel),
      facets: ("artStyle" in cluster ? [cluster.artStyle, cluster.palette, cluster.mood] : [cluster.genre, cluster.tone, ...cluster.topTags])
        .concat(cluster.members[0]?.name ?? "")
        .filter((facet): facet is string => facet !== null && facet !== ""),
    })),
  );
}

const FAMILY_NAME_CAP = 2;

/** A family preview ends at a member-name boundary and counts the omitted members. */
export function corpusFamilyMemberNames(family: Pick<VisualArchetype, "members" | "size">): string {
  const shown = family.members.slice(0, FAMILY_NAME_CAP).map((member) => member.name);
  const hidden = family.size - shown.length;
  return hidden > 0 ? `${shown.join(" · ")} +${hidden.toString()} more` : shown.join(" · ");
}

/** Readiness comes from current caption breakdowns, not from whether analysis found a distinctive label. */
export function corpusFamilyAnalysisLabel(family: VisualArchetype): string | null {
  if (family.analysedMembers === 0) {
    return "Not analysed yet";
  }
  return family.analysedMembers < family.size ? `${String(family.analysedMembers)} of ${String(family.size)} portraits analysed` : null;
}
