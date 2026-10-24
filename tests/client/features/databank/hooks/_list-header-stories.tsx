import { ListPaneHeaderHost } from "@orb/client/components";
import { useTRPC } from "@orb/client/data";
import { useOpenModal, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";

function DatabankListHeader(): ReactElement {
  // The shell's ModalHost renders the opened slot; this story shows only which slot the band opened.
  const openModal = useOpenModal();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (
    <>
      {/* The census read never goes stale on its own; a document landing elsewhere is what re-reads it. */}
      <Button onClick={(): void => void queryClient.invalidateQueries(trpc.databank.bankHealth.pathFilter()).catch(globalThis.reportError)}>
        Re-read census
      </Button>
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
