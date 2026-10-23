// The host resync model call (§1.3): resolves the room connection AS THE HOST and re-derives the tracked state from
// the story window.

import type { RpgGameConfig, RpgSnapshotState, RpgToolCall } from "@orb/contracts/rpg";
import { buildToolRoundWireTools, constrainExtractionSchema, rpgExtractionSchema, salvageExtraction } from "@orb/contracts/rpg";
import type { Resolved } from "@orb/inference";
import { carriesForcedToolRound, GenerationObservationPersistenceError, generationOf, toForcedToolRoundRequest } from "@orb/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { logger } from "#foundation/observability";
import { createRpgRoundsContext } from "#src/domain/rpg/context.ts";
import type { ExtractCtx, PromptInputs, RpgRoundsAssemblyDeps, RpgRoundsDeps, StructuredRound } from "#src/domain/rpg/contract/rounds.ts";
import type { RpgContext, RpgStateDelta } from "#src/domain/rpg/contract/service.ts";
import { fallbackStateRound, hasStructuredWriter, hasToolWriter, primaryStateRound } from "#src/domain/rpg/substrate/readonly-axis.ts";
import { stateRoundNeededTokens } from "#src/domain/rpg/substrate/state-round-fit.ts";
import { buildActorRefIndex, extractionToStateDelta } from "../apply.ts";
import { createExtractionMints } from "../mints.ts";
import { stateRoundRequestText } from "./delivery.ts";
import { buildExtractionUserPrompt, extractionSystem, resolveExtractionRefs, toolRoundSystem } from "./prompts.ts";
import { extractStructured, isUnresolvable, roomWindowed, withGenerationObservation } from "./round-connection.ts";
import { logExtractionOutcome, logStrippedKeys, logStructuredFallback, logToolRoundUsage, safeJson, warnIfStructuredUnavailable } from "./round-log.ts";
import { foldRoundCalls, requestStructuredCalls, STRUCTURED_ROUND_VEHICLE, structuredRound, structuredShapes } from "./structured.ts";

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// RESYNC — the HOST deep-rebuild model call (crunchy-cluster §1.3). The ONE non-inherited rpg model call.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UNLIKE the in-turn rounds (which ride the character turn's already-resolved connection + inherited consent,
// stickler F1), the resync is a HOST-INITIATED interactive action: the consenting human is at the keyboard, so
// it resolves the ROOM connection AS THE HOST FRESH at the verb (`resolveChat({principal: host})`) and consent
// is the host's OWN — never a caller-injected foreign principal (the verb resolved host authority before this
// op runs; `input.hostUserId` is the room host by ROLE, D19, never a caller-supplied id). The rebuild reads the
// DEEP window with establish-EVERYTHING forcing (`reconcile: true` + `extractionContext: "full"` so the WHOLE
// window is evidence). A connection with no structured writer capability yields an EMPTY delta (a no-op resync,
// never a corrupt write — the SAME readonly gate the in-turn flush honors, F2). Deception surface-only holds by
// construction: the §1.6 registry composes the surface-only clause on a deception-active game, so the rebuild
// never writes hidden truth into a member-visible plane (the hidden layer stays in the reveal channel).

// The three sentences a resync REFUSAL can carry (`ResyncResult.reason` → the host's toast). Written as host
// prose, not log vocabulary: the person reading them clicked a button and is owed what to do next. Each pairs
// with the `rpg.resync.*` warn the same branch already emitted — the log is for us, the reason is for them.
const RESYNC_UNRESOLVABLE_REASON = "this room's connection didn't resolve, so the rebuild never ran — check the chat's model/connection.";

const RESYNC_READONLY_REASON = "this room's model can't write game state, so there's nothing to rebuild with — switch to a connection that can.";

const RPG_RESYNC_MAX_TOKENS = 16_384;

const RESYNC_FAILED_REASON = "the model call failed, so nothing was rebuilt:";

// ── THE CATCH-UP ROUND IS A MULTI-CALL TOOL ROUND (owner ruling 2026-08-03) ───────────────────────────
// The resync used to send the extraction schema as ONE monolithic structured payload, which is precisely the
// shape both hosted grammar walls are made of (46 optional properties; four keyword classes outside the
// documented subsets). A catch-up is a HOST-INITIATED, non-latency-sensitive action, so it can afford several
// calls — and the per-plane tool schemas are SMALL by construction, so the walls mostly stop existing on this
// path. The vehicle is already proven live on every array wire (the cheap round + the folded turn drive it).
//
// WHAT THIS DOES **NOT** TOUCH: the folded turn. Nothing here edits `buildFoldedTurnBuilder`,
// `buildFoldTurnToolCalls` or `buildRunToolRound` — the resync is its OWN caller over the SAME tool
// DEFINITIONS (`buildToolRoundWireTools`) and the SAME fold tail (`toolCallsToExtraction` →
// `extractionToStateDelta`). Sharing the definitions is safe; mutating the in-turn round to serve a host
// button is not, and was ruled out explicitly.
//
// The STRUCTURED arm survives as the degrade, unchanged: a connection that cannot carry a forced tool round
// (`carriesForcedToolRound` — the terminal-tools channel is a CHAT-pipeline mount, not a state-round vehicle)
// rides the structured extraction with the projected schema. Same delta either way — the shared-plane proof.

/** The resync's own log namespace for every round it drives, so a catch-up's losses stay on the resync's trail. */
const RESYNC_EVENTS = { unparseable: "rpg.resync.unparseable", stripped: "rpg.resync.stripped", failed: "rpg.resync.failed" } as const;

type ResyncRoundResult = { readonly ok: true; readonly delta: RpgStateDelta } | { readonly ok: false; readonly reason: string };

/** The resync's TOOL-ROUND arm: one state-only turn, the 7 per-plane tools, `tool_choice:"required"`. Errors
 *  are DATA (the RESYNC-OR grammar): a throw becomes the host's sentence, never a silent empty rebuild. The game's
 *  state-capture vehicle picks a structured round instead where it asks for one, and a downgraded round that
 *  came back empty is retried once as a structured round, exactly as the in-turn round does. */
async function resyncViaToolRound(
  deps: RpgRoundsDeps,
  args: {
    readonly chatId: ChatId;
    /** A connection that carries a forced tool round (`carriesForcedToolRound`); any other takes the structured
     *  degrade instead. */
    readonly conn: Resolved<"chat">;
    readonly baseState: RpgSnapshotState;
    readonly inputs: PromptInputs;
    readonly userPrompt: string;
  },
): Promise<ResyncRoundResult> {
  const { chatId, conn, inputs, userPrompt } = args;
  const { refs, config, prose } = inputs;
  const tools = buildToolRoundWireTools(refs, config, prose);
  const generation = generationOf(conn);
  const shapes = structuredShapes(conn, refs, tools);
  const primary = primaryStateRound(config.stateCaptureVehicle, generation, shapes.plans);
  const lead = { lead: toolRoundSystem(inputs), prose };
  if (primary !== null) {
    return await resyncViaStructuredRound(deps, { ...args, round: structuredRound(primary, shapes.schemas()[primary], tools, lead), priorCalls: [] });
  }
  warnIfStructuredUnavailable({ chatId, model: conn.model, api: conn.api, vehicle: config.stateCaptureVehicle });
  let calls: readonly RpgToolCall[];
  try {
    const result = await deps.executor.runChatTurn(
      toForcedToolRoundRequest({
        connection: conn,
        // Same correlation key as the in-turn round (see `ExtractCtx.chatId`) — a host-clicked resync is exactly
        // the moment an operator is reading the wire ring for that chat.
        chatId,
        systemPrompt: toolRoundSystem(inputs),
        history: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
        tools,
      }),
    );
    logToolRoundUsage({ chatId, api: conn.api, pass: "resync", result });
    calls = result.toolCalls ?? [];
  } catch (err) {
    if (err instanceof GenerationObservationPersistenceError) {
      throw err;
    }
    logger.warn({ event: RESYNC_EVENTS.failed, chatId, model: conn.model, api: conn.api, err }, "rpg resync tool round failed");
    return { ok: false, reason: `${RESYNC_FAILED_REASON} ${errorMessage(err)}` };
  }
  const fallback = fallbackStateRound(generation, calls, shapes.plans);
  if (fallback !== null) {
    logStructuredFallback({ chatId, model: conn.model, api: conn.api, shape: fallback, calls: calls.length, event: "rpg.resync.structured_fallback" });
    return await resyncViaStructuredRound(deps, { ...args, round: structuredRound(fallback, shapes.schemas()[fallback], tools, lead), priorCalls: calls });
  }
  // The SAME loss log both in-turn tool vehicles run, in the resync's own event namespace.
  return {
    ok: true,
    delta: await foldRoundCalls(deps, { ...args, refs, calls, trackerDefs: config.trackers, vehicle: "resync tool round", events: RESYNC_EVENTS }),
  };
}

/** The resync as ONE structured round (its primary vehicle, or the retry after an empty downgraded tool round). A
 *  failure is the host's sentence, the RESYNC-OR grammar. */
async function resyncViaStructuredRound(
  deps: RpgRoundsDeps,
  args: {
    readonly chatId: ChatId;
    readonly conn: Resolved<"chat">;
    readonly baseState: RpgSnapshotState;
    readonly inputs: PromptInputs;
    readonly userPrompt: string;
    readonly round: StructuredRound;
    readonly priorCalls: readonly RpgToolCall[];
  },
): Promise<ResyncRoundResult> {
  const { chatId, conn, round } = args;
  // A HOST DOOR has no cancellation to inherit (see `resyncViaStructured`).
  const result = await requestStructuredCalls(deps, { conn, chatId, signal: undefined, userPrompt: args.userPrompt, round, events: RESYNC_EVENTS });
  if (result.kind !== "calls") {
    return { ok: false, reason: `${RESYNC_FAILED_REASON} ${result.kind === "failed" ? errorMessage(result.err) : ""}`.trimEnd() };
  }
  const calls = [...args.priorCalls, ...result.calls];
  const delta = await foldRoundCalls(deps, {
    ...args,
    refs: args.inputs.refs,
    calls,
    trackerDefs: args.inputs.config.trackers,
    unassembled: result.unassembled,
    vehicle: STRUCTURED_ROUND_VEHICLE,
    events: RESYNC_EVENTS,
  });
  return { ok: true, delta };
}

function resyncNeededTokens(conn: Resolved<"chat">, inputs: PromptInputs, userPrompt: string, toolRound: boolean): number {
  const primary = stateRoundNeededTokens(stateRoundRequestText(conn, inputs, userPrompt, toolRound));
  if (!toolRound) {
    return primary;
  }
  const tools = buildToolRoundWireTools(inputs.refs, inputs.config, inputs.prose);
  const generation = generationOf(conn);
  const shapes = structuredShapes(conn, inputs.refs, tools);
  if (primaryStateRound(inputs.config.stateCaptureVehicle, generation, shapes.plans) !== null) {
    return primary;
  }
  // Empty calls describe the possible retry; a forced round or unsupported format has no retry to reserve.
  const fallback = fallbackStateRound(generation, [], shapes.plans);
  if (fallback === null) {
    return primary;
  }
  const round = structuredRound(fallback, shapes.schemas()[fallback], tools, { lead: toolRoundSystem(inputs), prose: inputs.prose });
  return Math.max(primary, stateRoundNeededTokens([round.systemPrompt, userPrompt, JSON.stringify(round.format.schema)]));
}

async function fitResyncPrompt(
  deps: RpgRoundsDeps,
  args: {
    readonly chatId: ChatId;
    readonly conn: Resolved<"chat">;
    readonly baseState: RpgSnapshotState;
    readonly inputs: PromptInputs;
    readonly toolRound: boolean;
  },
): Promise<{ readonly ok: true; readonly userPrompt: string } | { readonly ok: false; readonly reason: string }> {
  const { conn, inputs, toolRound } = args;
  const windowTokens = generationOf(conn).context.window;
  const price = (candidate: string): number => resyncNeededTokens(conn, inputs, candidate, toolRound);
  const fixedTokens = price(buildExtractionUserPrompt([], args.baseState, inputs.config, inputs.prose));
  if (fixedTokens >= windowTokens) {
    return {
      ok: false,
      reason: `The room's context window (${windowTokens} tokens) cannot fit the game instructions, tracked state and reply reserve. Increase Max context before resyncing; nothing was rebuilt.`,
    };
  }
  // The canonical reader can keep an oversized newest row. Price the actual request before any model call.
  const transcript = [...(await deps.rpgChatOps.resolveCanonWindow(args.chatId, { maxTokens: Math.min(RPG_RESYNC_MAX_TOKENS, windowTokens - fixedTokens) }))];
  let userPrompt = buildExtractionUserPrompt(transcript, args.baseState, inputs.config, inputs.prose);
  while (transcript.length > 0 && price(userPrompt) > windowTokens) {
    transcript.shift();
    if (transcript.length === 0) {
      return {
        ok: false,
        reason: `The latest story message cannot fit the room's context window (${windowTokens} tokens) alongside game state and reply reserve. Increase Max context before resyncing; nothing was rebuilt.`,
      };
    }
    userPrompt = buildExtractionUserPrompt(transcript, args.baseState, inputs.config, inputs.prose);
  }
  return { ok: true, userPrompt };
}

/** Build the host `resyncFromStory` model call. Resolves the room connection AS THE HOST, gates readonly
 *  (capability-absent ⇒ a legible refusal), runs the establish-EVERYTHING extraction over the deep window. */
export function buildRunResyncExtraction(input: RpgRoundsAssemblyDeps): RpgContext["runResyncExtraction"] {
  const deps = createRpgRoundsContext(input);
  return async ({ chatId, hostUserId, baseState }) => {
    // Resolve the ROOM connection AS THE HOST — fresh, at the verb (the `resolveStateDelivery` host-resolve
    // precedent). The host principal is minted from the room-host userId the VERB resolved by role, never a
    // caller-supplied id (the injected-op caller-gate class). A misconfigured/incoherent backend REFUSES the
    // resync legibly (never a 500); anything else rethrows (never swallow a real bug).
    // The TRIGGER's own chat connection (§8.4-3 — the verb is host-only, so the host IS the trigger here).
    const host = await deps.resolveHostPrincipal(hostUserId);
    let conn: Resolved<"chat">;
    try {
      conn = await roomWindowed(deps, chatId, (await deps.connection.resolve({ task: "chat", principal: host })).resolved as Resolved<"chat">);
    } catch (err) {
      if (isUnresolvable(err)) {
        logger.warn({ event: "rpg.resync.unresolvable", chatId }, "rpg resync: the host's chat connection did not resolve — no rebuild");
        return { ok: false, reason: RESYNC_UNRESOLVABLE_REASON };
      }
      throw err;
    }
    // NO WRITE PATH AT ALL ⇒ no rebuild (the resync's OWN capability gate — it is not a per-turn delivery mode,
    // so it keys on the capability directly, mirroring the flush's F2 posture: a resync on a manual-steering
    // connection would predictably fail and, on hosted creds, cost real spend). TWO vehicles satisfy it now:
    // wire tools (the catch-up round) or the structured writer (the degrade where no forced round is carried).
    const toolRound = carriesForcedToolRound(conn) && hasToolWriter(generationOf(conn));
    if (!(toolRound || hasStructuredWriter(generationOf(conn)))) {
      logger.warn({ event: "rpg.resync.readonly", chatId, model: conn.model, api: conn.api }, "rpg resync: connection has no state writer — no rebuild");
      return { ok: false, reason: RESYNC_READONLY_REASON };
    }
    // Establish-EVERYTHING (`reconcile: true`) over the WHOLE window (`extractionContext: "full"`, forced — the
    // resync deliberately re-reads the deepest story, regardless of the game's per-turn context knob).
    const { refs, playerDisplayName, config } = await resolveExtractionRefs(deps, chatId, baseState, true);
    const resyncConfig: RpgGameConfig = { ...config, extractionContext: "full" };
    // PROSE-1 S4 — a HOST DOOR resolves its OWN prose view (the injected chat op), because there is no turn to
    // capture one from: the two invocation classes are genuinely different, and that difference is the whole
    // reason both arms exist (see `ChatRpgOps.resolveChatPresetProse`). It runs the SAME ladder the turn does
    // (GM-preset redirect → the preset's `promptConfig.prose` → `composeProse`), so a host who retunes a plane
    // teach sees it on the rebuild exactly as they see it on a turn — the inherited-preview rule.
    const prose = await deps.rpgChatOps.resolveChatPresetProse(chatId);
    const inputs: PromptInputs = { config: resyncConfig, refs, playerDisplayName, reconcile: true, prose };
    const fitted = await fitResyncPrompt(deps, { chatId, conn, baseState, inputs, toolRound });
    if (!fitted.ok) {
      return fitted;
    }
    const userPrompt = fitted.userPrompt;
    const args = { chatId, conn, baseState, inputs, userPrompt };
    const observed = withGenerationObservation(deps, {
      chatId,
      turnId: deps.idSource.typeId(ID_PREFIX.chatTurn),
      sourceMessageId: null,
      sourceVariantId: null,
    });
    return toolRound ? await resyncViaToolRound(observed, args) : await resyncViaStructured(observed, args);
  };
}

/** The resync's STRUCTURED arm — unchanged in every respect except that it is now the DEGRADE (a wire with no
 *  `tools[]` takes it) rather than the only vehicle. Same schema, same salvage, same RESYNC-OR refusal grammar. */
async function resyncViaStructured(
  deps: RpgRoundsDeps,
  args: {
    readonly chatId: ChatId;
    readonly conn: Resolved<"chat">;
    readonly baseState: RpgSnapshotState;
    readonly inputs: PromptInputs;
    readonly userPrompt: string;
  },
): Promise<{ readonly ok: true; readonly delta: RpgStateDelta } | { readonly ok: false; readonly reason: string }> {
  const { chatId, conn, baseState, inputs, userPrompt } = args;
  const { refs } = inputs;
  const ctx: ExtractCtx = {
    conn,
    chatId,
    systemPrompt: extractionSystem(inputs),
    userPrompt,
    schema: constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs),
    // A HOST DOOR has no cancellation to inherit: it is verb-initiated, and the tRPC request's signal is not
    // threaded down to verbs on this tree. Stated, not defaulted — a future arm must answer the question.
    signal: undefined,
  };
  let text: string;
  try {
    text = await extractStructured(deps, ctx);
  } catch (err) {
    if (err instanceof GenerationObservationPersistenceError) {
      throw err;
    }
    logger.warn({ event: "rpg.resync.failed", chatId, model: conn.model, api: conn.api, err }, "rpg resync extraction failed");
    // THE HOST HEARS IT. This catch used to return an empty delta, which the verb reported as "nothing to
    // resync" — so a provider that refused every single call (live, on the DEFAULT hosted backend) looked
    // exactly like a story with no drift. The provider's own sentence rides out to the toast.
    return { ok: false, reason: `${RESYNC_FAILED_REASON} ${errorMessage(err)}` };
  }
  // EXT-4a — the resync reads the SAME structured emission the in-turn degrade does, so it salvages the same
  // way: one malformed entry in a deep-window rebuild must not throw away the other five planes' worth of
  // re-established state (the resync is the expensive call — discarding it whole is the worst place to be
  // all-or-nothing).
  const { extraction, dropped, stripped } = salvageExtraction(safeJson(text));
  if (dropped.length > 0) {
    logger.warn(
      { event: "rpg.resync.unparseable", chatId, model: conn.model, api: conn.api, dropped },
      "rpg resync: plane(s)/entry(ies) did not conform — DROPPED (the rest of the rebuild still applies)",
    );
  }
  logStrippedKeys({ chatId, model: conn.model, api: conn.api, vehicle: "resync", event: "rpg.resync.stripped", stripped });
  const participantIndex = buildActorRefIndex(await deps.rpgChatOps.resolveRpgParticipants(chatId));
  const delta = extractionToStateDelta(baseState, extraction, createExtractionMints(deps.idSource), { participantIndex, trackerDefs: inputs.config.trackers });
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
  return { ok: true, delta };
}
