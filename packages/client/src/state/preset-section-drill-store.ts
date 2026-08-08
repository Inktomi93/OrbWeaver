// The Prompt view's section DRILL axis (preset-surface-redesign.md §5.2) — which section's consolidated
// EDITOR the center paints, or `null` for the rack. Its own store because the state's whole job is surviving
// a remount the component cannot: the built-in's copy-on-write retarget swaps the editor's `presetId` →
// the keyed `PresetForm` session remounts the WHOLE editor mid-edit, and a LOCAL drill id died there,
// dumping the author from the section editor to the top of the rack mid-sentence (the same F-2 fork-eject
// the Actions template drill already fixed).
//
// IT IS A SCOPED PAIR, NOT A BARE ID — and that is the whole design (graduation verifier, 2026-08-08). The
// first cut stored the section id alone, which leaked ACROSS PRESETS: rack section ids are
// `DEFAULT_PROMPT_CONFIG` literals ("main", "wi-before", …), so collisions between two presets are the NORM,
// and drilling "Main" in preset A then opening preset B dropped the author straight into B's "Main" editor.
// A bare id also cannot tell the two entityId swaps apart — the FORK retarget (drill must SURVIVE) and the
// user picking a different preset (drill must NOT) are the same prop change from the store's point of view.
// Stamping the preset the drill belongs to answers both structurally: the read is scoped, so a foreign
// preset resolves to `null` (the rack) with no reset call anywhere, and carrying a drill across a fork is an
// EXPLICIT re-stamp that only the code which knows a fork happened can perform.
//
// A NON-selection state store minting the raw `createGatedStore` door — the shape G27
// (`selection-store-via-factory`) explicitly sanctions, and the same reason `preset-editor-view-store.ts`
// gives: this is not a primary+secondary DRILL over an entity list, it is a `(preset, section)` position,
// which the drill factory does not model. It is deliberately NOT named `*-selection-store.ts`, because the
// section SELECTION (what the CONTEXT readout echoes) is a different axis living in
// `preset-selection-store.ts` — DRILL implies SELECT, never the reverse (§16 row 19), so one id cannot serve.
//
// The section id is a preset-config-local string, carried plainly exactly as the view store carries a view
// id: state sits BELOW features in the cake. Device-transient, never persisted.

import type { PresetId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

interface PresetSectionDrillState {
  /** The preset the drill belongs to — the SCOPE stamp. `null` together with `sectionId` = the rack. */
  readonly presetId: PresetId | null;
  /** The drilled section id (`null` = the rack is showing). */
  readonly sectionId: string | null;
}

const useDrillStore = createGatedStore<PresetSectionDrillState>("preset-section-drill", () => ({ presetId: null, sectionId: null }));

/** DRILL into a section's consolidated editor (the rack row's chevron / Enter, and the Add flow's auto-drill).
 *  Stamped with the preset it belongs to, so it can never paint over a different preset's rack. */
export function drillPresetSection(presetId: PresetId, sectionId: string): void {
  useDrillStore.setState({ presetId, sectionId }, false, "presetSectionDrill/drill");
}

/** Close the drill-in — the rack stands back up.
 *
 *  Deliberately a PLAIN state write, NOT the drill factory's `clear`: that one also fires
 *  `setOpenOverlayPanel(null)` (the shell's ONE-DOOR-BACK contract for a SECTION's primary selection), and
 *  this drill is a position INSIDE the center pane, not the section's selection. Routing "Back to rack"
 *  through that door made an in-content back button dismiss an open LIST/CONTEXT slide-over on mobile —
 *  a regression the first cut shipped (graduation verifier, 2026-08-08). */
export function closePresetSectionDrill(): void {
  useDrillStore.setState({ presetId: null, sectionId: null }, false, "presetSectionDrill/close");
}

/** Carry an OPEN drill onto a preset that is the SAME editing session under a new id — the built-in's
 *  copy-on-write fork retarget, and nothing else. This is the explicit half of the scope design: the fork is
 *  the one entityId swap where the author is mid-sentence in a section that exists, byte-identical, in the
 *  copy (the server copies the submitted config, section ids intact), so the editor must follow rather than
 *  eject. A no-op when nothing is drilled, so the fork path can call it unconditionally. */
export function retargetPresetSectionDrill(nextPresetId: PresetId): void {
  const { sectionId } = useDrillStore.getState();
  if (sectionId === null) {
    return;
  }
  useDrillStore.setState({ presetId: nextPresetId, sectionId }, false, "presetSectionDrill/retarget");
}

/** Reactive: the section drilled IN `presetId` (`null` = show the rack). SCOPED BY CONSTRUCTION — a drill
 *  stamped for another preset reads as `null` here, which is what makes a cross-preset leak unrepresentable
 *  rather than merely reset-on-time. A primitive selector (no fresh object). */
export function useDrilledPresetSectionId(presetId: PresetId): string | null {
  return useDrillStore((s) => (s.presetId === presetId ? s.sectionId : null));
}
