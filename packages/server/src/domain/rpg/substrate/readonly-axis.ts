// domain/rpg/substrate/readonly-axis — the honest-arms `trackersReadOnly` derivation (rpg-design/05 §4.6 + the
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

import type { ModelCapability } from "@orb/contracts/connection";
import type { RpgEffectiveDelivery, RpgExtractionMode } from "@orb/contracts/rpg";

/** The per-mode WRITER-capability predicate. A mapped Record, not a switch — a new `RpgExtractionMode` member
 *  without a row is a tsc error (§5.5 string-union dispatch discipline), so the honest-arms verdict can never
 *  silently inherit another mode's answer. */
const HAS_WRITE_PATH: Readonly<Record<RpgExtractionMode, (capability: ModelCapability) => boolean>> = {
  cheap: (capability) => hasToolWriter(capability),
  folded: (capability) => hasToolWriter(capability),
};

/** Does this connection have the TOOL-CALL write path (wire `tools[]`)? The vehicle both delivery modes ride,
 *  and the host `resyncFromStory` catch-up round's first choice as well: a multi-call tool
 *  round asks for one SMALL schema per plane instead of one 46-optional monolith, which is what the hosted
 *  grammar walls are made of. Same fail-closed contract as the rest of this module. */
export function hasToolWriter(capability: ModelCapability | null): boolean {
  return capability !== null && capability.tools !== undefined;
}

/** Derive `trackersReadOnly` (= manual-steering: no model write path) from the resolved mode + capability. A
 *  `null` capability (the host connection couldn't be resolved) is readonly by construction — never assume a
 *  write path exists. */
export function deriveTrackersReadOnly(mode: RpgExtractionMode, capability: ModelCapability | null): boolean {
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
  verdicts: { readonly trackersReadOnly: boolean; readonly foldGuarded: boolean },
): RpgEffectiveDelivery {
  if (verdicts.trackersReadOnly) {
    // No model write path at all — the flush returns before any vehicle runs (the F2 gate). Neither "Live" nor
    // "one beat behind" is true of a game nothing writes; the read-only pill is the honest label there.
    return { path: "none", fallbackReason: null };
  }
  if (mode === "folded" && verdicts.foldGuarded) {
    return { path: "tool-round", fallbackReason: "local-engine-fold-guard" };
  }
  return { path: mode === "folded" ? "folded" : "tool-round", fallbackReason: null };
}

/** Does this connection have the STRUCTURED-OUTPUT write path? The gate for the two vehicles that are NOT a
 *  per-turn delivery mode and therefore key on capability alone, not on the host's knob: the host `resyncFromStory`
 *  rebuild, and the agent-sdk degrade a tool-vehicle mode falls into when the wire carries no `tools[]`. Same
 *  fail-closed contract as `deriveTrackersReadOnly` — an unresolved capability has no write path. */
export function hasStructuredWriter(capability: ModelCapability | null): boolean {
  return capability !== null && capability.output.structured === true;
}
