// A file dragged onto a surface, as one hook: the composer and the avatar control share it, so a dropped picture is
// claimed the same way everywhere.
//
// DRAG DISCRIMINATION mirrors the app-shell stray-drop guard (`packages/client/src/features/app-shell/hooks/use-stray-file-drop-guard.ts`):
// only a drag whose `dataTransfer.types` includes "Files" is claimed. A text or selection drag into a textarea is the
// browser's own default action and cancelling it would break dropping text. Claiming a file drag also carves it out of that
// window-level guard by construction: the guard skips an event that is already `defaultPrevented`, and these React handlers
// preventDefault at the surface before the event reaches window. `dragover` must be cancelled too, or the drop event never
// fires and the browser navigates the tab to the dropped file.
//
// ENTER/LEAVE COUNTING: dragenter/dragleave fire per descendant, so a boolean flipped on leave goes dark the moment the
// pointer crosses from the surface's padding onto a child. The depth counter clears the affordance only when the drag has
// left the whole subtree (or dropped).

import type { DragEvent } from "react";
import { useRef, useState } from "react";

/** The drag-target props to spread onto the surface that takes the drop. */
interface FileDropTargetProps {
  readonly onDragEnter: (event: DragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDragLeave: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
}

export interface FileDrop {
  /** True while a file drag is over the surface: drives the visible drop affordance. */
  readonly dragActive: boolean;
  readonly dropTargetProps: FileDropTargetProps;
}

function carriesFiles(types: readonly string[]): boolean {
  return types.includes("Files");
}

export function useFileDrop(onFiles: (files: readonly File[]) => void): FileDrop {
  const [dragActive, setDragActive] = useState(false);
  // Event bookkeeping the render never reads; only the derived `dragActive` boolean paints.
  const depth = useRef(0);

  const onDragEnter = (event: DragEvent<HTMLElement>): void => {
    if (!carriesFiles(event.dataTransfer.types)) {
      return;
    }
    event.preventDefault();
    depth.current += 1;
    setDragActive(true);
  };
  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    if (!carriesFiles(event.dataTransfer.types)) {
      return;
    }
    // Cancelling dragover is what makes this a drop target at all.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (event: DragEvent<HTMLElement>): void => {
    if (!carriesFiles(event.dataTransfer.types)) {
      return;
    }
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) {
      setDragActive(false);
    }
  };
  const onDrop = (event: DragEvent<HTMLElement>): void => {
    if (!carriesFiles(event.dataTransfer.types)) {
      return;
    }
    event.preventDefault();
    depth.current = 0;
    setDragActive(false);
    onFiles(Array.from(event.dataTransfer.files));
  };

  return { dragActive, dropTargetProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
