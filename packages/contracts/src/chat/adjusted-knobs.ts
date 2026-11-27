import { SAMPLER_KNOBS } from "../inference/capability/generation.ts";

/** The knob a `sampling_knob_dropped` adjustment NAMES — a closed subset of `UserIntent`'s own knob field
 *  names (every member is a `keyof UserIntent`, so this
 *  tuple cannot drift into naming a setting that does not exist). A CLOSED union rather than free text
 *  BY CONSTRUCTION: the bus's raw-string pin admits exactly two anchored free-text keys and this is not one
 *  of them — the `ReactionEmoji`/`MemoryRecallPhase` precedent. One home; the union derives from it. */
export const ADJUSTED_KNOBS = [
  // Every sampler, from its one home, and the stage order a server may run them in.
  ...SAMPLER_KNOBS,
  "samplerOrder",
  // The antislop proxy's slop list and its strength: stated only where the connection declares the proxy.
  "slopList",
  "slopStrength",
  // The quality DIAL (not a sampling knob): dropped when the stored value is not a known quality level.
  "quality",
  // The reasoning token budget, dropped on an effort-mode model that has no budget field.
  "thinkingBudgetTokens",
  // The reply-pictures ask (`text+image`), dropped on a model whose capability produces text only.
  "replyMedia",
  // The reasoning-CARRY rung, dropped when the model accepts no replayed thinking back
  // (`capability.reasoning.replay: "none"`) or when reasoning is OFF for this turn — a carry knob on a
  // non-reasoning turn has nothing to carry.
  "carryReasoning",
  // The preset's parallel-tool control, dropped on a wire that exposes none (the agent-sdk Claude runtime).
  "parallelToolCalls",
] as const;
export type AdjustedKnob = (typeof ADJUSTED_KNOBS)[number];

/** How a knob reads to the user: its name as the preset deck prints it, and whether that name is a plural noun, so a sentence
 *  that takes the name for its subject agrees with it. The number is stated beside the name because no rule reads it off the
 *  words ("Word bias" is one knob, "Banned phrases" are several). One home for every surface that names a knob, exhaustive
 *  over {@link ADJUSTED_KNOBS}, so a new knob is named, and given its number, here before it can reach a notice. */
export const ADJUSTED_KNOB_NAMES: Readonly<Record<AdjustedKnob, { readonly label: string; readonly plural: boolean }>> = {
  adaptiveDecay: { label: "Adaptive-P decay", plural: false },
  adaptiveTarget: { label: "Adaptive-P target", plural: false },
  banEos: { label: "Ban end of reply", plural: false },
  bannedStrings: { label: "Banned phrases", plural: true },
  carryReasoning: { label: "Reasoning carry", plural: false },
  dryAllowedLength: { label: "DRY allowed length", plural: false },
  dryBase: { label: "DRY base", plural: false },
  dryMultiplier: { label: "DRY strength", plural: false },
  dryPenaltyLastN: { label: "DRY range", plural: false },
  drySequenceBreakers: { label: "DRY sequence breakers", plural: true },
  dynatempExponent: { label: "Dynamic temperature exponent", plural: false },
  dynatempRange: { label: "Dynamic temperature range", plural: false },
  frequencyPenalty: { label: "Frequency penalty", plural: false },
  logitBias: { label: "Word bias", plural: false },
  minKeep: { label: "Min keep", plural: false },
  minP: { label: "Min-P", plural: false },
  mirostatEta: { label: "Mirostat eta", plural: false },
  mirostatMode: { label: "Mirostat", plural: false },
  mirostatTau: { label: "Mirostat tau", plural: false },
  parallelToolCalls: { label: "Parallel tool calls", plural: true },
  presencePenalty: { label: "Presence penalty", plural: false },
  quality: { label: "Quality", plural: false },
  repetitionPenalty: { label: "Repetition penalty", plural: false },
  repetitionPenaltyRange: { label: "Repetition range", plural: false },
  replyMedia: { label: "Reply pictures", plural: true },
  samplerOrder: { label: "Sampler order", plural: false },
  seed: { label: "Seed", plural: false },
  slopList: { label: "Slop list", plural: false },
  slopStrength: { label: "Slop strength", plural: false },
  smoothingCurve: { label: "Smoothing curve", plural: false },
  smoothingFactor: { label: "Smoothing factor", plural: false },
  stop: { label: "Stop sequences", plural: true },
  temperature: { label: "Temperature", plural: false },
  thinkingBudgetTokens: { label: "Thinking budget", plural: false },
  topA: { label: "Top-A", plural: false },
  topK: { label: "Top-K", plural: false },
  topNSigma: { label: "Top-nσ", plural: false },
  topP: { label: "Top-P", plural: false },
  typicalP: { label: "Typical-P", plural: false },
  xtcProbability: { label: "XTC chance", plural: false },
  xtcThreshold: { label: "XTC threshold", plural: false },
};

/** Why a banned-phrase drop happened, when the user can act on it. A closed union, never free text: the chat bus
 *  reaches every member of the room, and the phrases themselves are the host's. `sequence` = the server cannot ban the
 *  phrase as a sequence mid-sentence (llama.cpp bans every token of a phrase; vLLM bans only its space-less form);
 *  `tokenizer` = the server's tokenizer could not be asked, so no phrase could be checked. A drop with no cause is
 *  the connection stating no phrase ban at all. */
export const BANNED_PHRASE_CAUSES = ["sequence", "tokenizer"] as const;
export type BannedPhraseCause = (typeof BANNED_PHRASE_CAUSES)[number];
