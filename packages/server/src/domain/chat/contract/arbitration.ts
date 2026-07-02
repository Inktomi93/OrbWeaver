// domain/chat/contract/arbitration — the cross-module CONTRACT types for the 7a/7b arbitration + auto-mode +
// the group round driver (chat.md Part III §6/§7). Homed under `contract/` per the `types-in-contract` gate
// (an exported feature type lives here, never inline on an engine file). The *Params shapes stay file-local
// to each engine module (callers pass literals) — only the types SHARED across modules/tests live here.

import type { MessageView } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";

/** The identity of ONE arbiter-selectable speaker (D60; agent-principal-design/02 §1.1) — the AI-driven kinds
 *  the engine schedules + voices. A `character` FKs `characters.id`; an `agent` FKs its `users` row (its turn
 *  is self-attributed, `authorUserId` = the agent, `characterId` NULL — doc 02 §2). The old pipeline was
 *  bare-`CharacterId`-keyed; an agent has no characterId, so selection/attribution key on THIS ref. NOT a
 *  Set/Map key directly — use {@link speakerKey} (a struct is not value-comparable). */
export type SpeakerRef =
  | { readonly kind: "character"; readonly characterId: CharacterId }
  | { readonly kind: "agent"; readonly userId: UserId };

/** The stable string key for a {@link SpeakerRef} (Set membership + equality across the arbitration path).
 *  Kind-prefixed so a characterId and a userId can never collide. Pure; deterministic. */
export function speakerKey(ref: SpeakerRef): string {
  return ref.kind === "character" ? `c:${ref.characterId}` : `a:${ref.userId}`;
}

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

/** A `{ref, name}` pair — a present speaker's display name (the @mention seam + the per-speaker SHAPE
 *  name-stamp). An agent's name arrives from the doc-04 speaker source (AP3); a character's from its card. */
export interface CastName {
  readonly ref: SpeakerRef;
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
