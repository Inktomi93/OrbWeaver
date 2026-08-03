// The preset editor's VIEW axis (preset-surface-redesign.md §7 "Mechanics", §16 row 10). The five flat
// views (Params · Prompt · Actions · Data · Transforms) are SECTION STATE, not local `Tabs` state, because
// the CONTEXT panel projects per-view: the eye follows the hand. The ONE writer is the editor's tab strip;
// every other region READS (`usePresetEditorView`) and never sets it — the `contextTab`-seam posture (a
// projection, not a second navigation surface).
//
// Why its own store file rather than a third field on `preset-selection-store.ts`: that file is sealed by
// G27 (`selection-store-via-factory`) to the `createDrillSelectionStore` mint — a `*-selection-store.ts`
// calling the raw `createGatedStore` door is RED, and the drill factory models a primary+secondary DRILL,
// not a view axis. A separate state store is the gate's own sanctioned shape (its `shell-store.ts`
// mustPass row: "a NON-selection state store may call createGatedStore freely").
//
// The view VOCABULARY stays in the feature (`features/preset/lib/preset-nav.ts` — `PRESET_EDITOR_VIEWS`):
// state sits BELOW features in the cake, so the id is carried as a plain string exactly as the drill
// store carries a rack-section id. `null` = nothing picked this session; the tab strip resolves it to the
// first view, so the default lives with the tuple and cannot drift into a re-spelled literal here.
//
// Device-transient, never persisted: landing on Params after a hard reload is the intended reset.

import { createGatedStore } from "./create-gated-store.ts";

interface PresetEditorViewState {
  /** The active editor view id (`null` = unset — the tab strip resolves the tuple's first view). */
  readonly viewId: string | null;
}

const usePresetEditorViewStore = createGatedStore<PresetEditorViewState>("preset-editor-view", () => ({ viewId: null }));

/** THE ONE WRITER — the editor's tab strip. No other surface may call this (§16 row 10). */
export function setPresetEditorView(viewId: string): void {
  usePresetEditorViewStore.setState({ viewId }, false, "presetEditorView/set");
}

/** Reactive: the active editor view (`null` = unset). A primitive selector (no fresh object). */
export function usePresetEditorView(): string | null {
  return usePresetEditorViewStore((s) => s.viewId);
}
