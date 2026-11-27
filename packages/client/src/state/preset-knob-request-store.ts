// A request to land on one knob of the preset editor's Params view, made from outside it (the partial banned-phrase
// notice). The knob that matches takes the request once, scrolls itself into view and takes focus; a Params view that
// draws no such knob drops it, so a request never waits for a later mount.

import { createGatedStore } from "./create-gated-store.ts";

/** The knobs a door can land on: the banned phrase list, whose rewording is the way out of a partial drop. */
export type PresetKnobTarget = "bannedStrings";

interface PresetKnobRequestState {
  readonly requested: PresetKnobTarget | null;
}

const usePresetKnobRequestStore = createGatedStore<PresetKnobRequestState>("preset-knob-request", (): PresetKnobRequestState => ({ requested: null }));

export function requestPresetKnob(knob: PresetKnobTarget): void {
  usePresetKnobRequestStore.setState({ requested: knob }, false, "presetKnobRequest/request");
}

export function clearPresetKnobRequest(): void {
  usePresetKnobRequestStore.setState({ requested: null }, false, "presetKnobRequest/clear");
}

export function useRequestedPresetKnob(): PresetKnobTarget | null {
  return usePresetKnobRequestStore((s) => s.requested);
}
