import { ListPaneHeaderHost } from "@orb/client/components";
import { setExtensionsSearchQuery, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useEffect } from "react";

function ExtensionsListHeader({ query }: { readonly query: string }): ReactElement | null {
  // The finder input lives in the shell's LIST band; the story drives the same session store it writes.
  useEffect(() => {
    setExtensionsSearchQuery(query);
  }, [query]);
  return <ListPaneHeaderHost useView={useSectionRegistry().get("extensions").useListHeader} />;
}

/** The production Plugin pages LIST band, resolved through the registry the shell reads. */
export function ExtensionsListHeaderStory({ query = "" }: { readonly query?: string }): ReactElement {
  return (
    <CtClientProviders>
      <ExtensionsListHeader query={query} />
    </CtClientProviders>
  );
}
