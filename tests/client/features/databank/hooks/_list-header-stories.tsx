import { ListPaneHeaderHost } from "@orb/client/components";
import { useOpenModal, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

function DatabankListHeader(): ReactElement {
  // The shell's ModalHost renders the opened slot; this story shows only which slot the band opened.
  const openModal = useOpenModal();
  return (
    <>
      <ListPaneHeaderHost useView={useSectionRegistry().get("databank").useListHeader} />
      <output aria-label="Open modal slot">{openModal ?? "none"}</output>
    </>
  );
}

/** The production Databank LIST band, resolved through the registry the shell reads. */
export function DatabankListHeaderStory(): ReactElement {
  return (
    <CtClientProviders>
      <DatabankListHeader />
    </CtClientProviders>
  );
}
