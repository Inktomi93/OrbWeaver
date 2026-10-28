import { AppShell } from "@orb/client/features/app-shell";
import { selectDocumentFromList } from "@orb/client/state";
import type { DocumentId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The actual shell opens the document through its production library-selection action. */
export function DatabankCompositionShellStory({ documentId }: { readonly documentId: DocumentId }): ReactElement {
  useState(() => {
    selectDocumentFromList(documentId);
    return true;
  });
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}
