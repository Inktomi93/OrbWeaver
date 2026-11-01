import { FormDialog } from "@orb/client/components";
import { useModalRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement, ReactNode } from "react";

function AddDocumentModalBody(): ReactNode {
  const definition = useModalRegistry().get("addDocument");
  if (typeof definition.body !== "function") {
    throw new Error("Add document has no modal body");
  }
  return definition.body();
}

/** The registered Add-document modal body inside the dialog frame the shell's ModalHost gives it. */
export function AddDocumentStory(): ReactElement {
  return (
    <CtClientProviders>
      <FormDialog onOpenChange={(): void => undefined} open={true} title="Add a document">
        <AddDocumentModalBody />
      </FormDialog>
    </CtClientProviders>
  );
}
