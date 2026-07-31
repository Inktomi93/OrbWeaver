// The GM-console SCALAR form model (panel-redesign DESIGN.md §4 "Game" — the host-admin console). The
// autosave form owns the flat scalar knobs (steering note · delivery model · the deception toggles); the
// array/record sub-editors (cast-field schemas, relationship hints, orb-pinning) call `updateConfig` with
// path-scoped patches directly (§12.3 Tier-3 — one path per commit), NOT through this form. Keeping the
// two apart is deliberate: a flat form can't express a growable schema array, and a whole-object autosave
// of the array knobs would fight the per-row edits.
//
// The form↔wire mapping lives here (the room-overrides precedent): the surface deals in `RpgConfigView` +
// the `updateConfig` patch shape, never the form's own value bag.

import type { RpgConfigView, RpgDateMode, RpgExtractionMode } from "@orb/contracts/rpg";

type CyoaChoiceBehavior = RpgConfigView["cyoaChoiceBehavior"];

/** The console's flat scalar values (the autosave form's bag). P5 adds the play-style knobs (`cyoa`
 *  standing mode + `cyoaChoiceBehavior` — the compose|send choice-click knob — + the wand Plot submenu
 *  gate) — same autosave pattern as the deception toggles. */
export interface GmConsoleFormValues {
  readonly steeringNote: string;
  readonly extractionMode: RpgExtractionMode;
  readonly deception: boolean;
  readonly omniscience: boolean;
  readonly cyoa: boolean;
  readonly cyoaChoiceBehavior: CyoaChoiceBehavior;
  readonly plotProgression: boolean;
  /** The #9 ambient-date mode — narrated (freeform date string) | structured (day counter). */
  readonly dateMode: RpgDateMode;
}

export const EMPTY_GM_CONSOLE_FORM: GmConsoleFormValues = {
  steeringNote: "",
  extractionMode: "folded",
  deception: false,
  omniscience: false,
  cyoa: false,
  cyoaChoiceBehavior: "compose",
  plotProgression: true,
  dateMode: "narrated",
};

/** Project the host config read into the form's scalar bag. */
export function toGmConsoleForm(config: RpgConfigView): GmConsoleFormValues {
  return {
    steeringNote: config.steeringNote,
    extractionMode: config.extractionMode,
    deception: config.deception,
    omniscience: config.omniscience,
    cyoa: config.cyoa,
    cyoaChoiceBehavior: config.cyoaChoiceBehavior,
    plotProgression: config.plotProgression,
    dateMode: config.dateMode,
  };
}

/** The `updateConfig` patch for the scalar bag — the steering note rides `patch.steeringNote`; the
 *  extraction mode + deception knobs are top-level/`patch`-level per the wire schema. */
export interface GmConsoleScalarPatch {
  readonly patch: {
    readonly steeringNote: string;
    readonly deception: boolean;
    readonly omniscience: boolean;
    readonly cyoa: boolean;
    readonly cyoaChoiceBehavior: CyoaChoiceBehavior;
    readonly plotProgression: boolean;
    readonly dateMode: RpgDateMode;
  };
  readonly extractionMode: RpgExtractionMode;
}

export function fromGmConsoleForm(values: GmConsoleFormValues): GmConsoleScalarPatch {
  return {
    patch: {
      steeringNote: values.steeringNote,
      deception: values.deception,
      omniscience: values.omniscience,
      cyoa: values.cyoa,
      cyoaChoiceBehavior: values.cyoaChoiceBehavior,
      plotProgression: values.plotProgression,
      dateMode: values.dateMode,
    },
    extractionMode: values.extractionMode,
  };
}
