import { setCorpusMode, setCorpusSearchQuery, setCorpusSearchRerank, setCorpusSearchTarget, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

function CorpusList({
  query,
  targetId,
  rerank,
  width,
}: {
  readonly query: string;
  readonly targetId: string;
  readonly rerank: boolean;
  readonly width: number | undefined;
}): ReactElement {
  useLayoutEffect(() => {
    setCorpusMode("explore");
    setCorpusSearchTarget(targetId);
    setCorpusSearchQuery(query);
    setCorpusSearchRerank(rerank);
  }, [query, targetId, rerank]);
  const list = useSectionRegistry().get("corpus").list;
  if (typeof list !== "function") {
    throw new Error("Corpus must expose its production list");
  }
  return <Container {...(width === undefined ? {} : { style: { inlineSize: width } })}>{list()}</Container>;
}

/** The production Corpus list pane through its authenticated section registry, searching `query` over `targetId`, with the rerank ask stored as `rerank`.
 *  A `width` gives the pane that fixed inline size, as a docked side pane has. */
export function CorpusSearchControlsStory({
  query,
  targetId,
  rerank = false,
  width,
}: {
  readonly query: string;
  readonly targetId: string;
  readonly rerank?: boolean;
  readonly width?: number;
}): ReactElement {
  return (
    <CtClientProviders>
      <CorpusList query={query} targetId={targetId} rerank={rerank} width={width} />
    </CtClientProviders>
  );
}
