import { setCorpusMode, setCorpusSearchQuery, setCorpusSearchRerank, setCorpusSearchTarget, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

function CorpusList({ query, targetId, rerank }: { readonly query: string; readonly targetId: string; readonly rerank: boolean }): ReactElement {
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
  return <Container>{list()}</Container>;
}

/** The production Corpus list pane through its authenticated section registry, searching `query` over `targetId`, with the rerank ask stored as `rerank`. */
export function CorpusSearchControlsStory({
  query,
  targetId,
  rerank = false,
}: {
  readonly query: string;
  readonly targetId: string;
  readonly rerank?: boolean;
}): ReactElement {
  return (
    <CtClientProviders>
      <CorpusList query={query} targetId={targetId} rerank={rerank} />
    </CtClientProviders>
  );
}
