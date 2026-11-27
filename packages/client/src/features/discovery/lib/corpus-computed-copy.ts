// How a Corpus result list says when its pass last recorded it, and in which embedding space. A zero-import leaf, so a
// spec's node side reads the leads without loading the component graph.

/** The lead of a result list's stamp, over how long ago the pass recorded it. */
export const CORPUS_COMPUTED_LEAD = "Computed";

/** The lead of the embedding space a pair list was compared in. */
export const CORPUS_EMBEDDING_SPACE_LEAD = "Embedding space";

/** A list's stamp line: when it was computed and, for a list compared in an embedding space, the space's name. */
export function corpusComputedLine(when: string, spaces: readonly string[]): string {
  const stamp = `${CORPUS_COMPUTED_LEAD} ${when}`;
  return spaces.length === 0 ? stamp : `${stamp} · ${CORPUS_EMBEDDING_SPACE_LEAD} ${spaces.join(", ")}`;
}
