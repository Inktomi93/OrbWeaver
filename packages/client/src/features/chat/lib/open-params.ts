// The door to a preset's Params view, where the Capability card says what the connected model honors. The warning notice
// and the composer's failure line both open it. A door that names a setting asks the view to land on its knob.

import type { PresetId } from "@orb/kit/ids";
import type { PresetKnobTarget } from "#state";
import { requestPresetKnob, selectPreset, setActiveSection, setPresetEditorView } from "#state";

// The Params view is named by its id in the preset editor's view tuple.
const PARAMS_VIEW = "params";

export function openPresetParams(presetId: PresetId, knob?: PresetKnobTarget): void {
  selectPreset(presetId);
  setPresetEditorView(PARAMS_VIEW);
  if (knob !== undefined) {
    requestPresetKnob(knob);
  }
  setActiveSection("presets");
}
