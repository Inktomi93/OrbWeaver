// The preset-SELECTION store (W10 Panel A · UI-Arch §4.2 rule 1: LIST selection drives CONTENT). Holds
// which preset the Presets rail section has open — the route reads it to render the tabbed editor in
// CONTENT (else the teaching welcome). Its own per-section concern, remembered independently (§4.2 rule 2),
// mirroring character-selection-store (the Characters section's own selection). NOT persisted
// (`createGatedStore`): a transient device-local UI selection — landing back on the section welcome after a
// hard reload is fine (state-law recap, UI-Arch §5). One field, well under the ≤10-field cap; a non-null id
// IS "a preset is open".

import type { PresetId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";
import { setMobileSheet } from "./shell-store";

interface PresetSelectionState {
  /** The preset whose editor the Presets CONTENT shows — `null` = the section's welcome state. */
  readonly selectedPresetId: PresetId | null;
  /** The rack SECTION the CONTEXT inspector shows (The Assembly §2.2) — `null` = nothing selected
   *  (CONTEXT collapsed + EmptyState). A section id (not branded — section ids are preset-config-local
   *  strings, not a `@orb/kit/ids` entity id). */
  readonly selectedSectionId: string | null;
}

const usePresetSelectionStore = createGatedStore<PresetSelectionState>(
  "preset-selection",
  (): PresetSelectionState => ({ selectedPresetId: null, selectedSectionId: null }),
);

/** Open a preset (a library-row click) — the route swaps CONTENT to that preset's tabbed editor. Opening
 *  a DIFFERENT preset clears the section selection so a stale section never carries across presets. */
export function selectPreset(id: PresetId): void {
  usePresetSelectionStore.setState(
    { selectedPresetId: id, selectedSectionId: null },
    false,
    "preset-selection/select",
  );
}

/** Open a preset from the LIST (a library-row click) AND close any open mobile LIST sheet — the
 *  viewport-unaware intent form of the old route-closure `selectPresetFromList`: `mobileSheet` is
 *  read only in the mobile regime (`useShellLayout`), so the unconditional write is a no-op on desktop. */
export function selectPresetFromList(id: PresetId): void {
  selectPreset(id);
  setMobileSheet(null);
}

/** Clear the selection (back to the Presets welcome state — e.g. after deleting the open preset). Clears
 *  the section too (a welcome state has no section to inspect). */
export function clearPresetSelection(): void {
  usePresetSelectionStore.setState(
    { selectedPresetId: null, selectedSectionId: null },
    false,
    "preset-selection/clear",
  );
}

/** Select a rack section — a row's name-button click reveals the CONTEXT section inspector (§2.2/§3.4). */
export function selectPresetSection(id: string): void {
  usePresetSelectionStore.setState(
    { selectedSectionId: id },
    false,
    "preset-selection/select-section",
  );
}

/** Clear the section selection — CONTEXT collapses to its EmptyState (also fired on section delete). */
export function clearPresetSection(): void {
  usePresetSelectionStore.setState(
    { selectedSectionId: null },
    false,
    "preset-selection/clear-section",
  );
}

/** Dismiss the CONTEXT section inspector AND close any open mobile CONTEXT sheet — the viewport-unaware
 *  intent form of the old route-closure `dismissSectionInspector`: `setMobileSheet(null)` is a no-op on
 *  desktop (mirrors `selectPresetFromList` / worldInfo's `selectWorldBookFromList`). */
export function dismissPresetSection(): void {
  clearPresetSection();
  setMobileSheet(null);
}

/** Reactive: the currently-open preset id (`null` = none). A primitive selector (no fresh object). */
export function useSelectedPresetId(): PresetId | null {
  return usePresetSelectionStore((s) => s.selectedPresetId);
}

/** Reactive: the currently-selected rack section id (`null` = none). A primitive selector. */
export function useSelectedPresetSectionId(): string | null {
  return usePresetSelectionStore((s) => s.selectedSectionId);
}
