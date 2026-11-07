// The ONE distilled-facet line for a discovery character row — genre · tone (· setting on the browse rows),
// dropping any absent part. Shared by the dossier header + neighbor rows, the browse rows, and the search hits
// so the "genre · tone" subtitle can't drift (derive-modernization §W5).
//
// IT IS CASED FOR A READER, not left as the distiller wrote it (P3-2): the pass stores lower-case tokens
// (`fantasy`, `melancholic`), and every consumer of this line renders it as prose beside a name. The casing
// rule is the surface's one home (`corpus-vocabulary.ts`) so the chain and the cluster facets agree.
import { sentenceCase } from "./corpus-vocabulary.ts";

export function characterFacetLine(genre: string | null, tone: string | null, setting: string | null = null): string {
  // Setting is free text, so an empty reply is as absent as a null one.
  return sentenceCase([genre, tone, setting].filter((v) => v !== null && v !== "").join(" · "));
}
