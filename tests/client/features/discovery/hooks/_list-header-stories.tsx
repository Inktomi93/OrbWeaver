import { ListPaneHeaderHost } from "@orb/client/components";
import { useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

function CorpusListHeader(): ReactElement | null {
  return <ListPaneHeaderHost useView={useSectionRegistry().get("corpus").useListHeader} />;
}

/** The production Corpus section's LIST band, resolved through the registry the shell reads. */
export function CorpusListHeaderStory(): ReactElement {
  return (
    <CtClientProviders>
      <CorpusListHeader />
    </CtClientProviders>
  );
}
