// The Game console's segmented-toggle words and the consequence line beside each toggle: one exhaustive Record
// per closed contracts tuple, so a new member fails tsc here instead of rendering its raw value. Lives in lib/
// because a component module may export components only.

import type { RpgCyoaChoiceBehavior, RpgDateMode, RpgExtractionContext, RpgExtractionMode, RpgStateCaptureVehicle } from "@orb/contracts/rpg";

/** Choice click behavior toggle words. */
export const CHOICE_BEHAVIOR_LABEL: Readonly<Record<RpgCyoaChoiceBehavior, string>> = {
  compose: "Edit first",
  send: "Send now",
};

/** Ambient date mode toggle words. */
export const DATE_MODE_LABEL: Readonly<Record<RpgDateMode, string>> = {
  narrated: "Narrated",
  structured: "Day counter",
};

/** Delivery model toggle words. They name where state gets recorded, never a cost: the cost lives in the
 *  consequence line beside the toggle. */
export const EXTRACTION_MODE_LABEL: Readonly<Record<RpgExtractionMode, string>> = {
  folded: "In the reply",
  cheap: "Separate pass",
};

/** State-capture vehicle toggle words: how the separate pass asks the model for the beat's changes. */
export const STATE_CAPTURE_VEHICLE_LABEL: Readonly<Record<RpgStateCaptureVehicle, string>> = {
  auto: "Automatic",
  tools: "Tool calls",
  structured: "Structured reply",
};

/** Extraction context toggle words. */
export const EXTRACTION_CONTEXT_LABEL: Readonly<Record<RpgExtractionContext, string>> = {
  beat: "Latest beat",
  window: "Recent arc",
  full: "Whole thread",
};

/** The honest one-line consequence per delivery mode (the mock's fact — the same freshness posture the
 *  band cue renders), keyed over the closed mode axis. */
export const EXTRACTION_CONSEQUENCE: Readonly<Record<RpgExtractionMode, string>> = {
  folded: "the reply records its own state — ONE model call, fastest and cheapest (recommended)",
  cheap: "a second pass records state with tools after the turn — two model calls; recommended for local models",
};

/** The CYOA choice-click consequence per behavior (the P5 knob the Scene echo + transcript obey). */
export const CHOICE_BEHAVIOR_CONSEQUENCE: Readonly<Record<RpgCyoaChoiceBehavior, string>> = {
  compose: "a pick drops into the composer — edit before sending",
  send: "a pick sends immediately as your turn",
};

/** The extraction-CONTEXT consequence per arm — how much of the turn's own story the state round reads
 *  as evidence. Keyed over the closed axis, so a new context arm cannot ship without its honest cost line. */
export const EXTRACTION_CONTEXT_CONSEQUENCE: Readonly<Record<RpgExtractionContext, string>> = {
  beat: "only the latest beat — the cheapest read, and the one most likely to miss what set the scene up",
  window: "the recent arc, up to the budget below — relationships and quests evolve instead of resetting",
  full: "the whole thread — the most inference, and the largest prompt every single beat",
};

/** The state-capture vehicle consequence per arm — what the separate pass sends, and what it costs. */
export const STATE_CAPTURE_VEHICLE_CONSEQUENCE: Readonly<Record<RpgStateCaptureVehicle, string>> = {
  auto: "tool calls where the model can be made to call one, one structured reply where it can't — and a structured retry if a tool pass comes back empty",
  tools: "always tool calls — still retried once as a structured reply if the model ignores the tools",
  structured: "always one structured reply, in the shape the model's limits allow — no tool calls at all",
};

/** The #9 date-mode consequence lines (the choice-behavior segmented-toggle precedent). */
export const DATE_MODE_CONSEQUENCE: Readonly<Record<RpgDateMode, string>> = {
  narrated: "The story narrates the date as free text — no day counter.",
  structured: "A running day counter shows beside the time of day.",
};
