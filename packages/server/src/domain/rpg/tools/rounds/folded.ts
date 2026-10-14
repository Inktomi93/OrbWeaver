// The `folded` vehicle (R1, the one-call exchange): the gather's terminal tool mount and the flush's fold of the
// calls the character turn co-emitted. Neither makes a model call of its own.

import { resolveProseText } from "@orb/contracts/prose";
import { buildToolRoundWireTools, cacheStableExtractionRefs, recordToolCalls, toolCallsToExtraction } from "@orb/contracts/rpg";
import { logger } from "#foundation/observability";
import type { RpgRoundsDeps } from "#src/domain/rpg/contract/rounds.ts";
import type { RpgContext } from "#src/domain/rpg/contract/service.ts";
import { buildActorRefIndex, extractionToStateDelta, reachableActorRefs } from "../apply.ts";
import { createExtractionMints } from "../mints.ts";
import { resolveExtractionRefs } from "./prompts.ts";
import { logExtractionOutcome, logToolCallLosses } from "./round-log.ts";

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// FOLDED mode (R1) — the state round DELETED, not moved: the 7 tools ride the CHARACTER turn itself.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Two halves, neither of which makes a model call of its own:
//   • `buildFoldedTurn` (the GATHER's half) — the SAME `buildToolRoundWireTools` product the dedicated round
//     sends, bound to the CACHE-STABLE ref projection (F4: this payload opens the character turn's cached
//     prefix). R6's key enums + the locked-tracker prevention ride on; R5/R5a's scene-derived enums move to
//     the depth-0 state block and the apply-time ghost guard. See `buildFoldedTurnBuilder`.
//   • `foldTurnToolCalls` (the FLUSH's half) — the calls the character turn co-emitted, through the SAME
//     `toolCallsToExtraction` → `extractionToStateDelta` fold the round uses.
// The narrative is committed BEFORE either the engine hands us the calls or this code runs, so nothing here
// can fail or delay it. Everything is errors-as-data + logged: a malformed arg is dropped
// (`rpg.extraction.unparseable`), a ghost actor is dropped (`rpg.extraction.phantom`), a write-nothing fold is
// surfaced (`rpg.extraction.empty`), and ZERO calls is a legitimate quiet beat with its OWN line
// (`rpg.extraction.folded.quiet`) so "the model recorded nothing" can never be misread as "the fold broke".

/** Build the `buildFoldedTurn` op (R1 — the gather's half). Resolves the per-call refs off the SAME base state
 *  the flush will apply against and returns the wire tools. No model call, no connection read: the engine
 *  decides at request-build time whether the turn's connection can actually carry them (and hands back a `null`
 *  channel when it can't, which the flush reads as "fall back to the post-commit round").
 *
 *  F4 — CACHE-STABLE REFS ON THIS VEHICLE ONLY (`scripts/probes/openrouter/RESULTS.md` F4, option b). These
 *  tools ride the CHARACTER turn, so they are the FIRST bytes of its cached prefix: a live-state ref enum here
 *  re-bills the entire story prefix (~10× that turn) every time an NPC walks on or a condition is gained. The
 *  rest of that prefix is stable by construction — the volatile state block is an `in_chat` depth-0 injection,
 *  BELOW the rolling breakpoint — so this payload was the whole leak. `cacheStableExtractionRefs` keeps the
 *  config-derived enforcement (tracker keys, locked-tracker prevention, establish-when-unset) and drops only the
 *  scene-derived enums, which the depth-0 state block already enumerates in prose and the R5 ghost guard already
 *  backstops at apply. The DEDICATED round below keeps the full live bundle — it is the enforcing vehicle, and
 *  its own prefix is per-turn volatile regardless (its system block re-renders the same refs). */
export function buildFoldedTurnBuilder(deps: RpgRoundsDeps): RpgContext["buildFoldedTurn"] {
  return async ({ chatId, baseState, reconcile, prose }) => {
    const { refs, config } = await resolveExtractionRefs(deps, chatId, baseState, reconcile);
    const tools = buildToolRoundWireTools(cacheStableExtractionRefs(refs, config.trackers), config, prose);
    // R-OBS: what this turn was even ABLE to write. The optional CALL short-circuits its argument, so the
    // event object is never built when tracing is off (`domain/rpg/contract/trace` header).
    deps.trace?.({ phase: "mount", chatId, toolNames: tools.map((tool) => tool.name) });
    // The FOLDED reconcile note is deliberately NOT `rpg.extract.reconcilePass`: that one addresses a
    // state-only round ("re-state the FULL scene…") and, on a turn that is also writing prose, reads as an
    // instruction to the NARRATOR — the character would narrate a stocktake. Its own slot, its own bytes.
    return { tools, reconcileNote: reconcile ? resolveProseText("rpg.extract.foldedReconcile", prose) : null };
  };
}

/** Build the `foldTurnToolCalls` op (R1 — the flush's half). ZERO model calls: the character turn already paid
 *  for these calls. Folds them through the SAME path the dedicated tool round folds its own calls through, so
 *  an equivalent set of calls produces a byte-identical delta on either delivery shape. */
export function buildFoldTurnToolCalls(deps: RpgRoundsDeps): RpgContext["foldTurnToolCalls"] {
  return async ({ chatId, turnId, baseState, trackerDefs, turnConnection, toolCalls }) => {
    const conn = turnConnection.connection;
    // R-OBS: what the model CALLED and what survived the schema — the folded turn's tool traffic is otherwise
    // server-internal by D112 design, so this ring is the only place it is legible after the fact.
    // `recordToolCalls` is the ONE projection (`@orb/contracts/rpg`) — the durable per-variant row the user
    // disclosure reads is written from the same call, so the ring, the warn and the row cannot disagree.
    deps.trace?.({ phase: "tool", chatId, turnId, vehicle: "folded extraction", calls: recordToolCalls(toolCalls) });
    // A malformed arg NEVER fails the turn (the narrative is already committed) — `toolCallsToExtraction` drops
    // it, and this names what was dropped so the loss is diagnosable instead of silent (D109-7 totality).
    logToolCallLosses({ chatId, model: conn.model, api: conn.api, calls: toolCalls, vehicle: "folded extraction" });
    // Defensive direct-call arm. The normal flush reroutes an empty terminal array to the required tool round;
    // an explicit `no_changes` call is how a folded quiet beat avoids that fallback.
    if (toolCalls.length === 0) {
      logger.info({ event: "rpg.extraction.folded.quiet", chatId, model: conn.model, api: conn.api }, "rpg folded turn recorded no state change (quiet beat)");
      return { statePatch: {}, journal: [] };
    }
    const extraction = toolCallsToExtraction(toolCalls);
    // ONE db read. The ref bundle (`resolveExtractionRefs`) is the MOUNT's job — it constrains what the model
    // may write, and the model has already written by the time we get here; re-resolving it at flush would be
    // two more reads (the game row + a SECOND participant index) whose only consumer is a log field. The participant index is
    // genuinely needed (it resolves target names to participant refs and backs the ghost guard), and the log's
    // target-menu denominator derives from state we already hold.
    const participantIndex = buildActorRefIndex(await deps.rpgChatOps.resolveRpgParticipants(chatId));
    const delta = extractionToStateDelta(baseState, extraction, createExtractionMints(deps.idSource), { participantIndex, trackerDefs });
    logExtractionOutcome({
      chatId,
      model: conn.model,
      api: conn.api,
      actorRefs: reachableActorRefs(baseState, participantIndex).size,
      base: baseState,
      participantIndex,
      parsed: extraction,
      delta,
    });
    return delta;
  };
}
