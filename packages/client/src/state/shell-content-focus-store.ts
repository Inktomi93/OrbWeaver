// A feature's request that the shell hand focus to its content landmark (the section's `<main>`), the shape
// `refinery-landing-focus-store.ts` uses: the shell owns that node and no ref reaches a feature, so the feature asks
// and the shell, which holds the node, takes the request once. Ephemeral, never persisted.

import { createGatedStore } from "./create-gated-store.ts";
import type { SectionId } from "./section-ids.ts";

interface ShellContentFocusState {
  /** The section whose content should take focus; `null` once the shell has taken the request. */
  readonly section: SectionId | null;
}

const useShellContentFocusStore = createGatedStore<ShellContentFocusState>("shell-content-focus", (): ShellContentFocusState => ({ section: null }));

/** Ask the shell to focus `section`'s content landmark. A request for a section that is not active when the shell
 *  reads it is dropped, so a late request never moves focus in the wrong screen. */
export function requestShellContentFocus(section: SectionId): void {
  useShellContentFocusStore.setState({ section }, false, "shellContentFocus/request");
}

/** The shell took (or dropped) the pending request. */
export function clearShellContentFocus(): void {
  useShellContentFocusStore.setState({ section: null }, false, "shellContentFocus/clear");
}

/** Reactive: the section a feature wants focused, or `null` when nothing is pending. */
export function usePendingShellContentFocus(): SectionId | null {
  return useShellContentFocusStore((state) => state.section);
}
