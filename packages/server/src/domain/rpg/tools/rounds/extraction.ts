// The structured-output extraction op (§4.6): the vehicle `runToolRound` degrades to on a connection that cannot
// carry a forced tool round.

import { constrainExtractionSchema, rpgExtractionSchema, salvageExtraction } from "@orb/contracts/rpg";
import { GenerationObservationPersistenceError } from "@orb/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { logger } from "#foundation/observability";
import type { ExtractCtx, PromptInputs, RpgRoundsDeps } from "#src/domain/rpg/contract/rounds.ts";
import type { RpgRunExtraction } from "#src/domain/rpg/contract/service.ts";
import { buildActorRefIndex, extractionToStateDelta } from "../apply.ts";
import { createExtractionMints } from "../mints.ts";
import { buildExtractionUserPrompt, extractionSystem, resolveExtractionRefs } from "./prompts.ts";
import { extractStructured } from "./round-connection.ts";
import { isCancelled, logCancelled, logExtractionOutcome, logStrippedKeys, roundFailure, safeJson } from "./round-log.ts";

/** Build the STRUCTURED-OUTPUT extraction op (§4.6). No longer a delivery mode of its own (the `reliable` knob
 *  was deleted 2026-08-01 — owner ruling): it is the vehicle `runToolRound` degrades to on a connection that
 *  cannot carry a forced tool round, and the vehicle the host resync drives. Rides the CHARACTER turn's ALREADY-RESOLVED connection +
 *  consent verdict (`input.turnConnection` — stickler F1: never a re-resolve of the host's global default, never
 *  a force-stamped consent), reads the beat, drives ONE structured-output call (`@orb/inference`'s
 *  `runStructuredChat`, one side-generation chat turn on any backend), and folds the parsed extraction
 *  into an `RpgStateDelta`. On any backend throw / parse failure it returns an EMPTY delta (the byte-identical
 *  non-writing turn — a broken extraction never corrupts canon, the errors-as-data posture).
 *
 *  Completed economics reach the chat-owned observer before response decoding; state-call records remain RPG-owned. */
export function buildRunExtraction(deps: RpgRoundsDeps): RpgRunExtraction {
  return async ({ chatId, baseState, trackerDefs, turnConnection, reconcile, signal }) => {
    const empty = { statePatch: {}, journal: [] };
    const conn = turnConnection.connection;
    // CANCELLED BEFORE THE CALL — spend nothing, read nothing, return the empty delta (the same shape a failed
    // extraction returns; a cancelled round is byte-identical to a non-writing turn).
    if (isCancelled(signal)) {
      logCancelled({ chatId, model: conn.model, api: conn.api, vehicle: "structured extraction", preflight: true });
      return empty;
    }
    // R1 — the mis-target fix: constrain the response schema's ref fields to the ACTUAL per-call refs (the
    // semantic `player` token + participant/persona names + existing scene npcs + npc-actor keys + tracker keys)
    // so an invalid ref is UNREPRESENTABLE under a schema-enforcing backend, and ALSO enumerate them in the
    // prompt (the fallback arm for a non-enforcing model). `reconcile` (§1.3 cadence) forces establish-
    // EVERYTHING + the reconcile prompt line so a drifted panel self-heals this beat.
    const { refs, playerDisplayName, config } = await resolveExtractionRefs(deps, chatId, baseState, reconcile);
    const schema = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs);
    // PROSE-1 S4 — the CAPTURED view (owner ruling): the GM preset's prose as the ENGINE resolved it for this
    // turn, riding `RpgTurnContext` beside the connection + consent it already carries for exactly this
    // frozen-view reason. NEVER a live re-resolve here: this round runs post-commit, so a second resolution
    // moment could disagree with the prompt the turn itself was assembled from — a divergence by construction.
    const prose = turnConnection.prose;
    const inputs: PromptInputs = { config, refs, playerDisplayName, reconcile, prose };
    const ctx: ExtractCtx = {
      conn,
      chatId,
      systemPrompt: extractionSystem(inputs),
      userPrompt: buildExtractionUserPrompt(turnConnection.transcript, baseState, config, prose),
      schema,
      signal,
    };
    // The structured-output extraction can THROW at the backend (e.g. a backend that doesn't honor
    // `outputFormat: json_schema`). Errors-as-data for CANON (a failed extraction never corrupts state — return
    // the empty delta), but the throw MUST be observable: a silent swallow at `engine.ts`'s fire-and-forget
    // `.catch` made a broken extraction invisible in prod (the diagnosis that surfaced this).
    let text: string;
    try {
      text = await extractStructured(deps, ctx);
    } catch (err) {
      if (err instanceof GenerationObservationPersistenceError) {
        throw err;
      }
      // A CANCEL is not a FAILURE. Reading the signal (not the error's shape) is what keeps the two apart: the
      // thrown value differs per backend, and misfiling a user's Stop as `rpg.extraction.failed` would put a
      // normal cancellation in the same warn stream we use to diagnose broken extractions.
      if (isCancelled(signal)) {
        logCancelled({ chatId, model: conn.model, api: conn.api, vehicle: "structured extraction", preflight: false });
        return empty;
      }
      logger.warn({ event: "rpg.extraction.failed", chatId, model: conn.model, api: conn.api, err }, "rpg structured extraction failed");
      // The tool round's twin (#1468 item 2) — and NOT an optional half of it: `runToolRound` DEGRADES to this
      // vehicle on every connection with no forced tool round, so a failure arm that stayed silent here would leave that whole class
      // of connection with the defect the tool round just lost.
      return { ...empty, failure: roundFailure(err) };
    }
    // EXT-4a — SALVAGE PER PLANE / PER ENTRY, never all-or-nothing. The old whole-object `safeParse` let ONE
    // malformed nested field (the measured case: a journal entry missing its nested-required `type`) discard all
    // six planes for the turn, while the two TOOL vehicles — validating per call — lost only the bad call. The
    // three delivery paths now carry EQUAL drop semantics: a bad entry costs that entry, never the writes beside
    // it. What was dropped is itemized by the SAME function that built the extraction (one home — the log
    // cannot disagree with what applied, the `ghostTargetRefs`/D112 (3) posture).
    const { extraction, dropped, stripped } = salvageExtraction(safeJson(text));
    if (dropped.length > 0) {
      // OBSERVABILITY: this is the path the structured arm was silently dying on (an 8B dropping `journal[].title` failed
      // `safeParse` with NO log while every other rpg log stayed silent; that contradiction is how the diagnosis
      // surfaced). The set is TOTAL: failed (throw) / unparseable (this) / stripped (below) / healed
      // (logExtractionOutcome) / empty / phantom (logExtractionOutcome) / dropped (flush). A `root` drop means
      // NOTHING was salvageable.
      logger.warn(
        { event: "rpg.extraction.unparseable", chatId, model: conn.model, api: conn.api, dropped },
        "rpg structured extraction: plane(s)/entry(ies) did not conform — DROPPED (the rest of the delta still applies)",
      );
    }
    logStrippedKeys({ chatId, model: conn.model, api: conn.api, vehicle: "structured extraction", event: "rpg.extraction.stripped", stripped });
    // The participant index resolves an extracted party/inventory target NAME to its participant ref (F2 — the same
    // first-class resolution the cheap-mode tools use; a structured write on a party member must render too).
    const participantIndex = buildActorRefIndex(await deps.rpgChatOps.resolveRpgParticipants(chatId));
    const delta = extractionToStateDelta(baseState, extraction, createExtractionMints(deps.idSource), { participantIndex, trackerDefs });
    // R3 — visibility: an extraction that parsed but resolves to ZERO renderable writes (all phantom mints /
    // no-ops) is a SIGNAL (mis-target or an empty beat), not a silent nothing. Log it with the ref context so
    // a dark panel is diagnosable from the provider trail.
    logExtractionOutcome({
      chatId,
      model: conn.model,
      api: conn.api,
      actorRefs: refs.actorRefs.length,
      base: baseState,
      participantIndex,
      parsed: extraction,
      delta,
    });
    return delta;
  };
}
