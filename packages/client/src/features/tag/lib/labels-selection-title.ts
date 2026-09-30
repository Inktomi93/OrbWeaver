// The Corpus Labels phone title: the open tag's name, else the mode and its census (the #1676 rule — the
// census rides the noun that survives on a phone). An inactive mode fetches nothing.

import { CORPUS_MODE_LABELS } from "#lib";
import { useSelectedLabelId } from "#state";
import { useTagCensus, useTagName } from "../hooks/use-tag-library.ts";

export function useLabelsSelectionTitle(active: boolean): string | null {
  const tagId = useSelectedLabelId();
  const name = useTagName(active ? tagId : null);
  const census = useTagCensus(active && tagId === null);
  if (!active) {
    return null;
  }
  if (tagId !== null) {
    return name ?? null;
  }
  return census === undefined || census === 0 ? CORPUS_MODE_LABELS.labels : `${CORPUS_MODE_LABELS.labels} · ${String(census)}`;
}
