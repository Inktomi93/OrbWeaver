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
  height,
}: {
  readonly query: string;
  readonly targetId: string;
  readonly rerank: boolean;
  readonly width: number | undefined;
  readonly height: number | undefined;
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
  const size = { ...(width === undefined ? {} : { inlineSize: width }), ...(height === undefined ? {} : { blockSize: height }) };
  return <Container style={size}>{list()}</Container>;
}

/** The production Corpus list pane through its authenticated section registry, searching `query` over `targetId`, with the rerank ask stored as `rerank`.
 *  A `width` gives the pane that fixed inline size, as a docked side pane has; a `height` bounds it the way the shell's list region does. */
export function CorpusSearchControlsStory({
  query,
  targetId,
  rerank = false,
  width,
  height,
}: {
  readonly query: string;
  readonly targetId: string;
  readonly rerank?: boolean;
  readonly width?: number;
  readonly height?: number;
}): ReactElement {
  return (
    <CtClientProviders>
      <CorpusList query={query} targetId={targetId} rerank={rerank} width={width} height={height} />
    </CtClientProviders>
  );
}
