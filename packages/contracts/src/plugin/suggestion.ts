// @orb/contracts/plugin/suggestion — the PLUGIN-ORIGIN posture-2 act: what a non-host plugin ASKED to do,
// held until a host answers. Homed in contracts because it crosses TWO domains — `domain/plugin` mints it at
// the membrane and executes it on confirm, `domain/automation` stores it in the ONE S4 inbox and hands it back
// — and neither may import the other (the cake). The shape is JSON-safe and inert: it names an act, it does
// not carry a closure, a principal, or anything that could execute by itself.
//
// THE THREE-POSTURE LAW IT IMPLEMENTS (interaction spec §3-S4, the #14 law over rules, plugins joining):
// standing authority ⇒ act directly; NO standing authority ⇒ a SUGGESTION the host confirms; the fourth
// posture — direct execution without standing authority — never exists. Before this, a plugin whose installer
// was not host of the invocation chat got a flat refusal from the membrane, which is posture 3 wearing
// posture 2's clothes: safe, but it made "ask" unexpressible and pushed authors toward installing under a
// host account.
//
// WHY ONLY THREE ACTS, when FIVE membrane ops sit behind the same `canWrite` gate. The other two are
// deliberately left as refusals and the reasons are not laziness:
//   • `chat.applyVariableOps` (`set_variable`) — a variable delta is not a human-weighable act. The card
//     would read "set tension to 5?", which a host cannot evaluate without knowing what the plugin means by
//     tension; and it is the HIGHEST-FREQUENCY write in the set (a plugin tracking state writes on every
//     event), so posture 2 there converts a clean refusal into an attention flood against §3-S4's
//     one-visible-card budget. It is also the only one of the five whose automation twin is NOT already a
//     `confirmFirst` arm — making it suggestible would widen `SuggestibleArmType` and its coupled sites to
//     ship a card nobody can answer well.
//   • `chat.surfaceQuickReply` — chips are TRANSIENT display strings with no row, and their entire value is
//     immediacy. An ask that the host reads, then approves so the text can appear as a chip, has already
//     shown the host the text: the card IS the chip, delivered late. Refusal stays correct.
// Both refusals are stated in `infra/plugin-host/membrane.ts` at the site, so the next reader finds the
// reason where they find the code.
//
// Every act here maps onto an existing `confirmFirst` automation arm, so the host-facing question a plugin
// raises is one the product already knows how to ask.

import type { GenerateImageActionArgs } from "#imagery";
import type { PluginWorldEntryUpsert } from "./host-v1.ts";

/** The closed act axis, in the order a summary table must cover. A new member widens
 *  {@link PluginSuggestedAct} and fails `tsc` at the summary Record until it is given a question a human can
 *  answer (§5.5 string-union dispatch — one importable union, one mapped-type Record). */
export const PLUGIN_SUGGESTED_ACT_KINDS = ["requestTurn", "worldInfoUpsert", "generatePicture"] as const;
export type PluginSuggestedActKind = (typeof PLUGIN_SUGGESTED_ACT_KINDS)[number];

/** ONE stashed plugin act. Inert by construction: the executing side rebuilds the plugin's own bridge from the
 *  `pluginId`/installer the STORE holds, so nothing here names an authority, a funder, or a connection — a
 *  record that could name its own executor would be a capability sitting in a map. */
export type PluginSuggestedAct =
  | {
      readonly kind: "requestTurn";
      /** The CHILD cascade depth to stamp, computed at the membrane the same way the direct path computes it
       *  (invocation depth + 1). Frozen at ASK time, not re-derived at confirm: the confirmed act must be the
       *  act the host was shown, and the loop-prevention ceiling must not be re-based by the delay. */
      readonly automationDepth: number;
      /** The guest's speaker hint, unbranded like every other plugin SANDBOX wire field — an untrusted guest's
       *  JSON, branded only after the host parses it. It carries NO foreign-id exemption marker on purpose:
       *  `brand-in-name-position` does not flag an OPTIONAL bare-string position, and a marker that exempts
       *  nothing is a stale lie the next bare-string id written here would silently inherit. */
      readonly speakerCharacterId?: string;
      readonly guided?: string;
    }
  | { readonly kind: "worldInfoUpsert"; readonly entry: PluginWorldEntryUpsert }
  | { readonly kind: "generatePicture"; readonly args: GenerateImageActionArgs };

/** The host-facing QUESTION for one act — a mapped-type Record over the kind union, so an act with no
 *  question fails `tsc` here (the `summarizeSuggestibleArm` precedent, in the shape that file could not use:
 *  these kinds are camelCase, so a Record trips no naming-convention suppression).
 *
 *  Each reads as a question about a CONCRETE act, never a capability label, and it NAMES THE PLUGIN — a host
 *  answering "should this happen" is entitled to know who is asking, and a plugin ask is the one card class
 *  whose requester is not a rule the host wrote themselves. */
const PLUGIN_ACT_QUESTION: Record<PluginSuggestedActKind, (act: PluginSuggestedAct, pluginName: string) => string> = {
  requestTurn: (act, pluginName) => {
    const steer = act.kind === "requestTurn" ? (act.guided ?? "").trim() : "";
    return steer.length === 0 ? `“${pluginName}” wants to take a turn in the room. Allow it?` : `“${pluginName}” wants to take a turn: “${steer}”. Allow it?`;
  },
  worldInfoUpsert: (act, pluginName) =>
    `“${pluginName}” wants to save a lore entry for “${act.kind === "worldInfoUpsert" ? act.entry.entryKey : ""}”. Allow it?`,
  generatePicture: (act, pluginName) => `“${pluginName}” wants to illustrate the scene (${act.kind === "generatePicture" ? act.args.mode : ""}). Allow it?`,
};

/** Render the ask. The caller caps it to the shared suggestion-summary length. */
export function summarizePluginAct(act: PluginSuggestedAct, pluginName: string): string {
  return PLUGIN_ACT_QUESTION[act.kind](act, pluginName);
}
