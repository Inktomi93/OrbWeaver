// Composition seam for the rpg domain (rpg-design/05 §4.10, the LITE vertical). Owns no business logic — it
// assembles the `RpgContext` DI bundle (db-scoped persistence + injected clock/id-mints/dice-CSPRNG + the five
// injected cross-feature ops + the bus emit + the reliable-mode `runExtraction` impl) over the already-built
// sibling front doors, builds the `RpgService`, returns the `ChatRpgOps` object chat receives by injection (the
// `input.rpg ?? null` seam, `compose/chat.ts`), and registers the 7 cheap-mode state tools into the ONE
// tool-use registry (the imagery precedent, `compose/imagery.ts`).
//
// FORWARD-REF: chat composes BEFORE rpg (the keystone order), yet chat's turn hooks call into rpg's ops. The
// `ChatRpgOps` object rpg builds here is a forward-ref delegate over the rpg service — it is handed to chat at
// the same keystone step (the crew-delegate precedent). rpg's own chat-facing ops (getMembership/setRpgPointer/
// resolveRpgRoster/postNarratorMessage) flow the OTHER way, off `chatCompose.rpgChatOps` — chat learns nothing
// rpg-shaped, rpg learns no chat tables (§2 one-directional flow, both directions principal-free).
//
// THE `runExtraction` IMPL (§4.6 reliable mode — the delivery-model amendment): a DEDICATED structured-output
// turn. It resolves the host's CHAT-role connection (`resolveHostPrincipal` + `connection.resolveRole`), reads
// the committed beat text, and drives ONE model call with `responseFormat` = the projected `rpgExtractionSchema`
// (the shared-plane proof: the extraction is "a batch of the tool calls the model would otherwise have made").
// The parsed extraction folds into an `RpgStateDelta` the accumulator flushes exactly like a cheap-mode turn.
// A game whose model has no structured-output writer capability never reaches here (readonly/manual-steering).

import { randomInt } from "node:crypto";
import type { Principal } from "@orb/contracts/identity";
import { rpgExtractionSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { MessageVariantId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, newId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { eq } from "drizzle-orm";
import type { ConnectionService } from "#domain/connection";
import type { RpgContext, RpgRunExtraction, RpgService } from "#domain/rpg";
import {
  buildRosterRefIndex,
  createRpgChatOps,
  createRpgService,
  createRpgStagingStore,
  deriveTrackersReadOnly,
  extractionToStateDelta,
  findGameByChat,
  publishRpgEvent,
  rpgToolDefinitions,
} from "#domain/rpg";
import type { ToolUseService } from "#domain/tool-use";
import type { ProviderExecutor } from "#infra/providers";
import type { ChatComposeResult } from "./chat";
import { minter } from "./minter";

/** The structured-output schema NAME the reliable extraction passes as `responseFormat.name` (OpenAI
 *  `json_schema.name`; Anthropic tool name). One home — no scattered magic string. */
const EXTRACTION_SCHEMA_NAME = "rpg_state_extraction";

/** What the rpg seam needs from the composition root: db + the sibling front doors rpg's injected ops route
 *  through (chat's rpg-facing ops, the connection resolve, the executor, the host-principal bridge, the tool
 *  registry). */
export interface RpgComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  /** chat's rpg-facing ops (getMembership/postNarratorMessage/setRpgPointer/resolveRpgRoster) — off chat's
   *  compose result (chat composes first). rpg closes over these; chat learns nothing rpg-shaped. */
  readonly rpgChatOps: ChatComposeResult["rpgChatOps"];
  readonly connection: Pick<ConnectionService, "resolveRole">;
  readonly executor: Pick<ProviderExecutor, "summarize">;
  /** The host's REAL `Principal` by userId (the chat-role connection runs as the host, D19). */
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  /** The ONE tool-use registry — rpg registers its 7 state tools into it (the imagery precedent). */
  readonly toolUse: Pick<ToolUseService, "register">;
}

/** The rpg compose product: the verb surface (transport consumes it) + the `ChatRpgOps` chat receives by
 *  injection (the `input.rpg ?? null` seam). */
export interface RpgComposeResult {
  readonly service: RpgService;
  readonly chatOps: ReturnType<typeof createRpgChatOps>;
}

// THE HOST resolves by ROLE (the injected `deps.rpgChatOps.resolveHostUserId`, role='host' — D19), never join
// order: `acceptHostHandoff` (D64) swaps roles in place, so the first-joined human is NOT the host (stickler F3).
// Both the reliable extraction (whose human funds the model call) and the capability verdict read it.

/** Read a committed variant's beat text (the extraction reasons against it). Empty for a gone variant. */
async function readBeat(db: Db, variantId: MessageVariantId): Promise<string> {
  const rows = await db.select({ content: messageVariants.content }).from(messageVariants).where(eq(messageVariants.id, variantId)).limit(1);
  return rows.at(0)?.content ?? "";
}

/** The reliable-mode extraction system prompt: the model reads the committed beat + the resolved base state and
 *  emits the WHOLE state delta as ONE structured object. No user-facing prose — structured output is the fit. */
const EXTRACTION_SYSTEM =
  "You are a game-state extractor. Read the latest story beat and the current tracked state, then output ONLY " +
  "the changes this beat made to the game state, as a single structured object matching the schema. Emit an " +
  "empty object when nothing tracked changed. Never invent state the beat does not support.";

/** Build the reliable-mode `runExtraction` op (§4.6). Resolves the host chat-role connection, reads the beat,
 *  drives ONE structured-output call, and folds the parsed extraction into an `RpgStateDelta`. On any failure
 *  to resolve a writer / parse the output it returns an EMPTY delta (the byte-identical non-writing turn — a
 *  broken extraction never corrupts canon, the errors-as-data posture). */
function buildRunExtraction(deps: RpgComposeDeps): RpgRunExtraction {
  const responseFormat = { name: EXTRACTION_SCHEMA_NAME, schema: projectJsonSchema(rpgExtractionSchema) };
  return async ({ chatId, variantId, baseState }) => {
    const empty = { statePatch: {}, journal: [] };
    const hostUserId = await deps.rpgChatOps.resolveHostUserId(chatId);
    if (hostUserId === null) {
      return empty;
    }
    const host = await deps.resolveHostPrincipal(hostUserId);
    const conn = await deps.connection.resolveRole({ role: "chat", principal: host });
    const beat = await readBeat(deps.db, variantId);
    const stateJson = JSON.stringify(baseState);
    const result = await deps.executor.summarize({
      credential: conn.credential,
      model: conn.model,
      inputs: [{ systemPrompt: EXTRACTION_SYSTEM, userPrompt: `CURRENT STATE:\n${stateJson}\n\nLATEST BEAT:\n${beat}` }],
      responseFormat,
    });
    const text = result.items.at(0)?.text ?? "";
    const parsed = rpgExtractionSchema.safeParse(safeJson(text));
    if (!parsed.success) {
      return empty; // a non-conforming extraction never writes — the model gets one shot, no retry corruption
    }
    // The roster index resolves an extracted party/inventory target NAME to its roster ref (F2 — the same
    // first-class resolution the cheap-mode tools use; a reliable write on a party member must render too).
    const roster = buildRosterRefIndex(await deps.rpgChatOps.resolveRpgRoster(chatId));
    return extractionToStateDelta(baseState, parsed.data, { item: () => newId(), quest: () => newId(), objective: () => newId() }, roster);
  };
}

/** Parse structured-output text to a value, or `null` on non-JSON (the schema parse then fails → empty). */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function buildRpg(deps: RpgComposeDeps): RpgComposeResult {
  const ctx: RpgContext = {
    db: deps.db,
    now: deps.now,
    ids: {
      game: minter(ID_PREFIX.rpgGame),
      snapshot: minter(ID_PREFIX.rpgSnapshot),
      sheet: minter(ID_PREFIX.rpgSheet),
      widget: minter(ID_PREFIX.rpgWidget),
      journal: minter(ID_PREFIX.rpgJournal),
      checkpoint: minter(ID_PREFIX.rpgCheckpoint),
      // Quest ids are PLAIN strings minted inside the snapshot blob (no table, no FK — §4.1).
      quest: () => newId(),
    },
    staging: createRpgStagingStore(),
    getMembership: deps.rpgChatOps.getMembership,
    setPointer: deps.rpgChatOps.setRpgPointer,
    resolveRoster: deps.rpgChatOps.resolveRpgRoster,
    postNarratorMessage: deps.rpgChatOps.postNarratorMessage,
    resolveTrackersReadOnly: buildResolveTrackersReadOnly(deps),
    runExtraction: buildRunExtraction(deps),
    // The feature-root rpg bus emit (§4.9) — a verb/flush calls it after its durable write; fire-and-forget.
    emitBus: publishRpgEvent,
    // The dice CSPRNG (bake-once, server-authoritative — a client seed is never honored, §4.4).
    randomInt: (max) => randomInt(max),
  };
  const service = createRpgService(ctx);
  // Register the 7 cheap-mode state tools into the ONE registry (additive; the imagery precedent).
  for (const def of rpgToolDefinitions(ctx)) {
    deps.toolUse.register(def);
  }
  return { service, chatOps: createRpgChatOps(ctx) };
}

/** Build the honest-arms `resolveTrackersReadOnly` op (§4.6): resolve the host chat-role connection capability
 *  for THIS game's mode and delegate to the rpg-owned `deriveTrackersReadOnly` mapping. A game with no host, or
 *  an unresolvable connection, is readonly by construction (never assume a write path). */
function buildResolveTrackersReadOnly(deps: RpgComposeDeps): RpgContext["resolveTrackersReadOnly"] {
  return async (chatId) => {
    const game = await findGameByChat(deps.db, chatId);
    if (game === undefined) {
      return true; // no game — the verb caller resolves game-ness itself; a defensive readonly is harmless
    }
    const hostUserId = await deps.rpgChatOps.resolveHostUserId(chatId);
    if (hostUserId === null) {
      return true;
    }
    const host = await deps.resolveHostPrincipal(hostUserId);
    const conn = await deps.connection.resolveRole({ role: "chat", principal: host });
    return deriveTrackersReadOnly(game.config.extractionMode, conn.capability);
  };
}
