// The `#state` projections over a section's LIST pane — "what MODE is it in?" and "is it the mobile SCREEN?".
// Their own module because they read BOTH the shell store and the SECTION REGISTRY, and shell-store.ts
// cannot: `section-registry-context.ts` → `section-registry.ts` → `shell-store.ts` already, so a registry
// read inside the store closes an import cycle (dep-cruiser `no-circular`, measured). Here they are a leaf.
//
// Both route through the ONE `resolvePanelMode` algebra `useShellLayout` uses, so the tiers can never
// disagree — the M10 correction bug was a hand-copied mirror that read only `mobileViewport`.

import { useSyncExternalStore } from "react";
import type { PanelMode } from "./panel-resolve.ts";
import { resolvePanelMode } from "./panel-resolve.ts";
import type { SectionId } from "./section-ids.ts";
import type { SectionSelection } from "./section-registry.ts";
import { useSectionRegistry } from "./section-registry-context.ts";
import { useFocusMode, useMobileViewport, useNarrowViewport, useOpenOverlayPanel, usePanelOverride } from "./shell-store.ts";

// The no-seam fallbacks are MODULE constants, not inline lambdas: `useSyncExternalStore` re-subscribes
// whenever `subscribe`'s identity changes, and a fresh closure per render would tear the subscription down
// and back up on every commit.
const NO_SELECTION_SUBSCRIBE = (): (() => void) => (): void => undefined;
const NO_SELECTION_SNAPSHOT = (): boolean => false;

function listIsScreenSnapshot(selection: SectionSelection): boolean {
  return !selection.hasSelection() && (selection.phoneLanding?.() ?? "list") === "list";
}

/** THE ONE SENTENCE a CONTENT surface appends while its LIST is off screen (#434 · #445 · #446) — the
 *  footnote four section welcomes now carry (presets · databank · characters · chats).
 *
 *  IT HOMES BESIDE THE SIGNAL, not in each feature, because it is spoken by whoever reads
 *  `useSectionListMode` for this exact purpose: four hand-copies of one sentence is how "Show list panel"
 *  drifts into "Show the list panel" in one pane and stops being the topbar's own string. That verbatim
 *  match is load-bearing — WCAG 2.5.3, a voice-control user says what is written, and the topbar's toggle
 *  label IS "Show list panel" (`shell-topbar.tsx`). It is re-spelled here rather than imported from
 *  app-shell for the reason `config-copy.ts` records for its own band word: `client-features-no-cross` bars
 *  a feature from importing app-shell's copy, and `#state` is the tier BOTH sides can legally reach.
 *
 *  It opens with a space: it is APPENDED to a pane's own instruction, never printed alone. */
export const LIST_OFF_SCREEN_HINT = " The list isn't on screen right now — Show list panel in the top bar brings it back.";

/** Is `section` in the mobile LIST-AS-SCREEN arm — does it declare a list with nothing selected, and a LIST
 *  phone landing? The ONE home for that question (`useShellLayout`'s resolve and `useSectionListMode` below
 *  both read it here), and the reason `SectionSelection` is a subscribe/snapshot pair rather than a hook:
 *  this is ONE `useSyncExternalStore` call whose hook identity never varies with the section, so it is legal
 *  above a keyed boundary and answers synchronously on the first render (no effect-published mirror, no
 *  flash). The snapshot is a boolean, so a fresh closure per render is safe; only `subscribe` must be stable. */
export function useSectionListIsScreen(section: SectionId): boolean {
  const definition = useSectionRegistry().get(section);
  const selection = definition.selection;
  return useSyncExternalStore(
    selection?.subscribe ?? NO_SELECTION_SUBSCRIBE,
    selection === undefined ? NO_SELECTION_SNAPSHOT : (): boolean => listIsScreenSnapshot(selection),
  );
}

/** Is a member of `section` open right now? The shell's mobile Back exists only for this: a section that lands
 *  on CONTENT (Corpus Insights, D271) is not in the list-as-screen arm with nothing open, and a Back there
 *  would clear nothing and hide the list door. Same subscribe/snapshot seam as the projection above. */
export function useSectionHasSelection(section: SectionId): boolean {
  const selection = useSectionRegistry().get(section).selection;
  return useSyncExternalStore(selection?.subscribe ?? NO_SELECTION_SUBSCRIBE, selection?.hasSelection ?? NO_SELECTION_SNAPSHOT);
}

/** A section's resolved LIST panel MODE — the narrow #state projection a section body reads instead of
 *  `useShellLayout` (client-features-no-cross bars a feature from importing the app-shell hook, so this tier
 *  is the ONLY legal way for a feature to ask). It is the shell SIGNAL half of the layout: the same
 *  `listMode` the topbar's own toggle label reads, published where a feature can reach it.
 *
 *  IT REPLACES `useListDocked(section, ownDefault)` (#434), and the merge is deliberate rather than a second
 *  seam beside it. That projection's own ruling — "KEPT, not deleted: it is the seam's only sanctioned answer
 *  to 'is my list pane visible', and the alternative (a feature recomposing it from `usePanelOverride` + the
 *  viewport reads) is exactly the hand-copied mirror that produced the M10 bug" — SURVIVES here in full; only
 *  its shape widened, because `docked` is not the question its consumers actually have. The Presets welcome
 *  asks "is the list OFF screen?", and `overlay` is on screen while not being `docked`, so a boolean would
 *  answer it wrong in the one regime (a floating list over the content pane) the copy is about.
 *
 *  THE DEFAULT IS THE REGISTRY'S, not the caller's. `useListDocked` took `ownDefault` as an argument, which
 *  made every call site re-spell its own `panelDefaults.list` — the hand-copied-mirror class one level up
 *  from the M10 bug, and free to drift from the definition the shell actually resolves. The section
 *  definition already carries both the default and the AVAILABILITY pin (a section that declares no list
 *  resolves `collapsed` unconditionally, H3 / arm L-b), so this reads them where `useShellLayout` reads them.
 *
 *  Since the mobile ONE-SHELL rule the answer also depends on the section's own selection seam (a
 *  list-bearing section with nothing open IS docked on a phone — it is the screen), which is why it reads
 *  the registry through the projection above rather than re-deriving anything. */
export function useSectionListMode(section: SectionId): PanelMode {
  const definition = useSectionRegistry().get(section);
  const isFocus = useFocusMode();
  const isMobile = useMobileViewport();
  const isNarrow = useNarrowViewport();
  const openOverlayPanel = useOpenOverlayPanel();
  const listIsScreen = useSectionListIsScreen(section);
  const override = usePanelOverride(section, "list");
  if (definition.list === undefined) {
    return "collapsed";
  }
  const resolved = override ?? definition.panelDefaults.list;
  return resolvePanelMode("list", resolved, { isFocus, isMobile, isNarrow, openOverlayPanel, listIsScreen });
}
