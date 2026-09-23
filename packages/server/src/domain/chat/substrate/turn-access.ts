// domain/chat/substrate/turn-access — the substrate DI seam between the turn-running `verbs/` and the
// `engine/` named subsystem (docs/law/Core-0-Architecture-and-Structure.md §4 / dep-cruiser `domain-substrate-mediates-subsystems` +
// `domain-no-cross-subsystem`). The verbs MAY NOT import `engine/` directly (it is a named subsystem, not a
// fixed slot) — they reach the arbitration (7a/7b), the AI→AI auto-mode chain, the group round driver, and the
// pure D19 identity-triple resolver THROUGH HERE. (The stateful `TurnEngine` is the exception — it is built at
// the composition root via `engine/createTurnEngine` and INJECTED into the verbs as a dep, not reached here.)
//
// Thin pass-through WRAPPERS (not bare re-exports — `noBarrelFile`), each typed off the target's own signature
// so the seam can't drift — the same form as `assembly-access.ts`.
//
// FLAG[turn-access-seam]: the chunk-11 handoff named only the `assembly-access.ts` extension; the SAME gate
// (`domain-substrate-mediates-subsystems`) governs `engine/` too, so the engine-subsystem reaches the verbs
// need this sibling bridge. Added here (a substrate fixed-slot file — the legal mediator), not a verb-side
// direct import (which would be RED).

import { runAutoMode } from "../engine/auto-mode.ts";
import { driveRound } from "../engine/round.ts";
import { resolveMentions, selectSpeakers } from "../engine/select-speakers.ts";
import { smartArbitrate } from "../engine/smart-arbitrate.ts";
import { resolveTurnIdentity } from "../engine/turn-identity.ts";

/** Resolve the D19 turn-identity triple (`triggeredBy`/`funderUserId`/`runAsUserId`) from the ids the verb holds. PURE. */
export function resolveTurnIdentityVia(...args: Parameters<typeof resolveTurnIdentity>): ReturnType<typeof resolveTurnIdentity> {
  return resolveTurnIdentity(...args);
}

/** 7a deterministic arbitration — the ordered character ids that speak this round (rng-driven, D46). */
export function selectSpeakersVia(...args: Parameters<typeof selectSpeakers>): ReturnType<typeof selectSpeakers> {
  return selectSpeakers(...args);
}

/** Extract `@mention` targets from HUMAN-authored trigger text (only human text drives the override — §12 inv 6). */
export function resolveMentionsVia(...args: Parameters<typeof resolveMentions>): ReturnType<typeof resolveMentions> {
  return resolveMentions(...args);
}

/** 7b side-LLM arbitration (the `smart` policy) — one chosen speaker, roster-validating, with a `natural`
 *  fallback the result flags (`degraded`) so the caller can surface it. */
export function smartArbitrateVia(...args: Parameters<typeof smartArbitrate>): ReturnType<typeof smartArbitrate> {
  return smartArbitrate(...args);
}

/** Drive ONE group round (the narrator collapse / per-speaker list) off the ONE immutable ctx, per-turn-locked. */
export function driveRoundVia(...args: Parameters<typeof driveRound>): ReturnType<typeof driveRound> {
  return driveRound(...args);
}

/** Run the auto-mode AI→AI chain (re-arbitrate → run → repeat; the dual bound + the four stop conditions). */
export function runAutoModeVia(...args: Parameters<typeof runAutoMode>): ReturnType<typeof runAutoMode> {
  return runAutoMode(...args);
}
