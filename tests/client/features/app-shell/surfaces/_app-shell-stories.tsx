// The production AppShell under the client providers. Section and panel state arrive the way a boot has them, from
// storage the spec seeds before mount; a modal opens through the shell store's own `openModal` action.
import { AppShell } from "@orb/client/features/app-shell";
import { notify } from "@orb/client/lib";
import type { ModalSlotId } from "@orb/client/state";
import { dockListPanel, openModal } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
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

/** The production shell with a control that raises a notice through the app's own `notify` facade. */
export function AppShellNoticeStory({ title, description }: { readonly title: string; readonly description: string }): ReactElement {
  return (
    <CtClientProviders>
      <AppShell />
      <Button className="fixed start-0 bottom-0 z-(--z-toast)" onClick={(): void => notify.info({ title, description })}>
        Raise a notice
      </Button>
    </CtClientProviders>
  );
}

/** The production shell with a control that docks the LIST from outside it, as a feature's own door does. */
export function AppShellListDockStory(): ReactElement {
  return (
    <CtClientProviders>
      <AppShell />
      <Button className="fixed start-0 bottom-0 z-(--z-toast)" onClick={dockListPanel}>
        Dock the list from outside
      </Button>
    </CtClientProviders>
  );
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
