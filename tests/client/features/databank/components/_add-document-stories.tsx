import { CtClientProviders, CtModalCommit } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The registered Add-document commit in the commit dialog that draws its form and footer as the shell's ModalHost does. */
export function AddDocumentStory(): ReactElement {
  return (
    <CtClientProviders>
      <CtModalCommit modalId="addDocument" />
    </CtClientProviders>
  );
}
