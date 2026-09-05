// useCommandShortcut — the document-keyboard lifecycle for the command palette. AppShell derives the
// command modal from the registry; this hook owns only classification, the Chromium-safe deferred open, and
// exact listener/frame cleanup. It does not discover commands or keep a second shortcut map: keyboard and
// click both invoke the shell store's one `openModal` action.
//
// IT DOES NOT TOUCH FOCUS (#890). It used to focus the durable trigger inside the deferring frame, purely so
// that ModalHost's mount-time `document.activeElement` snapshot would happen to capture it — a side channel
// that lost every race against Chromium's own post-accelerator focus restoration and dumped the close's
// focus at the top of the document. The focus return has ONE owner now: ModalHost resolves the modal's
// declared `data-modal-trigger`.

import { useEffect } from "react";
import type { ModalSlotId } from "#state";
import { openModal } from "#state";

export function useCommandShortcut(commandModalId: ModalSlotId | undefined, openModalId: ModalSlotId | null): void {
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
      // Chromium restores focus after a Meta accelerator's keydown; opening on the next frame keeps that
      // restoration off the freshly-mounted dialog. KEPT DELIBERATELY at #890 even though the focus-return
      // half of its original reason is gone: a headless CT cannot press a native OS accelerator, so dropping
      // the frame reads green here (measured, 35/35) and proves nothing about the browser this guards.
      pendingOpen = requestAnimationFrame(() => {
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
  }, [commandModalId, openModalId]);
}
