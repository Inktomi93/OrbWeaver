// The READ-side delivery verdicts (the readonly-trackers pill, the fold guard) and the state-round fit check, both
// over the room funder's chat connection.

import { coEmitsProseWithTools } from "@orb/contracts/inference";
import { buildToolRoundWireTools, constrainExtractionSchema, rpgExtractionSchema } from "@orb/contracts/rpg";
import type { Resolved } from "@orb/inference";
import { carriesForcedToolRound, generationOf } from "@orb/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { PromptInputs, RpgRoundsDeps } from "#src/domain/rpg/contract/rounds.ts";
import type { RpgContext } from "#src/domain/rpg/contract/service.ts";
import { findGameByChat } from "#src/domain/rpg/persistence/games.ts";
import { deriveTrackersReadOnly, hasStructuredWriter, primaryStateRound, structuredVehicleUnavailable } from "#src/domain/rpg/substrate/readonly-axis.ts";
import { stateRoundNeededTokens } from "#src/domain/rpg/substrate/state-round-fit.ts";
import { buildExtractionUserPrompt, extractionSystem, resolveExtractionRefs, toolRoundSystem } from "./prompts.ts";
import { resolveFunderChat, roomWindowed } from "./round-connection.ts";
import { structuredRound, structuredShapes } from "./structured.ts";

/** Build the honest-arms `resolveStateDelivery` op (§4.6 — the READ-side CP pill + the D112 fold guard): resolve
 *  the ROOM's chat connection capability ONCE (via `resolveChat` — the SAME per-chat-routing verb a turn resolves
 *  through, NOT the host's global `resolveRole` default, stickler F1) and read BOTH delivery verdicts off it:
 *  `trackersReadOnly` (the rpg-owned `deriveTrackersReadOnly` mode→writer mapping) and `foldGuarded` (the
 *  contracts-owned `coEmitsProseWithTools` read — a wire that goes mute under tool attachment must not be handed
 *  the fold's terminal tools). rpg gets CAPABILITY FACTS, never the credential/source they were derived from.
 *  A game with no host, or an unresolvable connection (a `resolveChat` that THROWS a connection-resolution
 *  error — incoherent (api,source) or the agent-sdk model-heal fail-loud), is readonly AND fold-guarded by
 *  construction (never assume a write path; a READ degrades to read-only trackers, never a 500).
 *  This mirrors the flush's F2 gate so the pill and the actual round-eligibility agree. */
export function buildResolveStateDelivery(deps: RpgRoundsDeps): RpgContext["resolveStateDelivery"] {
  // Nothing resolved ⇒ no model write path AND no fold — the fail-closed verdict every degraded arm returns.
  const closed = { trackersReadOnly: true, foldGuarded: true, canPopulate: false, structuredUnavailable: false };
  return async (chatId, funderUserId) => {
    const game = await findGameByChat(deps.db, chatId);
    if (game === undefined || funderUserId === null) {
      return closed; // no game, or no host to fund a turn — a defensive readonly is harmless
    }
    // A `no-connection` / requirement refusal is READONLY BY CONSTRUCTION — the same contract as the
    // missing-game/missing-host arm above.
    const conn = await resolveFunderChat(deps, funderUserId);
    if (conn === null) {
      return closed;
    }
    const capability = generationOf(conn);
    return {
      trackersReadOnly: deriveTrackersReadOnly(game.config.extractionMode, capability),
      foldGuarded: !coEmitsProseWithTools(capability),
      canPopulate: hasStructuredWriter(capability),
      structuredUnavailable: structuredVehicleUnavailable(game.config.stateCaptureVehicle, capability),
    };
  };
}

/**
 * The text the state round's first request carries on `conn`: its system prompt, its user prompt, and its tool or
 * schema payload. The caller supplies its dispatcher's tool-round choice: API support alone does not select
 * the resync vehicle. The same builders produce the priced and sent payloads.
 */
export function stateRoundRequestText(conn: Resolved<"chat">, inputs: PromptInputs, userPrompt: string, toolRound: boolean): readonly string[] {
  const { refs, config, prose } = inputs;
  if (!toolRound) {
    return [extractionSystem(inputs), userPrompt, JSON.stringify(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs))];
  }
  const wireTools = buildToolRoundWireTools(refs, config, prose);
  const generation = generationOf(conn);
  const shapes = structuredShapes(conn, refs, wireTools);
  const primary = primaryStateRound(config.stateCaptureVehicle, generation, shapes.plans);
  if (primary !== null) {
    const round = structuredRound(primary, shapes.schemas()[primary], wireTools, { lead: toolRoundSystem(inputs), prose });
    return [round.systemPrompt, userPrompt, JSON.stringify(round.format.schema)];
  }
  return [toolRoundSystem(inputs), userPrompt, JSON.stringify(wireTools)];
}

/** Build the `resolveStateRoundFit` op: price the round a turn would run on the funder's connection over `baseState`
 *  and the room's own prompt, against that connection's window. The story slice and the latest beat vary per turn and
 *  are left out, so an overflow here is one every turn pays. The window is never raised behind the host's back
 *  (owner ruling); the verdict names the connection whose setting fixes it. */
export function buildResolveStateRoundFit(deps: RpgRoundsDeps): RpgContext["resolveStateRoundFit"] {
  return async (chatId, funderUserId, baseState) => {
    const conn = await resolveFunderChat(deps, funderUserId);
    if (conn === null) {
      return null;
    }
    const { refs, playerDisplayName, config } = await resolveExtractionRefs(deps, chatId, baseState, false);
    // A read has no turn to capture prose from, so this walks the ladder the next turn will (GM redirect, then the
    // preset). It differs from the turn's captured bag only in user-homed slots, and every slot the round reads is
    // preset-homed (`RPG_PROSE_SLOTS`), so the bytes priced are the bytes the round sends.
    const prose = await deps.rpgChatOps.resolveChatPresetProse(chatId);
    const inputs: PromptInputs = { config, refs, playerDisplayName, reconcile: false, prose };
    const userPrompt = buildExtractionUserPrompt([], baseState, config, prose);
    const sent = await roomWindowed(deps, chatId, conn);
    const windowTokens = generationOf(sent).context.window;
    return stateRoundNeededTokens(stateRoundRequestText(sent, inputs, userPrompt, carriesForcedToolRound(sent))) > windowTokens
      ? { connectionId: conn.connectionId, windowTokens }
      : null;
  };
}
