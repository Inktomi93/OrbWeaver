// useStrayFileDropGuard — swallows a FILE drop that lands outside any dropzone. The browser's default
// action for such a drop is to NAVIGATE the tab to the dropped file: a mis-aimed character card replaced
// the whole app with a PNG and took the session (open chat, in-flight turn, unsaved drafts) with it.
//
// Window-level, capture-free, and deliberately conditional on two things:
//  • the drag carries FILES (`dataTransfer.types` includes "Files") — text/selection drags into the
//    composer are the browser's own default action, and cancelling those would break dropping text into
//    an input;
//  • the event is not ALREADY defaultPrevented — a real dropzone (`FileDropzone`) calls preventDefault in
//    its React handler, which runs at the root container before the event reaches window, so a handled
//    drop is invisible to this guard and imports exactly as before.
// `dragover` must be cancelled too: without it the drop event never fires on the non-target area and the
// browser navigates anyway.

import { useToastManager } from "@orb/ui/toast";
import { useEffect } from "react";

/** The nudge a stray drop earns — a silent swallow reads as the app ignoring the file entirely. */
const STRAY_DROP_HINT = "Nothing imports from here — drop the file on an import zone.";

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

export function useStrayFileDropGuard(): void {
  const toast = useToastManager();
  useEffect((): (() => void) => {
    const allowDrop = (event: DragEvent): void => {
      if (event.defaultPrevented || !carriesFiles(event)) {
        return;
      }
      event.preventDefault();
    };
    const swallowDrop = (event: DragEvent): void => {
      if (event.defaultPrevented || !carriesFiles(event)) {
        return;
      }
      event.preventDefault();
      toast.add({ title: STRAY_DROP_HINT });
    };
    globalThis.addEventListener("dragover", allowDrop);
    globalThis.addEventListener("drop", swallowDrop);
    return (): void => {
      globalThis.removeEventListener("dragover", allowDrop);
      globalThis.removeEventListener("drop", swallowDrop);
    };
  }, [toast]);
}
