// Registry-modal mounts. Both derive from the production modal registry the client providers deliver; neither writes a
// definition of its own.
import { FormDialog } from "@orb/client/components";
import type { Registry } from "@orb/client/lib";
import type { ModalCommit, ModalDefinition, ModalSlotId } from "@orb/client/state";
import { ModalRegistryProvider, useModalRegistry } from "@orb/client/state";
import type { ReactElement, ReactNode } from "react";

function useRegisteredCommit(modalId: ModalSlotId): ModalCommit {
  const definition = useModalRegistry().get(modalId);
  if (typeof definition.body === "function" || !("useCommit" in definition.body)) {
    throw new Error(`${modalId} is not a commit modal`);
  }
  return definition.body.useCommit();
}

/**
 * The commit modal `modalId` as its definition declares it, open under its own title in the commit dialog, which draws
 * the same form and footer the shell's ModalHost draws for a commit. A feature suite cannot mount the shell's host, so
 * this runs the production body, submit and footer; the shell's own suites cover the host's frame. The dialog is modal, so
 * a story that drives the app while it is up passes those controls as `children`, which render inside it after the content.
 */
export function CtModalCommit({ modalId, children }: { readonly modalId: ModalSlotId; readonly children?: ReactNode }): ReactElement {
  const { content, submit, footerLead } = useRegisteredCommit(modalId);
  const title = useModalRegistry().get(modalId).title;
  return (
    <FormDialog closeButton={true} footerLead={footerLead} onOpenChange={(): void => undefined} open={true} submit={submit} title={title}>
      {content}
      {children}
    </FormDialog>
  );
}

function asDrawer(registry: Registry<ModalSlotId, ModalDefinition>, modalId: ModalSlotId): Registry<ModalSlotId, ModalDefinition> {
  const { size: _size, presentation: _presentation, ...definition } = registry.get(modalId);
  const drawer: ModalDefinition = { ...definition, presentation: "drawer" };
  return {
    get: (id): ModalDefinition => (id === modalId ? drawer : registry.get(id)),
    list: (): readonly ModalDefinition[] => registry.list().map((entry) => (entry.id === modalId ? drawer : entry)),
  };
}

/**
 * The production modal registry with `modalId` presented as the phone drawer, for a story whose subject is the host's
 * drawer frame around a modal that ships as a dialog. Every other definition, and every field of this one but its
 * presentation, is the production one.
 */
export function CtModalAsDrawer({ modalId, children }: { readonly modalId: ModalSlotId; readonly children: ReactNode }): ReactElement {
  const registry = useModalRegistry();
  return <ModalRegistryProvider value={asDrawer(registry, modalId)}>{children}</ModalRegistryProvider>;
}
