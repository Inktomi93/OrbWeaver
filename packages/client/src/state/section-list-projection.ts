// The `#state` projections over a section's LIST pane — "is it docked?" and "is it the mobile SCREEN?".
// Their own module because they read BOTH the shell store and the SECTION REGISTRY, and shell-store.ts
// cannot: `section-registry-context.ts` → `section-registry.ts` → `shell-store.ts` already, so a registry
// read inside the store closes an import cycle (dep-cruiser `no-circular`, measured). Here they are a leaf.
//
// Both route through the ONE `resolvePanelMode` algebra `useShellLayout` uses, so the tiers can never
// disagree — the M10 correction bug was a hand-copied mirror that read only `mobileViewport`.

import { useSyncExternalStore } from "react";
import type { PanelMode } from "./panel-resolve.ts";
import { resolvePanelMode } from "./panel-resolve.ts";
import { useSectionRegistry } from "./section-registry-context.ts";
import type { SectionId } from "./shell-store.ts";
import { useFocusMode, useMobileViewport, useNarrowViewport, useOpenOverlayPanel, usePanelOverride } from "./shell-store.ts";

// The no-seam fallbacks are MODULE constants, not inline lambdas: `useSyncExternalStore` re-subscribes
// whenever `subscribe`'s identity changes, and a fresh closure per render would tear the subscription down
// and back up on every commit.
const NO_SELECTION_SUBSCRIBE = (): (() => void) => (): void => undefined;
const NO_SELECTION_SNAPSHOT = (): boolean => false;

/** Is `section` in the mobile LIST-AS-SCREEN arm — does it declare a list with nothing selected? The ONE
 *  home for that question (`useShellLayout`'s resolve and `useListDocked` below both read it here), and the
 *  reason `SectionSelection` is a subscribe/snapshot pair rather than a hook: this is ONE
 *  `useSyncExternalStore` call whose hook identity never varies with the section, so it is legal above a
 *  keyed boundary and answers synchronously on the first render (no effect-published mirror, no flash). */
export function useSectionListIsScreen(section: SectionId): boolean {
  const definition = useSectionRegistry().get(section);
  const selection = definition.selection;
  const hasSelection = useSyncExternalStore(selection?.subscribe ?? NO_SELECTION_SUBSCRIBE, selection?.hasSelection ?? NO_SELECTION_SNAPSHOT);
  return selection !== undefined && !hasSelection;
}

/** Is a section's LIST panel currently docked — the narrow #state projection a section body reads instead of
 *  `useShellLayout` (client-features-no-cross bars a feature from importing the app-shell hook, so this tier
 *  is the ONLY legal way for a feature to ask).
 *
 *  LIVENESS (swept 2026-08-01): ZERO feature consumers today. Its one caller was the chat landing's
 *  `showRecents` — "when the Chats LIST is docked it already IS the recents finder, so don't duplicate it" —
 *  and H2 (`3f54a4d3`) retired the landing's recents entirely (home tiles own them now). KEPT, not deleted:
 *  the superseded thing was that ONE de-duplication, not this projection. It is the seam's only sanctioned
 *  answer to "is my list pane visible", and the alternative — a feature recomposing it from
 *  `usePanelOverride` + the viewport reads — is exactly the hand-copied mirror that produced the M10 bug.
 *
 *  Since the mobile ONE-SHELL rule the answer also depends on the section's own selection seam (a
 *  list-bearing section with nothing open IS docked on a phone — it is the screen), which is why it reads
 *  the registry through the projection above rather than re-deriving anything. */
export function useListDocked(section: SectionId, ownDefault: PanelMode): boolean {
  const isFocus = useFocusMode();
  const isMobile = useMobileViewport();
  const isNarrow = useNarrowViewport();
  const openOverlayPanel = useOpenOverlayPanel();
  const listIsScreen = useSectionListIsScreen(section);
  const override = usePanelOverride(section, "list");
  const resolved = override ?? ownDefault;
  return resolvePanelMode("list", resolved, { isFocus, isMobile, isNarrow, openOverlayPanel, listIsScreen }) === "docked";
}
