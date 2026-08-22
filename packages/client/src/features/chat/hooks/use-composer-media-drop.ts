// The composer's two NON-PICKER attach gestures (#376) — a file dragged onto the composer surface and a
// clipboard paste — as one hook, so the composer body stays under its cognitive-complexity ceiling and the
// two gestures share one delivery seam (`onFiles`, which is the picker's seam too).
//
// DRAG DISCRIMINATION mirrors the app-shell stray-drop guard (`use-stray-file-drop-guard.ts`): only a drag
// whose `dataTransfer.types` includes "Files" is claimed. A text/selection drag into the composer is the
// browser's own default action and cancelling it would break dropping text into the textarea. Claiming a
// file drag also CARVES IT OUT of that window-level guard by construction — the guard skips an event that is
// already `defaultPrevented`, and these React handlers preventDefault at the composer before the event ever
// reaches window. `dragover` must be cancelled too, or the drop event never fires and the browser navigates
// the tab to the dropped file.
//
// ENTER/LEAVE COUNTING: dragenter/dragleave fire per DESCENDANT, so a boolean flipped on leave goes dark the
// moment the pointer crosses from the composer's padding onto the textarea. The depth counter is the standard
// fix — the affordance clears only when the drag has left the whole subtree (or dropped).
//
// PASTE never calls preventDefault. A clipboard carrying BOTH text and an image (rich copy) must attach the
// image AND still paste the text; when the clipboard carries only files there is nothing for the browser to
// insert, so suppressing the default would buy nothing. Screenshots and copied media files both arrive as
// `clipboardData.files` in Chromium, so one read covers both halves of the owner's ask.

import type { ClipboardEvent, DragEvent } from "react";
import { useRef, useState } from "react";

/** The drag-target props spread onto the composer surface, plus the textarea's paste handler. */
export interface ComposerMediaDrop {
  /** True while a FILE drag is over the composer — drives the visible drop affordance. */
  readonly dragActive: boolean;
  readonly dropTargetProps: {
    readonly onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
    readonly onDragOver: (event: DragEvent<HTMLDivElement>) => void;
    readonly onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
    readonly onDrop: (event: DragEvent<HTMLDivElement>) => void;
  };
  readonly onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}

function carriesFiles(types: readonly string[]): boolean {
  return types.includes("Files");
}

export function useComposerMediaDrop(onFiles: (files: readonly File[]) => void): ComposerMediaDrop {
  const [dragActive, setDragActive] = useState(false);
  // The dragenter/dragleave depth — see the header. Held in a ref because it is event bookkeeping the render
  // never reads (only the derived `dragActive` boolean paints).
  const depth = useRef(0);

  const onDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (!carriesFiles(event.dataTransfer.types)) {
      return;
    }
    event.preventDefault();
    depth.current += 1;
    setDragActive(true);
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!carriesFiles(event.dataTransfer.types)) {
      return;
    }
    // Cancelling dragover is what makes this a drop target at all — without it the browser refuses the drop
    // and navigates away to the file instead.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!carriesFiles(event.dataTransfer.types)) {
      return;
    }
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) {
      setDragActive(false);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!carriesFiles(event.dataTransfer.types)) {
      return;
    }
    event.preventDefault();
    depth.current = 0;
    setDragActive(false);
    onFiles(Array.from(event.dataTransfer.files));
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const pasted = Array.from(event.clipboardData.files);
    if (pasted.length > 0) {
      onFiles(pasted);
    }
  };

  return { dragActive, dropTargetProps: { onDragEnter, onDragOver, onDragLeave, onDrop }, onPaste };
}
