import { clearCorpusSelection, setCorpusMode, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

function CorpusOverview(): ReactElement {
  useLayoutEffect(() => {
    clearCorpusSelection();
    setCorpusMode("explore");
  }, []);
  const content = useSectionRegistry().get("corpus").content;
  if (typeof content !== "function") {
    throw new Error("Corpus must expose its production content");
  }
  return <Container>{content()}</Container>;
}

/** The production Corpus overview through its authenticated section registry. */
export function CorpusCoverageStory(): ReactElement {
  return (
    <CtClientProviders>
      <CorpusOverview />
    </CtClientProviders>
  );
}
