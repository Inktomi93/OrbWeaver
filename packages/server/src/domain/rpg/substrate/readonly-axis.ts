// domain/rpg/substrate/readonly-axis — the honest-arms `trackersReadOnly` derivation (rpg-design/05 §4.6 + the
// delivery-model amendment). PURE (zero I/O): given the resolved delivery MODE and the host connection's model
// capability, decide whether the model has a WRITE PATH for this game's state. The connection RESOLVE + the game
// config read are the composition root's (W1c wires them into the `RpgResolveTrackersReadOnly` injected op); THIS
// is the mode-keyed decision that op delegates to, homed in rpg because the mode→axis mapping is rpg's law.
//
// The axis differs by RESOLVED mode (the amendment §4.6 — NO silent mode-downgrade; the knob is the host's
// deliberate lever, never secretly re-routed):
//   • cheap    — needs `capability.tools` (a dedicated TOOL round: parallel state-tool calls, post-commit).
//   • reliable — needs `capability.output.structured` (a dedicated structured-output extraction round).
// ABSENT (or an unresolved capability) ⇒ readonly = manual-steering: the model gets NO write path, the host
// hand-edits every plane, and those hand values STILL steer via the gather injection (not inert). A caller warns
// on this verdict; the derivation itself is silent truth.

import type { ModelCapability } from "@orb/contracts/connection";
import type { RpgExtractionMode } from "@orb/contracts/rpg";

/** Derive `trackersReadOnly` (= manual-steering: no model write path) from the resolved mode + capability. A
 *  `null` capability (the host connection couldn't be resolved) is readonly by construction — never assume a
 *  write path exists. */
export function deriveTrackersReadOnly(mode: RpgExtractionMode, capability: ModelCapability | null): boolean {
  if (capability === null) {
    return true;
  }
  if (mode === "cheap") {
    return capability.tools === undefined;
  }
  // reliable — the extraction turn needs structured output.
  return capability.output.structured !== true;
}
