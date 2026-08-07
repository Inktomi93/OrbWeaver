// createDrillSelectionStore — the ONE mint for a per-section DRILL selection store (UI-Arch §4.2 rule 1/2:
// LIST selection drives CONTENT). Five sections (corpus/analytics/character/preset/world-info) had a
// byte-identical hook-backed store: a primary id (the drilled entity — `null` = the section's overview/
// welcome), plus an OPTIONAL secondary sub-drill (a facet/section/entry inside the primary) and the
// `fromList`/`dismiss` overlay dual-writes that also close an open slide-over. This factory IS that shape,
// composing the sanctioned `createGatedStore` door internally. Sealed by G27 `selection-store-via-factory`:
// a `state/*-selection-store.ts` calling `createGatedStore(` directly (instead of this mint) is RED.

import { createGatedStore } from "./create-gated-store.ts";
import type { SectionSelection } from "./section-registry.ts";
import { setOpenOverlayPanel } from "./shell-store.ts";

interface DrillSelectionState<P extends string, S extends string> {
  /** The drilled primary entity — `null` = the section's overview/welcome home. */
  readonly primaryId: P | null;
  /** The sub-drill inside the primary (facet/section/entry) — `null` = nothing sub-drilled. Always `null`
   *  for a primary-only store (the `secondary` option absent). */
  readonly secondaryId: S | null;
}

/** A primary-only drill store: select/clear the drilled entity + the LIST-callback `selectFromList`. */
export interface PrimaryDrillStore<P extends string> {
  /** Reactive: the drilled primary id (`null` = the overview home). A single-field primitive selector. */
  readonly usePrimaryId: () => P | null;
  /** Drill into `id` (a LIST-row / result click) — CONTENT swaps to it; any sub-drill is cleared. */
  readonly select: (id: P) => void;
  /** Clear the drill (back to the overview/welcome home) — both primary and secondary, AND release any
   *  open LIST slide-over. ONE DOOR BACK (side-eye P2): the shell's mobile back affordance and a surface's
   *  own in-content "Back" both end here, so they cannot land the user in two different states — the
   *  measured split was `corpus-dossier-surface`/`analytics-character-surface` calling `clear*Selection`
   *  without the release while the shell's door called both. Viewport-unaware: the release is a no-op
   *  wherever no slide-over is open. */
  readonly clear: () => void;
  /** `select(id)` AND close any open LIST slide-over (viewport-unaware; a no-op when the LIST is docked). */
  readonly selectFromList: (id: P) => void;
  /** The section-registry SEAM over this store (`SectionSelection`) — how the SHELL asks "is anything open
   *  here?" for the mobile ONE-SHELL rule, and how its back affordance clears it. Published from the mint so
   *  every drill-backed section gets it for free; a section whose `clear` carries extra intent (character's
   *  view-transition + picker-focus reset) spreads this and overrides that one field. */
  readonly selection: SectionSelection;
}

/** A drill store with a secondary sub-drill (facet/section/entry) + the CONTEXT `dismissSecondary` arm. */
export interface DrillSelectionStore<P extends string, S extends string> extends PrimaryDrillStore<P> {
  /** Reactive: the sub-drilled secondary id (`null` = none). A single-field primitive selector. */
  readonly useSecondaryId: () => S | null;
  /** Sub-drill into `id` (a facet/section/entry-row click) — reveals the CONTEXT inspector. */
  readonly selectSecondary: (id: S) => void;
  /** Clear the sub-drill (CONTEXT collapses to its EmptyState). */
  readonly clearSecondary: () => void;
  /** `clearSecondary()` AND close any open CONTEXT slide-over (viewport-unaware; no-op when docked). */
  readonly dismissSecondary: () => void;
}

export function createDrillSelectionStore<P extends string>(name: string): PrimaryDrillStore<P>;
export function createDrillSelectionStore<P extends string, S extends string>(name: string, options: { readonly secondary: true }): DrillSelectionStore<P, S>;
export function createDrillSelectionStore<P extends string, S extends string>(
  name: string,
  _options?: { readonly secondary: true },
): DrillSelectionStore<P, S> {
  const useSelectionStore = createGatedStore<DrillSelectionState<P, S>>(name, (): DrillSelectionState<P, S> => ({ primaryId: null, secondaryId: null }));
  // The ONE clear (see `clear`'s contract): drop the drill AND release the slide-over request, so every
  // "back" in the app — the shell's topbar door, a surface's own in-content Back, a delete's cleanup —
  // lands in exactly one state.
  const clearSelection = (): void => {
    useSelectionStore.setState({ primaryId: null, secondaryId: null }, false, `${name}/clear`);
    setOpenOverlayPanel(null);
  };
  return {
    usePrimaryId: (): P | null => useSelectionStore((s) => s.primaryId),
    select: (id: P): void => useSelectionStore.setState({ primaryId: id, secondaryId: null }, false, `${name}/select`),
    clear: clearSelection,
    selectFromList: (id: P): void => {
      useSelectionStore.setState({ primaryId: id, secondaryId: null }, false, `${name}/select`);
      setOpenOverlayPanel(null);
    },
    useSecondaryId: (): S | null => useSelectionStore((s) => s.secondaryId),
    selectSecondary: (id: S): void => useSelectionStore.setState({ secondaryId: id }, false, `${name}/select-secondary`),
    clearSecondary: (): void => useSelectionStore.setState({ secondaryId: null }, false, `${name}/clear-secondary`),
    dismissSecondary: (): void => {
      useSelectionStore.setState({ secondaryId: null }, false, `${name}/clear-secondary`);
      setOpenOverlayPanel(null);
    },
    selection: {
      subscribe: (onStoreChange: () => void): (() => void) => useSelectionStore.subscribe(onStoreChange),
      hasSelection: (): boolean => useSelectionStore.getState().primaryId !== null,
      // THE SAME function the store exports — one door, by construction rather than by two call sites
      // agreeing to write the same pair.
      clear: clearSelection,
    },
  };
}
