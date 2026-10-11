// Whether the room still holds its transcript's reading floor with the plugin flank inline beside it. The room
// measures and publishes; the two hosts of the flank panels (the inline column and the header sheet) read the
// same answer here, so a width change moves the panels from one host to the other in one pass and a plugin
// frame never mounts in both. A module singleton because one room is open at a time and the header that
// must agree with it lives outside the room's subtree.

import { useSyncExternalStore } from "react";

let fits = true;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return (): void => {
    listeners.delete(onChange);
  };
}

function snapshot(): boolean {
  return fits;
}

/** The room's verdict: `true` while the transcript beside an inline flank still holds its reading floor. */
export function publishInlineFlankFit(next: boolean): void {
  if (fits === next) {
    return;
  }
  fits = next;
  for (const listener of listeners) {
    listener();
  }
}

export function useInlineFlankFits(): boolean {
  return useSyncExternalStore(subscribe, snapshot);
}
