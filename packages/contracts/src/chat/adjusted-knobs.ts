import { SAMPLER_KNOBS } from "../inference/capability/generation.ts";

/** The knob a `sampling_knob_dropped` adjustment NAMES — a closed subset of `UserIntent`'s own knob field
 *  names (pinned in `tests/legacy/contracts/chat/index.test-d.ts`: every member is a `keyof UserIntent`, so this
 *  tuple cannot drift into naming a setting that does not exist). A CLOSED union rather than free text
 *  BY CONSTRUCTION: the bus's raw-string pin admits exactly two anchored free-text keys and this is not one
 *  of them — the `ReactionEmoji`/`MemoryRecallPhase` precedent. One home; the union derives from it. */
export const ADJUSTED_KNOBS = [
  // Every sampler, from its one home, and the stage order a server may run them in.
  ...SAMPLER_KNOBS,
  "samplerOrder",
  // The quality DIAL (not a sampling knob): dropped when the stored value is not a known quality level.
  "quality",
  // The reasoning token budget, dropped on an effort-mode model that has no budget field.
  "thinkingBudgetTokens",
  // The reply-pictures ask (`text+image`), dropped on a model whose capability produces text only.
  "replyMedia",
  // The reasoning-CARRY rung (§8.8), dropped when the model accepts no replayed thinking back
  // (`capability.reasoning.replay: "none"`) or when reasoning is OFF for this turn — a carry knob on a
  // non-reasoning turn has nothing to carry.
  "carryReasoning",
  // The preset's parallel-tool control, dropped on a wire that exposes none (the agent-sdk Claude runtime).
  "parallelToolCalls",
] as const;
export type AdjustedKnob = (typeof ADJUSTED_KNOBS)[number];
