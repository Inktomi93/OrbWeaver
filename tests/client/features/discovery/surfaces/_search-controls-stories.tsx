import { setCorpusMode, setCorpusSearchQuery, setCorpusSearchTarget, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

function CorpusList({ query, targetId }: { readonly query: string; readonly targetId: string }): ReactElement {
  useLayoutEffect(() => {
    setCorpusMode("explore");
    setCorpusSearchTarget(targetId);
    setCorpusSearchQuery(query);
  }, [query, targetId]);
  const list = useSectionRegistry().get("corpus").list;
  if (typeof list !== "function") {
    throw new Error("Corpus must expose its production list");
  }
  return <Container>{list()}</Container>;
}

/** The production Corpus list pane through its authenticated section registry, searching `query` over `targetId`. */
export function CorpusSearchControlsStory({ query, targetId }: { readonly query: string; readonly targetId: string }): ReactElement {
  return (
    <CtClientProviders>
      <CorpusList query={query} targetId={targetId} />
    </CtClientProviders>
  );
}
