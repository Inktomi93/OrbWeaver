// domain/chat/contract/arbitration — the cross-module CONTRACT types for the 7a/7b arbitration + auto-mode +
// the group round driver. Homed under `contract/` per the `types-in-contract` gate
// (an exported feature type lives here, never inline on an engine file). The *Params shapes stay file-local
// to each engine module (callers pass literals) — only the types SHARED across modules/tests live here.

// SpeakerRef + speakerKey (the cross-cutting speaker identity) are promoted to `@orb/contracts/chat` (D60) —
// the assembly per-speaker card selection consumes them off `AssembleContext`, not just arbitration. Consumers
// import them straight from the contract.
import type { MessageView, SpeakerRef } from "@orb/contracts/chat";

/** One candidate the 7a/7b arbitration ranks — a present AI-driven `chat_participants` row's
 *  arbitration-relevant fields (the caller maps `loadRoster` rows; `isAiDriven` gates the set). Humans are
 *  excluded UPSTREAM (they post free-form; §6 schedules only AI-driven kinds). */
export interface ArbiterCandidate {
  /** WHO this candidate is (character or agent) — the selection + attribution identity. */
  readonly ref: SpeakerRef;
  /** 0–1 sampling weight for `natural` (default `TALKATIVENESS_DEFAULT` = 0.5). */
  readonly talkativeness: number;
  /** Muted: still contributes cards/WI, but never arbiter-selected (`isArbiterEligible` — §1). */
  readonly disabled: boolean;
  /** `leftSeq IS NULL` ⇒ present (a gone member is never eligible). */
  readonly leftSeq: number | null;
}

/** A `{ref, name}` pair — a present speaker's display name (the `@mention` seam + the per-speaker SHAPE
 *  name-stamp). An agent's name arrives from the doc-04 speaker source (AP3); a character's from its card. */
export interface CastName {
  readonly ref: SpeakerRef;
  readonly name: string;
}

/** The 7b (`smart`) arbitration outcome: WHO speaks, plus whether the side-LLM actually decided it. Shared
 *  across modules (the engine produces it, the turn verb reads `degraded` to emit the honest-degrade warning
 *  — D41 bans a silent degrade), so it lives here rather than inline on the engine file. */
export interface SmartArbitrationResult {
  /** The chosen next speaker (one element), or `[]` when NO candidate is eligible. */
  readonly speakers: readonly SpeakerRef[];
  /** True ⇒ the side-LLM was consulted and its answer was unusable (it threw, or named nothing on the
   *  eligible roster), so `speakers` came from the deterministic `natural` fallback instead of the model.
   *  False for a validated model pick AND for the short-circuits (no LLM was needed — not a degrade). */
  readonly degraded: boolean;
  /** True ⇒ the CALLER'S TURN SIGNAL fired while the side-LLM call was in flight (or before it started), so
   *  the arbitration was cancelled. An abort is NOT a degrade: nobody wants the round anymore, so the caller
   *  must end the turn rather than fall back and generate anyway — and it must NOT emit the
   *  `smart_arbitration_degraded` warning (the model didn't fail; the user/host cancelled). Invariant:
   *  `aborted:true` ⇒ `speakers: []` and `degraded:false`. */
  readonly aborted: boolean;
}

/** Why an auto-mode AI→AI chain stopped (the dual bound + the interrupt/eligibility/
 *  lock guards). ONE home; the union derives from this tuple (no inline re-spell). */
const AUTO_MODE_STOP_REASONS = [
  /** The turn-count cap (`autoModeMaxTurns`) was reached. */
  "max-turns",
  /** The caller aborted (the `AbortSignal` fired) — a user interrupt. */
  "interrupt",
  /** Arbitration produced no eligible speaker (everyone muted/left, or `manual`/ban-last yielded none). */
  "no-eligible",
  /** A concurrent turn holds the per-chat lock (a human send interleaved at a clean seq boundary — §6). */
  "locked",
] as const;
export type AutoModeStopReason = (typeof AUTO_MODE_STOP_REASONS)[number];

/** The result of an auto-mode chain: how many turns ran, why it stopped, and the committed messages
 *  (across all chained turns, in commit order). */
export interface AutoModeResult {
  readonly turns: number;
  readonly stopReason: AutoModeStopReason;
  readonly messages: readonly MessageView[];
}
