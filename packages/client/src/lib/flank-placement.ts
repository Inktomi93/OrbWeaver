// What the room's flank column and the plugin panels it hosts must agree on, published by whichever side knows it:
// the room publishes whether the transcript still holds its reading floor beside the column (`fits`), the plugin
// host publishes whether it has any panel to show, whether the user collapsed the column, and the door that flips
// that choice. Module singletons because one room is open at a time and the room's column, its edge control and
// the plugin host live in different subtrees.

import { useSyncExternalStore } from "react";

/** The plugin host's answer. The collapse choice is the host's own preference (it rides the user's settings), so
 *  the room reads it from here instead of owning a second door onto the same setting. */
export interface FlankHost {
  /** At least one panel is showing. */
  readonly panels: boolean;
  readonly collapsed: boolean;
  readonly toggle: () => void;
}

const NO_HOST: FlankHost = { panels: false, collapsed: false, toggle: () => undefined };

let fits = true;
let host: FlankHost = NO_HOST;
let sheetOpen = false;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return (): void => {
    listeners.delete(onChange);
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** The room's verdict: `true` while the transcript beside an inline flank still holds its reading floor. */
export function publishInlineFlankFit(next: boolean): void {
  if (fits !== next) {
    fits = next;
    notify();
  }
}

/** The plugin host's answer; `null` withdraws it. */
export function publishFlankHost(next: FlankHost | null): void {
  const resolved = next ?? NO_HOST;
  if (host.panels !== resolved.panels || host.collapsed !== resolved.collapsed || host.toggle !== resolved.toggle) {
    host = resolved;
    notify();
  }
}

export function useInlineFlankFits(): boolean {
  return useSyncExternalStore(subscribe, () => fits);
}

export function useFlankHost(): FlankHost {
  return useSyncExternalStore(subscribe, () => host);
}

/** A touch device's sheet of plugin panels. Its door is a Message tools item, which unmounts with the menu, so the
 *  open state lives here rather than in either component. */
export function setFlankSheetOpen(next: boolean): void {
  if (sheetOpen !== next) {
    sheetOpen = next;
    notify();
  }
}

export function useFlankSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, () => sheetOpen);
}
