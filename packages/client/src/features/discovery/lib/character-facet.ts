// The ONE distilled-facet line for a discovery character row — genre · tone, dropping any null part.
// Shared by the dossier header + neighbor rows, the browse rows, and the search hits so the "genre · tone"
// subtitle can't drift (derive-modernization §W5).
export function characterFacetLine(genre: string | null, tone: string | null): string {
  return [genre, tone].filter((v) => v !== null).join(" · ");
}
