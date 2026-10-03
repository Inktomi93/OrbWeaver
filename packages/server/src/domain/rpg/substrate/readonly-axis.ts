// domain/rpg/substrate/readonly-axis — the honest-arms `trackersReadOnly` derivation (docs/plans/rpg/design.md + the
// delivery-model amendment). PURE (zero I/O): given the resolved delivery MODE and the host connection's model
// capability, decide whether the model has a WRITE PATH for this game's state. The connection RESOLVE + the game
// config read are the composition root's (W1c wires them into the `RpgResolveTrackersReadOnly` injected op); THIS
// is the mode-keyed decision that op delegates to, homed in rpg because the mode→axis mapping is rpg's law.
//
// The axis differs by RESOLVED mode (the amendment §4.6 — NO silent mode-downgrade; the knob is the host's
// deliberate lever, never secretly re-routed):
//   • cheap    — needs `capability.tools` (a dedicated TOOL round: parallel state-tool calls, post-commit).
//   • folded   — needs `capability.tools` too (the R1 fold mounts the SAME tools on the character turn; a
//                connection that cannot carry wire `tools[]` on a chat turn falls back to cheap's post-commit
//                round, which needs the identical capability — so ONE verdict covers both delivery shapes).
// (The third mode, a dedicated structured-output round, was DELETED — owner ruling; the structured
// WRITE PATH itself survives as the agent-sdk degrade + the host resync, whose gate is `hasStructuredWriter`.)
// ABSENT (or an unresolved capability) ⇒ readonly = manual-steering: the model gets NO write path, the host
// hand-edits every plane, and those hand values STILL steer via the gather injection (not inert). A caller warns
// on this verdict; the derivation itself is silent truth.

import type { GenerationCapability } from "@orb/contracts/inference";
import { acceptsRequiredToolChoice, fitsEveryWire } from "@orb/contracts/inference";
import type { RpgEffectiveDelivery, RpgExtractionMode, RpgStateCaptureVehicle, RpgStructuredRoundShape, RpgToolCall } from "@orb/contracts/rpg";
import { malformedToolCalls, RPG_STRUCTURED_ROUND_SHAPES, RPG_TOOL_ROUND_TOOL_NAMES } from "@orb/contracts/rpg";

/** The per-mode WRITER-capability predicate. A mapped Record, not a switch — a new `RpgExtractionMode` member
 *  without a row is a tsc error (§5.5 string-union dispatch discipline), so the honest-arms verdict can never
 *  silently inherit another mode's answer. */
const HAS_WRITE_PATH: Readonly<Record<RpgExtractionMode, (capability: GenerationCapability) => boolean>> = {
  cheap: (capability) => hasToolWriter(capability),
  folded: (capability) => hasToolWriter(capability),
};

/** Does this connection have the TOOL-CALL write path (wire `tools[]`)? The vehicle both delivery modes ride,
 *  and the host `resyncFromStory` catch-up round's first choice as well: a multi-call tool
 *  round asks for one SMALL schema per plane instead of one 46-optional monolith, which is what the hosted
 *  grammar walls are made of. Same fail-closed contract as the rest of this module. */
export function hasToolWriter(capability: GenerationCapability | null): boolean {
  return capability !== null && capability.tools !== undefined;
}

/** Derive `trackersReadOnly` (= manual-steering: no model write path) from the resolved mode + capability. A
 *  `null` capability (the host connection couldn't be resolved) is readonly by construction — never assume a
 *  write path exists. */
export function deriveTrackersReadOnly(mode: RpgExtractionMode, capability: GenerationCapability | null): boolean {
  return capability === null || !HAS_WRITE_PATH[mode](capability);
}

/** EFF-3 — derive the room's EFFECTIVE state delivery from the knob + the SAME two verdicts the flush and the
 *  gather already gate on. This is the honest twin of the flush's `foldFallbackReason`: that one reads the
 *  COMPLETED turn's own wire, this one reads the room connection the next turn will resolve to — and for the
 *  `local-engine-fold-guard` arm they are the SAME fact by construction, because the gather's pre-commit mount
 *  decision gates on exactly this `foldGuarded` bit (D112 as amended). So the panel states what the room does,
 *  never a guess at what the model will do.
 *
 *  What it deliberately does NOT claim: `no-terminal-channel`. That arm is only knowable AFTER a turn hands back
 *  a `null` channel (an unbuildable mount / a hook miss) and nothing persists it, so it stays a log-only fact —
 *  a room in that state reads `folded` here and its WARN line is the trail. Surfacing a maybe here would trade
 *  one lie for another. */
export function deriveEffectiveDelivery(
  mode: RpgExtractionMode,
  verdicts: { readonly trackersReadOnly: boolean; readonly foldGuarded: boolean; readonly structuredUnavailable: boolean },
): RpgEffectiveDelivery {
  if (verdicts.trackersReadOnly) {
    // No model write path at all — the flush returns before any vehicle runs (the F2 gate). Neither "Live" nor
    // "one beat behind" is true of a game nothing writes; the read-only pill is the honest label there.
    return { path: "none", fallbackReason: null, structuredUnavailable: false };
  }
  if (mode === "folded" && !verdicts.foldGuarded) {
    return { path: "folded", fallbackReason: null, structuredUnavailable: false };
  }
  // A post-commit round runs: the fold guard and an unhonoured `structured` knob are independent facts, both shown.
  return {
    path: "tool-round",
    fallbackReason: mode === "folded" ? "local-engine-fold-guard" : null,
    structuredUnavailable: verdicts.structuredUnavailable,
  };
}

/** Does the game's state-capture knob ask for a structured round this wire cannot give (no structured output)? The
 *  room-level twin of the round's own `rpg.toolround.vehicle_fallback` warn: both read the same capability, and the
 *  patch-list shape carries no optional or union-typed property, so structured output alone decides it. */
export function structuredVehicleUnavailable(vehicle: RpgStateCaptureVehicle, capability: GenerationCapability | null): boolean {
  return vehicle === "structured" && !hasStructuredWriter(capability);
}

/** Does this connection have the STRUCTURED-OUTPUT write path? The gate for the two vehicles that are NOT a
 *  per-turn delivery mode and therefore key on capability alone, not on the host's knob: the host `resyncFromStory`
 *  rebuild, and the agent-sdk degrade a tool-vehicle mode falls into when the wire carries no `tools[]`. Same
 *  fail-closed contract as `deriveTrackersReadOnly` — an unresolved capability has no write path. */
export function hasStructuredWriter(capability: GenerationCapability | null): boolean {
  return capability !== null && capability.output.structured === true;
}

/** Which structured shapes fit this row's grammar ceilings (`output.structuredLimitsFrom`), keyed by shape. A
 *  THUNK at the call sites below, so a row that never needs a structured round never builds its schemas. */
type StructuredShapeFits = () => Readonly<Record<RpgStructuredRoundShape, boolean>>;

/** Which of the round's two structured schemas fit the row's grammar ceilings on every wire it might ride. A row
 *  that names no ceiling (`output.structuredLimitsFrom` absent) fits both. */
export function structuredShapeFits(
  capability: GenerationCapability,
  schemas: Readonly<Record<RpgStructuredRoundShape, Record<string, unknown>>>,
): Readonly<Record<RpgStructuredRoundShape, boolean>> {
  const limitsFrom = capability.output.structuredLimitsFrom;
  return { union: fitsEveryWire([schemas.union], limitsFrom).fits, patch: fitsEveryWire([schemas.patch], limitsFrom).fits };
}

/** The first shape the row's grammar fits, or `null` (no structured output, or nothing fits). */
function fittingShape(capability: GenerationCapability, fits: StructuredShapeFits): RpgStructuredRoundShape | null {
  if (!hasStructuredWriter(capability)) {
    return null;
  }
  const fit = fits();
  return RPG_STRUCTURED_ROUND_SHAPES.find((shape) => fit[shape]) ?? null;
}

/** The dedicated state round's PRIMARY vehicle: a structured shape, or `null` for the tool round. Per the game's
 *  knob ({@link RpgStateCaptureVehicle}): `tools` never leaves tools; `structured` takes whichever shape fits;
 *  `auto` takes the structured round only where the row cannot be forced to call a tool AND the round's tools fit
 *  its grammar verbatim (the union shape). A row whose grammar needs the flattened patch list keeps its tool round
 *  under `auto`, and reaches the patch list only through {@link fallbackStateRound} or an explicit `structured`. */
export function primaryStateRound(
  vehicle: RpgStateCaptureVehicle,
  capability: GenerationCapability,
  fits: StructuredShapeFits,
): RpgStructuredRoundShape | null {
  if (vehicle === "tools") {
    return null;
  }
  if (vehicle === "structured") {
    return fittingShape(capability, fits);
  }
  return !acceptsRequiredToolChoice(capability) && fittingShape(capability, fits) === "union" ? "union" : null;
}

/** A call the fold can use: a state tool (or `no_changes`) whose args parse. An invented tool name is not one. */
function isUsableCall(call: RpgToolCall): boolean {
  return (RPG_TOOL_ROUND_TOOL_NAMES as readonly string[]).includes(call.name) && malformedToolCalls([call]).length === 0;
}

/** The structured RETRY after a tool round, or `null`: only where the round's `required` went out as `auto` (the
 *  row cannot be forced) and it came back with no usable call — none, only malformed ones, or only names that are
 *  not state tools — so state capture would otherwise hang on a model that chose not to call. Never after a real
 *  `no_changes`: that is the model answering, not ignoring. */
export function fallbackStateRound(capability: GenerationCapability, calls: readonly RpgToolCall[], fits: StructuredShapeFits): RpgStructuredRoundShape | null {
  if (acceptsRequiredToolChoice(capability) || calls.some(isUsableCall)) {
    return null;
  }
  return fittingShape(capability, fits);
}
