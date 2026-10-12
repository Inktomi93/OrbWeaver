// The cheap state round (`runToolRound`): one forced tool round, or the structured round a game prefers, on the
// character turn's already-resolved connection.

import type { RpgToolCall } from "@orb/contracts/rpg";
import { recordToolCalls } from "@orb/contracts/rpg";
import type { ForcedToolRoundInput, Resolved } from "@orb/inference";
import { carriesForcedToolRound, GenerationObservationPersistenceError, generationOf, toForcedToolRoundRequest } from "@orb/inference";
import type { ChatId } from "@orb/kit/ids";
import { logger } from "#foundation/observability";
import type { PromptInputs, RpgRoundsDeps } from "#src/domain/rpg/contract/rounds.ts";
import type { RpgRunToolRound, RpgStateDelta } from "#src/domain/rpg/contract/service.ts";
import { fallbackStateRound, primaryStateRound } from "#src/domain/rpg/substrate/readonly-axis.ts";
import { buildRunExtraction } from "./extraction.ts";
import { buildExtractionUserPrompt, buildToolRoundWireTools, resolveExtractionRefs, toolRoundSystem } from "./prompts.ts";
import { withGenerationObservation } from "./round-connection.ts";
import { isCancelled, logCancelled, logStructuredFallback, logToolRoundUsage, roundFailure, warnIfStructuredUnavailable } from "./round-log.ts";
import { foldRoundCalls, runStructuredStateRound, structuredRound, structuredShapes, withInventoryAudit } from "./structured.ts";

function failedToolRoundDelta(err: unknown, round: { readonly chatId: ChatId; readonly conn: Resolved<"chat">; readonly signal: AbortSignal }): RpgStateDelta {
  if (err instanceof GenerationObservationPersistenceError) {
    throw err;
  }
  const { chatId, conn, signal } = round;
  if (isCancelled(signal)) {
    logCancelled({ chatId, model: conn.model, api: conn.api, vehicle: "cheap tool round", preflight: false });
    return { statePatch: {}, journal: [] };
  }
  logger.warn({ event: "rpg.toolround.failed", chatId, model: conn.model, api: conn.api, err }, "rpg cheap tool round failed");
  return { statePatch: {}, journal: [], failure: roundFailure(err) };
}

/** The dedicated round shares its resolved route and one observation session across primary, fallback and audit calls.
 * Provider failures are state errors-as-data; durable observation failures cannot degrade or purchase another call. */
export function buildRunToolRound(baseDeps: RpgRoundsDeps): RpgRunToolRound {
  return async (input) => {
    const deps = withGenerationObservation(baseDeps, {
      chatId: input.chatId,
      turnId: input.turnId,
      sourceMessageId: input.messageId,
      sourceVariantId: input.variantId,
    });
    const { chatId, turnId, baseState, turnConnection, reconcile, signal } = input;
    const empty = { statePatch: {}, journal: [] };
    const conn = turnConnection.connection;
    // No forced round on this backend: the shared-plane proof lets it ride the SAME structured extraction (which
    // runs its own pre-flight cancel check, so the degrade inherits cancellation identically).
    if (!carriesForcedToolRound(conn)) {
      return buildRunExtraction(deps)(input);
    }
    // CANCELLED BEFORE THE CALL — no ref resolve, no model call, no spend (the structured arm's posture).
    if (isCancelled(signal)) {
      logCancelled({ chatId, model: conn.model, api: conn.api, vehicle: "cheap tool round", preflight: true });
      return empty;
    }
    const { refs, playerDisplayName, config } = await resolveExtractionRefs(deps, chatId, baseState, reconcile);
    // The turn's CAPTURED prose view — see `buildRunExtraction`'s note (no live re-resolve post-commit).
    const prose = turnConnection.prose;
    const inputs: PromptInputs = { config, refs, playerDisplayName, reconcile, prose };
    const userPrompt = buildExtractionUserPrompt(turnConnection.transcript, baseState, config, prose);
    const history = [{ role: "user" as const, content: [{ type: "text" as const, text: userPrompt }] }];
    const wireTools = buildToolRoundWireTools(refs, config, prose);
    const generation = generationOf(conn);
    const shapes = structuredShapes(conn, refs, wireTools);
    const primary = primaryStateRound(config.stateCaptureVehicle, generation, shapes.plans);
    if (primary !== null) {
      const structured = structuredRound(primary, shapes.schemas()[primary], wireTools, { lead: toolRoundSystem(inputs), prose });
      return await runStructuredStateRound(deps, { input, refs, round: structured, userPrompt, priorCalls: [] });
    }
    warnIfStructuredUnavailable({ chatId, model: conn.model, api: conn.api, vehicle: config.stateCaptureVehicle });
    const round: ForcedToolRoundInput = {
      connection: conn,
      // The wire-capture correlation key (see `ExtractCtx.chatId`): without it the one round that writes the state
      // records anonymously in `/api/_debug/wire/captures?chatId=`.
      chatId,
      systemPrompt: toolRoundSystem(inputs),
      history,
      tools: wireTools,
      signal,
    };
    let calls: readonly RpgToolCall[];
    // @orb-waive caught-failure-ownership(err): errors-as-data — the structured arm's twin: a
    // CANCEL is read off the signal (not the error shape) and returns `empty`; any other failure is observed
    // by failedToolRoundDelta. Ends if its warn log is removed.
    try {
      const result = await deps.executor.runChatTurn(toForcedToolRoundRequest(round));
      // The round's economics record — §10.1a's claim, made true on the vehicle that had no emitter.
      logToolRoundUsage({ chatId, api: conn.api, pass: "primary", result });
      calls = result.toolCalls ?? [];
    } catch (err) {
      return failedToolRoundDelta(err, { chatId, conn, signal });
    }
    deps.trace?.({ phase: "tool", chatId, turnId, vehicle: "cheap tool round", calls: recordToolCalls(calls) });
    const fallback = fallbackStateRound(generation, calls, shapes.plans);
    if (fallback !== null) {
      logStructuredFallback({ chatId, model: conn.model, api: conn.api, shape: fallback, calls: calls.length, event: "rpg.toolround.structured_fallback" });
      const structured = structuredRound(fallback, shapes.schemas()[fallback], wireTools, { lead: toolRoundSystem(inputs), prose });
      return await runStructuredStateRound(deps, { input, refs, round: structured, userPrompt, priorCalls: calls });
    }
    const audited = await withInventoryAudit({ deps, round, prose, wireTools, turnId, baseState, transcript: turnConnection.transcript, calls });
    return await foldRoundCalls(deps, { chatId, conn, baseState, refs, calls: audited, trackerDefs: input.trackerDefs, vehicle: "cheap tool round" });
  };
}
