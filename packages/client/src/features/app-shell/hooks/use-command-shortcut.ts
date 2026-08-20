// useCommandShortcut — the document-keyboard lifecycle for the command palette. AppShell derives the
// command modal from the registry and supplies its durable trigger; this hook owns only classification,
// the Chromium-safe deferred open, and exact listener/frame cleanup. It does not discover commands or
// keep a second shortcut map: keyboard and click both invoke the shell store's one `openModal` action.

import type { RefObject } from "react";
import { useEffect } from "react";
import type { ModalSlotId } from "#state";
import { openModal } from "#state";

export function useCommandShortcut(
  triggerRef: RefObject<HTMLButtonElement | null>,
  commandModalId: ModalSlotId | undefined,
  openModalId: ModalSlotId | null,
): void {
  useEffect(() => {
    let pendingOpen: number | null = null;
    const onCommandKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      const editable =
        target instanceof HTMLElement &&
        (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement);
      const onePrimaryModifier = event.metaKey !== event.ctrlKey && (event.metaKey || event.ctrlKey);
      if (
        commandModalId === undefined ||
        openModalId !== null ||
        event.key.toLowerCase() !== "k" ||
        !onePrimaryModifier ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        editable
      ) {
        return;
      }
      event.preventDefault();
      if (pendingOpen !== null) {
        return;
      }
      // Chromium restores focus after a Meta accelerator's keydown. Opening on the next frame lets the
      // durable trigger become ModalHost's return target after the native chord has released.
      pendingOpen = requestAnimationFrame(() => {
        triggerRef.current?.focus();
        openModal(commandModalId);
        pendingOpen = null;
      });
    };
    document.addEventListener("keydown", onCommandKeyDown, { capture: true });
    return (): void => {
      if (pendingOpen !== null) {
        cancelAnimationFrame(pendingOpen);
      }
      document.removeEventListener("keydown", onCommandKeyDown, { capture: true });
    };
  }, [commandModalId, openModalId, triggerRef]);
}
