// domain/chat/contract/arbitration — the cross-module CONTRACT types for the 7a/7b arbitration + auto-mode +
// the group round driver (chat.md Part III §6/§7). Homed under `contract/` per the `types-in-contract` gate
// (an exported feature type lives here, never inline on an engine file). The *Params shapes stay file-local
// to each engine module (callers pass literals) — only the types SHARED across modules/tests live here.

import type { MessageView } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";

/** One character candidate the 7a/7b arbitration ranks — a present `chat_participants` character row's
 *  arbitration-relevant fields (the caller maps `loadRoster` rows). Humans are excluded UPSTREAM (they post
 *  free-form; §6 schedules only characters). */
export interface ArbiterCandidate {
  readonly characterId: CharacterId;
  /** 0–1 sampling weight for `natural` (default `TALKATIVENESS_DEFAULT` = 0.5). */
  readonly talkativeness: number;
  /** Muted: still contributes cards/WI, but never arbiter-selected (`isArbiterEligible` — §1). */
  readonly disabled: boolean;
  /** `leftSeq IS NULL` ⇒ present (a gone member is never eligible). */
  readonly leftSeq: number | null;
}

/** A `{characterId, name}` pair — the present cast's display names (the @mention seam + the per-speaker
 *  SHAPE name-stamp). */
export interface CastName {
  readonly characterId: CharacterId;
  readonly name: string;
}

/** Why an auto-mode AI→AI chain stopped (chat.md Part III §6 — the dual bound + the interrupt/eligibility/
 *  lock guards). ONE home; the union derives from this tuple (no inline re-spell). */
export const AUTO_MODE_STOP_REASONS = [
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
