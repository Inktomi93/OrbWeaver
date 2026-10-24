// The production AppShell under the client providers. Section and panel state arrive the way a boot has them, from
// storage the spec seeds before mount; a modal opens through the shell store's own `openModal` action.
import { AppShell } from "@orb/client/features/app-shell";
import type { ModalSlotId } from "@orb/client/state";
import { openModal } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useEffect } from "react";

/** The production shell and nothing else. */
export function AppShellStory(): ReactElement {
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}

function OpenModalOnMount({ modalId }: { readonly modalId: ModalSlotId }): null {
  useEffect(() => {
    openModal(modalId);
  }, [modalId]);
  return null;
}

/** The production shell with one registered modal opened through the store, as a content trigger opens it. */
export function AppShellModalStory({ modalId }: { readonly modalId: ModalSlotId }): ReactElement {
  return (
    <CtClientProviders>
      <OpenModalOnMount modalId={modalId} />
      <AppShell />
    </CtClientProviders>
  );
}
