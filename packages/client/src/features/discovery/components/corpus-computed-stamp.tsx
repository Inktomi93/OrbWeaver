// The line under a Corpus result list that says when its pass last recorded it. Duplicate and keyword results go stale
// between recomputes, so the reader sees the age beside the rows. An empty list has no pass to date and renders nothing.

import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { stampWhen, timeLib } from "#lib";
import { corpusComputedLine } from "../lib/corpus-computed-copy.ts";

export function CorpusComputedStamp({
  rows,
  spaces,
}: {
  readonly rows: readonly { readonly computedAt: number }[];
  /** The embedding space each row was compared in; the line names each distinct one once. */
  readonly spaces?: readonly string[];
}): ReactElement | null {
  const latest = rows.reduce<number | null>((newest, row) => (newest === null ? row.computedAt : Math.max(newest, row.computedAt)), null);
  if (latest === null) {
    return null;
  }
  return <Text voice="gloss">{corpusComputedLine(stampWhen(timeLib, latest), [...new Set(spaces)])}</Text>;
}
