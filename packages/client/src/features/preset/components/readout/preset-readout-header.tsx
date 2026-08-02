// The Presets CONTEXT-panel band identity (north-star §4 N4 / P4, via the `single` context's `header`
// slot) — crunch item 11.
//
// The band read the neutral "Details" while the panel below it swapped its WHOLE content per editor view
// (§7): Budget/Pivot/Preview in Prompt, the delivery path in Actions, the effective profile in Params. A
// band that names none of them is a label doing no work — and the mocks name what they read
// ("ACTIONS · READOUT"). So the band states the projection: the ACTIVE VIEW's own label, then the
// invariant half of the panel's job.
//
// It READS the view store and never writes it (§7 pin 1 — the tab strip is the one writer, §16 row 10),
// and it resolves an unset read through the same `PRESET_EDITOR_VIEWS[0]` default the strip does, so the
// band and the strip can never name different views.

import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { usePresetEditorView, useSelectedPresetId } from "#state";
import { PRESET_EDITOR_VIEWS } from "../../lib/preset-nav";

/** The suffix naming what this pane always is, whatever it is currently projecting. */
const READOUT_SUFFIX = "readout";

/** THE NO-SELECTION ARM'S OWN NAME (side-eye F-25). With no preset open, the panel below does not project a
 *  view at all — it is `PresetReadout`'s ACTIVE PRESET / EFFECTIVE GENERATION / CAPABILITY arm — while this
 *  band went on naming whichever editor view the store happened to hold ("Params readout"). A header that
 *  names a view the body is not showing is the same class of lie as a readout bound to the wrong template
 *  (F-2); the band reads the SAME selection the panel does, so the two cannot disagree. The string is the
 *  panel's own first kicker, verbatim. */
const NO_SELECTION_LABEL = "Active preset";

export function PresetReadoutHeader(): ReactElement {
  const presetId = useSelectedPresetId();
  const view = usePresetEditorView();
  const entry = PRESET_EDITOR_VIEWS.find((candidate) => candidate.id === view) ?? PRESET_EDITOR_VIEWS[0];
  const label = presetId === null ? NO_SELECTION_LABEL : (entry?.label ?? "Preset");
  return (
    <Row align="baseline" className="min-w-0" gap="field">
      <Text className="truncate text-title leading-title font-semibold">{label}</Text>
      <Text voice="gloss">{READOUT_SUFFIX}</Text>
    </Row>
  );
}
