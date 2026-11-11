// The composer's two NON-PICKER attach gestures — a file dragged onto the composer surface and a clipboard paste — as one
// hook, so the composer body stays under its cognitive-complexity ceiling and the two gestures share one delivery seam
// (`onFiles`, which is the picker's seam too). The drag half is the shared `useFileDrop`.
//
// PASTE never calls preventDefault. A clipboard carrying BOTH text and an image (rich copy) must attach the
// image AND still paste the text; when the clipboard carries only files there is nothing for the browser to
// insert, so suppressing the default would buy nothing. Screenshots and copied media files both arrive as
// `clipboardData.files` in Chromium, so one read covers both halves of the owner's ask.

import type { ClipboardEvent } from "react";
import type { FileDrop } from "#components";
import { useFileDrop } from "#components";

/** The drag-target props spread onto the composer surface, plus the textarea's paste handler. */
export interface ComposerMediaDrop extends FileDrop {
  readonly onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}

export function useComposerMediaDrop(onFiles: (files: readonly File[]) => void): ComposerMediaDrop {
  const drop = useFileDrop(onFiles);
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const pasted = Array.from(event.clipboardData.files);
    if (pasted.length > 0) {
      onFiles(pasted);
    }
  };

  return { ...drop, onPaste };
}
