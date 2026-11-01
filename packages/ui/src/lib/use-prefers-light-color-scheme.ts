import { useSyncExternalStore } from "react";
import type { MatchMediaListView } from "./match-media-list.ts";

// Keep the browser fact here so features share its query and subscription lifecycle.
const matchMediaFn = (globalThis as { matchMedia?: (query: string) => MatchMediaListView }).matchMedia;
const lightQuery = typeof matchMediaFn === "function" ? matchMediaFn("(prefers-color-scheme: light)") : null;

function subscribe(onChange: () => void): () => void {
  lightQuery?.addEventListener("change", onChange);
  return (): void => lightQuery?.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return lightQuery?.matches ?? false;
}

/** Live OS light-scheme preference, independent of the app's selected theme. */
export function usePrefersLightColorScheme(): boolean {
  return useSyncExternalStore(subscribe, snapshot);
}
