// The host `populateFromCharacter` model call: resolves the room connection as the host, runs one constrained round
// over the card and opening, and folds it through the same delta path a turn round uses.

import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { ExtractionRefs } from "@orb/contracts/rpg";
import { composePopulateTeaching, constrainPopulateSchema, rpgGameConfigSchema, rpgPopulateSchema, salvagePopulate } from "@orb/contracts/rpg";
import type { Resolved } from "@orb/inference";
import { generationOf } from "@orb/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { ChatId, UserId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { RpgCardCorpus } from "#domain/chat";
import { logger } from "#foundation/observability";
import { createRpgRoundsContext } from "#src/domain/rpg/context.ts";
import type { ExtractCtx, RpgRoundsAssemblyDeps, RpgRoundsDeps } from "#src/domain/rpg/contract/rounds.ts";
import type { RpgContext } from "#src/domain/rpg/contract/service.ts";
import { findGameByChat } from "#src/domain/rpg/persistence/games.ts";
import { hasStructuredWriter } from "#src/domain/rpg/substrate/readonly-axis.ts";
import { buildActorRefIndex, extractionToStateDelta } from "../apply.ts";
import { createExtractionMints } from "../mints.ts";
import { extractStructured, isUnresolvable, roomWindowed } from "./round-connection.ts";
import { logExtractionOutcome, safeJson } from "./round-log.ts";

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// POPULATE — the HOST BORN-STATE model call (owner ruling 2026-08-01). The resync's sibling, over the CARD.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Same host-principal seam as the resync (a host-INITIATED interactive action: resolve the ROOM connection AS
// THE HOST fresh at the verb, consent is the host's OWN, `input.hostUserId` is the room host by ROLE — never a
// caller-supplied id), same structured-writer gate, same errors-as-data REFUSAL grammar (POPLOUD — a round
// that could not run reports `{ok:false, reason}`, never an empty delta). Two differences,
// both deliberate:
//   • the CORPUS is the character CARD + the room's OPENING line, not the story window — a born-state round
//     establishes what the character walked in with, and re-deriving from play is the resync's job.
//   • the SCHEMA is `rpgPopulateSchema`, which ADDS the hand-only identity sheet and REMOVES every live-play
//     plane. The removal is structural (absent from the schema AND rebuilt empty by `salvagePopulate`), so this
//     round cannot write scene/party/trackers/journal even on a wire that ignores the grammar.
// The state half still folds through the SAME `extractionToStateDelta` the turn vehicles use (locks/heal/ghost
// guard all hold verbatim) — the populate round is not a second write path, only a second READER.

/** The populate user-turn body: the two evidence blocks + the target the writes must name. The CURRENT state is
 *  deliberately NOT sent — a born-state round has nothing to reconcile against, and showing it invites the
 *  model to restate what is already there instead of reading the card.
 *
 *  Every block is an `rpg.populate.*` SLOT (populate census rows 4-7), which is why this takes the round's
 *  resolved prose view: the born-state prompt is the host's to re-frame in the preset Templates tab, exactly
 *  like the teaching half `composePopulateTeaching` composes. The card BODY and the opening ride in as
 *  PRE-SUBSTITUTION tokens rather than being concatenated around a label, so an override can move them. */
function populateUserPrompt(corpus: RpgCardCorpus, targetRef: string, prose: ProseOverrides): string {
  const blocks = [
    resolveProseText("rpg.populate.cardBlock", prose, {
      cardName: corpus.name,
      // A card that renders to nothing gets the fallback SENTENCE, not an empty block — a truncated-looking
      // prompt is what teaches a model to fill the gap in for itself.
      cardBody: corpus.card === "" ? resolveProseText("rpg.populate.emptyCard", prose) : corpus.card,
    }),
  ];
  if (corpus.opening !== "") {
    blocks.push(resolveProseText("rpg.populate.openingBlock", prose, { opening: corpus.opening }));
  }
  blocks.push(resolveProseText("rpg.populate.targetLine", prose, { targetRef }));
  return blocks.join("\n\n");
}

// The three sentences a populate REFUSAL can carry (`PopulateResult.reason` → the host's toast) — the resync's
// `RESYNC_*_REASON` trio in the born-state vocabulary. Written as host prose, not log vocabulary: the person
// reading them clicked a button and is owed what to do next. Each pairs with the `rpg.populate.*` warn the same
// branch already emitted — the log is for us, the reason is for them.
const POPULATE_UNRESOLVABLE_REASON = "this room's connection didn't resolve, so the card was never read — check the chat's model/connection.";

const POPULATE_READONLY_REASON = "this room's model can't write structured state, so there's nothing to fill with — switch to a connection that can.";

const POPULATE_FAILED_REASON = "the model call failed, so nothing was filled:";

/** Resolve the ROOM connection AS THE HOST for the populate round, gated on the STRUCTURED writer that round
 *  drives. ERRORS-AS-DATA (POPLOUD): a refusal carries the sentence the host reads, so an unresolvable backend
 *  and a writer-less wire are DISTINCT from a card that established nothing (they used to collapse to the same
 *  empty delta). Both are LOGGED too. Hoisted out of the round so it stays under the complexity ceiling. */
async function resolveHostRoundConnection(
  deps: RpgRoundsDeps,
  chatId: ChatId,
  hostUserId: UserId,
): Promise<{ readonly ok: true; readonly conn: Resolved<"chat"> } | { readonly ok: false; readonly reason: string }> {
  const host = await deps.resolveHostPrincipal(hostUserId);
  let conn: Resolved<"chat">;
  try {
    conn = await roomWindowed(deps, chatId, (await deps.connection.resolve({ task: "chat", principal: host })).resolved as Resolved<"chat">);
  } catch (err) {
    if (isUnresolvable(err)) {
      logger.warn({ event: "rpg.populate.unresolvable", chatId }, "rpg populate: the host's chat connection did not resolve — no round");
      return { ok: false, reason: POPULATE_UNRESOLVABLE_REASON };
    }
    throw err;
  }
  if (!hasStructuredWriter(generationOf(conn))) {
    logger.warn({ event: "rpg.populate.readonly", chatId, model: conn.model, api: conn.api }, "rpg populate: connection has no structured writer — no round");
    return { ok: false, reason: POPULATE_READONLY_REASON };
  }
  return { ok: true, conn };
}

/** The populate round's REF surface: the ONE target actor and nothing else. Every other axis is empty because
 *  the populate schema has no plane that reads it (no party/tracker/scene arms), and `establishScene` is all
 *  false for the same reason — there is no scene to establish from a card. */
function populateRefs(targetRef: string): ExtractionRefs {
  return {
    actorRefs: [targetRef],
    trackerWriteGroups: [],
    gameTrackerKeys: { deltaKeys: [], setKeys: [] },
    conditionNames: [],
    establishScene: { location: false, timeOfDay: false, presentCast: false },
  };
}

/** Build the host `populateFromCharacter` model call. Resolves the room connection AS THE HOST + gates on the
 *  structured writer (either failing ⇒ an empty no-op delta), runs ONE constrained round over the card +
 *  opening, and folds the two state planes through the SAME `extractionToStateDelta` path a turn round uses. */
export function buildRunPopulateExtraction(input: RpgRoundsAssemblyDeps): RpgContext["runPopulateExtraction"] {
  const deps = createRpgRoundsContext(input);
  return async ({ chatId, hostUserId, targetRef, baseState, corpus }) => {
    const resolved = await resolveHostRoundConnection(deps, chatId, hostUserId);
    if (!resolved.ok) {
      return resolved;
    }
    const conn = resolved.conn;
    // The teaching reads the game's own config (the deception clause + the two plane fragments), with the ONE
    // target as the whole ref surface.
    const game = await findGameByChat(deps.db, chatId);
    const refs = populateRefs(targetRef);
    // A HOST DOOR resolves its own prose view, exactly as the resync does (see `buildRunResyncExtraction`) —
    // the born-state round teaches the SAME inventory/quest planes a turn round does, so a host's edit to one
    // of them must land here too or the two surfaces would teach the card two different vocabularies.
    const prose = await deps.rpgChatOps.resolveChatPresetProse(chatId);
    const ctx: ExtractCtx = {
      conn,
      chatId,
      systemPrompt: `${resolveProseText("rpg.populate.systemHeader", prose)}\n\n${composePopulateTeaching({ config: game?.config ?? rpgGameConfigSchema.parse({}), refs, prose })}`,
      userPrompt: populateUserPrompt(corpus, targetRef, prose),
      schema: constrainPopulateSchema(projectJsonSchema(rpgPopulateSchema), targetRef),
      // A HOST DOOR has no cancellation to inherit — the resync's posture verbatim (see `resyncViaStructured`).
      signal: undefined,
    };
    let text: string;
    try {
      text = await extractStructured(deps, ctx);
    } catch (err) {
      logger.warn({ event: "rpg.populate.failed", chatId, model: conn.model, api: conn.api, err }, "rpg populate round failed");
      // THE HOST HEARS IT (POPLOUD — the resync's catch verbatim). This used to return an empty delta, which
      // the verb reported as "this card had nothing to fill" — so a provider that refused every structured
      // request looked exactly like an empty card. The provider's own sentence rides out to the toast.
      return { ok: false, reason: `${POPULATE_FAILED_REASON} ${errorMessage(err)}` };
    }
    // EXT-4a salvage, per plane / per entry — a malformed item costs that item, never the quests beside it.
    const { sheet, extraction, dropped } = salvagePopulate(safeJson(text));
    if (dropped.length > 0) {
      logger.warn(
        { event: "rpg.populate.unparseable", chatId, model: conn.model, api: conn.api, dropped },
        "rpg populate: plane(s)/entry(ies) did not conform — DROPPED (the rest of the round still applies)",
      );
    }
    const participantIndex = buildActorRefIndex(await deps.rpgChatOps.resolveRpgParticipants(chatId));
    const delta = extractionToStateDelta(baseState, extraction, createExtractionMints(deps.idSource), {
      participantIndex,
      trackerDefs: game?.config.trackers ?? [],
    });
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
    // The wire says `title`; the sheet stores `className` (the takeover has rendered it as the title since the
    // tracked-field unification). ONE mapping, here at the parse seam — the domain never learns two names.
    return {
      ok: true,
      delta: {
        statePatch: delta.statePatch,
        sheet: { ...(sheet?.title === undefined ? {} : { className: sheet.title }), ...(sheet?.level === undefined ? {} : { level: sheet.level }) },
      },
    };
  };
}
