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
// turn. It rides the CHARACTER turn's ALREADY-RESOLVED connection + consent verdict (`input.turnConnection`,
// threaded from the engine through the flush — stickler F1), reads the committed beat text, and drives ONE model
// call with `responseFormat` = the projected `rpgExtractionSchema` (the shared-plane proof: the extraction is "a
// batch of the tool calls the model would otherwise have made"). It NEVER re-resolves the host's global chat
// default and NEVER force-stamps consent — a room on vllm runs its round on vllm, a metered-sub round inherits
// the turn's owner-consent belt verdict. The parsed extraction folds into an `RpgStateDelta` the accumulator
// flushes exactly like a cheap-mode turn. A game whose resolved connection has no structured-output writer
// capability is gated OUT by the flush's readonly check (F2) before it reaches here.

import { randomInt } from "node:crypto";
import type { ResolvedConnection, RouteChatAssignment } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { ExtractionRefs, RpgExtraction, RpgSnapshotState, RpgToolCall } from "@orb/contracts/rpg";
import { constrainExtractionSchema, RPG_NO_CHANGES_TOOL, rpgExtractionSchema, toolCallsToExtraction } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { chats, messageVariants } from "@orb/db";
import type { ChatId, MessageVariantId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, newId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { eq } from "drizzle-orm";
import { parseChatMetadata } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import { AgentModelHealError, ConnectionRoutingError } from "#domain/connection";
import type { RpgContext, RpgRunExtraction, RpgRunToolRound, RpgService } from "#domain/rpg";
import {
  buildRosterRefIndex,
  createRpgChatOps,
  createRpgFlushBarrier,
  createRpgService,
  createRpgStagingStore,
  deriveTrackersReadOnly,
  extractionToStateDelta,
  findGameByChat,
  publishRpgEvent,
  rpgToolDefinitions,
} from "#domain/rpg";
import type { ToolUseService } from "#domain/tool-use";
import { logger } from "#foundation/observability";
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
  /** `resolveChat` resolves the ROOM's connection (per-chat routing overlay, `metadata.providerRouting`) for the
   *  READ-side `trackersReadOnly` pill — the SAME verb the character turn resolves through (`compose/chat.ts`),
   *  never the host's global `resolveRole` default (stickler F1). `getOrSkinTierModels` feeds the agent-sdk
   *  extraction arm's mode-2 tier→slug map. The state ROUNDS re-resolve NOTHING — they ride the character turn's
   *  already-resolved `input.turnConnection` threaded from the engine. */
  readonly connection: Pick<ConnectionService, "resolveChat" | "getOrSkinTierModels">;
  /** The extraction rides the `structured` role on the array/vLLM backends (the one-shot schema-constrained
   *  PRIMITIVE — owner ruling 2026-07-27, split from summarize) AND `runChatTurn` (the SDK outputFormat path)
   *  when the host connection is `agent-sdk` — the metered-sub credential firewall stays intact (D17), the
   *  chat role gates `max-pro-sub` behind owner consent (funded by the host, inherited from the character turn). */
  readonly executor: Pick<ProviderExecutor, "structured" | "runChatTurn">;
  /** The host's REAL `Principal` by userId — the READ-side `trackersReadOnly` pill resolves the room connection
   *  as the host (D19). The state rounds no longer need it (they ride the threaded turn connection). */
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
 *  emits the WHOLE state delta as ONE structured object. No user-facing prose — structured output is the fit.
 *  The projected schema marks all five array fields REQUIRED (zod `.default([])` in output mode), so the
 *  "nothing changed" shape is EMPTY ARRAYS, not a literal `{}` (stickler S5 — a bare `{}` fails the Anthropic
 *  runtime's schema validation and burns a retry every quiet turn; enforcing backends force the arrays anyway). */
const EXTRACTION_SYSTEM =
  "You are a game-state extractor. Read the latest story beat and the current tracked state, then output ONLY " +
  "the changes this beat made to the game state, as a single structured object matching the schema. When nothing " +
  "tracked changed, emit the object with every array field EMPTY ([]). Never invent state the beat does not support.";

/** The one user-turn body both extraction arms send: current state + the latest committed beat. */
function extractionUserPrompt(stateJson: string, beat: string): string {
  return `CURRENT STATE:\n${stateJson}\n\nLATEST BEAT:\n${beat}`;
}

/** Emit the extraction JSON TEXT for a `agent-sdk` host connection via the CHAT role's structured-output
 *  path (`responseFormat` → the SDK `outputFormat: json_schema`), NOT the summarize dispatcher (whose
 *  firewall excludes the metered sub, intentionally). A READ-ONLY structured emission: NO tools / MCP
 *  server mounted (extraction never mutates through a tool turn). The chat role gates `max-pro-sub` behind
 *  owner consent — the host funds this turn, so consent is the host's (§4.6 / D17). Depends on
 *  `getOrSkinTierModels` because the agent-sdk arm requires the mode-2 tier→slug map even on a sub turn
 *  (the firewall builds the OR skin env only for the OR source, but the request field is non-optional). */
/** The resolved per-call inputs both extraction arms consume — the CHARACTER turn's resolved connection + its
 *  enforced consent verdict + the prompts + the ref-constrained response schema (R1). Bundled to keep each arm
 *  under the param-count gate. `conn`/`ownerConsented` come from `input.turnConnection` — never a re-resolve
 *  or a force-stamped `true` (stickler F1). */
interface ExtractCtx {
  readonly conn: ResolvedConnection;
  readonly ownerConsented: boolean;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly schema: Record<string, unknown>;
}

async function extractViaChat(deps: RpgComposeDeps, ctx: ExtractCtx): Promise<string> {
  const orSkinTierModels = await deps.connection.getOrSkinTierModels();
  const result = await deps.executor.runChatTurn({
    api: "agent-sdk",
    model: ctx.conn.model,
    credential: ctx.conn.credential,
    capability: ctx.conn.capability,
    params: {},
    systemPrompt: { static: ctx.systemPrompt, dynamic: "" },
    prompt: ctx.userPrompt,
    orSkinTierModels,
    // The chat-role firewall requires owner consent for a max-pro-sub credential. This is the character turn's
    // ENFORCED verdict (`resolveOwnerConsented`, engine.ts), inherited — NOT a force-stamped `true`: a
    // member-triggered turn on a non-consented sub already refused before commit, so no round ever fires.
    ownerConsented: ctx.ownerConsented,
    responseFormat: { name: EXTRACTION_SCHEMA_NAME, schema: ctx.schema },
  });
  return result.reply;
}

/** Emit the extraction JSON TEXT for a NON-agent-sdk host connection (vLLM backend / OpenRouter
 *  chat-completions|responses) via the `structured` dispatcher — the one-shot schema-constrained generation
 *  PRIMITIVE (owner ruling 2026-07-27: rpg extraction summarizes NOTHING; it rides `structured`, not
 *  `summarize`). Its firewall serves openrouter|vllm, same as before. */
async function extractViaStructured(deps: RpgComposeDeps, ctx: ExtractCtx): Promise<string> {
  const result = await deps.executor.structured({
    credential: ctx.conn.credential,
    model: ctx.conn.model,
    inputs: [{ systemPrompt: ctx.systemPrompt, userPrompt: ctx.userPrompt }],
    responseFormat: { name: EXTRACTION_SCHEMA_NAME, schema: ctx.schema },
  });
  return result.items.at(0)?.text ?? "";
}

/** The SEMANTIC self-ref the human player's actor always answers to — a STABLE token independent of the
 *  display name (owner ruling 2026-07-27: "You" is the no-persona fallback, a persona sets a real name, and
 *  the model reaching for "player" was the saner API). The wire vocabulary leads with this; the resolver
 *  (`buildRosterRefIndex` self-aliases) maps it to the user ref, and the snapshot keys on `user:<id>` (stable
 *  across persona changes — verified, never orphaned by a display-name toggle). */
const PLAYER_SEMANTIC_REF = "player";

/** The resolved ref vocabulary for a call: the enum-able refs + the player's current display name (for the
 *  prompt's `player = X` explainer; null when no user actor). */
interface ResolvedRefs {
  readonly refs: ExtractionRefs;
  readonly playerDisplayName: string | null;
}

/** The valid per-call refs the schema constraint + the prompt enumerate. The set MIRRORS what `resolveActor`
 *  (`tools/apply.ts`) can actually resolve, so the enum offers exactly the resolvable targets:
 *   • the semantic `player` token — ADDED only when NO roster member already occupies the name "player"
 *     (`buildRosterRefIndex` gives an explicit roster name precedence over the self-alias; a roster char
 *     literally named "Player" therefore OWNS the `player` ref — stickler F10 — and the human is addressed by
 *     their own display name, kept below);
 *   • every roster member's display name (incl. a "Player"-named char and the user's persona name);
 *   • existing scene-cast keys (`baseState.presentCharacters[].key`) — so `scene.presentRemove` can name an NPC
 *     the model previously upserted, and party/inventory can reach a scene NPC (stickler F4);
 *   • existing cast actor keys (`baseState.actorState` cast entries) — so party/inventory/wallet reach a
 *     first-class cast actor already tracked (D108 — cast actors are first-class targets).
 *  Deduped (a scene NPC promoted to a cast actor appears once). A model can then only target a REAL, resolvable
 *  ref under an enforcing backend, and the cast-actor reach is representable in BOTH constrained modes. */
async function resolveExtractionRefs(deps: RpgComposeDeps, chatId: ChatId, baseState: RpgSnapshotState): Promise<ResolvedRefs> {
  const [roster, game] = await Promise.all([deps.rpgChatOps.resolveRpgRoster(chatId), findGameByChat(deps.db, chatId)]);
  const player = roster.find((r) => r.actorRef.kind === "user");
  const rosterOwnsPlayerName = roster.some((r) => r.name.toLowerCase() === PLAYER_SEMANTIC_REF);
  // Insertion-ordered dedup (case-insensitive) — the enum offers each resolvable target exactly once.
  const seen = new Set<string>();
  const actorRefs: string[] = [];
  const add = (ref: string): void => {
    const key = ref.toLowerCase();
    if (ref.length > 0 && !seen.has(key)) {
      seen.add(key);
      actorRefs.push(ref);
    }
  };
  // The stable semantic token leads — UNLESS a roster member already claims "player" (that char owns it, F10).
  if (player !== undefined && !rosterOwnsPlayerName) {
    add(PLAYER_SEMANTIC_REF);
  }
  for (const r of roster) {
    add(r.name); // every roster display name is valid (persona-name + the F10 "Player"-named char)
  }
  for (const pc of baseState.presentCharacters) {
    add(pc.key); // an existing scene NPC — targetable for presentRemove + party/inventory (F4)
  }
  for (const actor of baseState.actorState) {
    if (actor.actorRef.kind === "cast") {
      add(actor.actorRef.castKey); // an existing first-class cast actor — party/inventory/wallet reach it (F4)
    }
  }
  // §2.8 — the host-defined tracked cast-field KEYS constrain the nested `presentUpsert[].customFields[].name`,
  // so the model can only write DEFINED fields (never invent a junk key). Empty (feature off) leaves it free.
  const castFieldKeys = game?.config.features.castFields.map((f) => f.key) ?? [];
  return {
    refs: { actorRefs, widgetRefs: Object.keys(baseState.widgetValues), castFieldKeys },
    playerDisplayName: player?.name ?? null,
  };
}

/** Append the valid-ref enumeration to the extraction system prompt (the FALLBACK arm for a model whose
 *  wire can't enforce the schema enum — the schema binds it structurally where the backend supports it, and
 *  the prompt names the valid refs everywhere). The `player` token is explained (= the human's character,
 *  currently shown as X) so the model prefers the stable ref. Empty ⇒ the base prompt (a fresh game). */
function extractionSystemWithRefs(refs: ExtractionRefs, playerDisplayName: string | null): string {
  const lines: string[] = [];
  if (refs.actorRefs.length > 0) {
    lines.push(`Valid targetRef values (use EXACTLY one of these for any party/inventory/scene target): ${refs.actorRefs.join(", ")}.`);
  }
  // Explain the `player` token ONLY when it is actually in the enum — a roster char literally named "Player"
  // owns that ref (F10), so the token is withheld and the human is addressed by their display name instead.
  if (playerDisplayName !== null && refs.actorRefs.includes(PLAYER_SEMANTIC_REF)) {
    lines.push(
      `"${PLAYER_SEMANTIC_REF}" = the human's own character (currently shown as "${playerDisplayName}"); prefer "${PLAYER_SEMANTIC_REF}" for the human.`,
    );
  }
  if (refs.widgetRefs.length > 0) {
    lines.push(`Valid widgetRef values (custom trackers — never invent one): ${refs.widgetRefs.join(", ")}.`);
  }
  lines.push("Location goes in scene.location — NEVER in a widget. Never target a name not in the lists above.");
  return `${EXTRACTION_SYSTEM}\n\n${lines.join("\n")}`;
}

/** Build the reliable-mode `runExtraction` op (§4.6). Rides the CHARACTER turn's ALREADY-RESOLVED connection +
 *  consent verdict (`input.turnConnection` — stickler F1: never a re-resolve of the host's global default, never
 *  a force-stamped consent), reads the beat, drives ONE structured-output call ROUTED BY API (agent-sdk → the
 *  chat structured-output path; every other api → the `structured` dispatcher), and folds the parsed extraction
 *  into an `RpgStateDelta`. On any backend throw / parse failure it returns an EMPTY delta (the byte-identical
 *  non-writing turn — a broken extraction never corrupts canon, the errors-as-data posture). */
function buildRunExtraction(deps: RpgComposeDeps): RpgRunExtraction {
  return async ({ chatId, variantId, baseState, turnConnection }) => {
    const empty = { statePatch: {}, journal: [] };
    const conn = turnConnection.connection;
    const beat = await readBeat(deps.db, variantId);
    // R1 — the mis-target fix: constrain the response schema's ref fields to the ACTUAL per-call refs (the
    // semantic `player` token + roster/persona names + existing scene-cast + cast-actor keys + widget labels)
    // so an invalid ref is UNREPRESENTABLE under a schema-enforcing backend, and ALSO enumerate them in the
    // prompt (the fallback arm for a non-enforcing model).
    const { refs, playerDisplayName } = await resolveExtractionRefs(deps, chatId, baseState);
    const schema = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs);
    const ctx: ExtractCtx = {
      conn,
      ownerConsented: turnConnection.ownerConsented,
      systemPrompt: extractionSystemWithRefs(refs, playerDisplayName),
      userPrompt: extractionUserPrompt(JSON.stringify(baseState), beat),
      schema,
    };
    // The structured-output extraction can THROW at the backend (e.g. a backend that doesn't honor
    // `outputFormat: json_schema`). Errors-as-data for CANON (a failed extraction never corrupts state — return
    // the empty delta), but the throw MUST be observable: a silent swallow at `engine.ts`'s fire-and-forget
    // `.catch` made a broken reliable-mode extraction invisible in prod (the diagnosis that surfaced this).
    let text: string;
    try {
      text = conn.api === "agent-sdk" ? await extractViaChat(deps, ctx) : await extractViaStructured(deps, ctx);
    } catch (err) {
      logger.warn({ event: "rpg.extraction.failed", chatId, model: conn.model, api: conn.api, err }, "rpg reliable extraction failed");
      return empty;
    }
    const parsed = rpgExtractionSchema.safeParse(safeJson(text));
    if (!parsed.success) {
      // OBSERVABILITY (the last blind spot): a non-conforming extraction returns empty AND is LOGGED with the
      // zod issue paths — this is the path reliable was silently dying on (an 8B dropping the nested-required
      // `journal[].title` failed `safeParse` here with NO log while every other rpg log stayed silent; that
      // contradiction is how the diagnosis surfaced). The observability set is now TOTAL: failed (throw) /
      // unparseable (this) / empty (logExtractionOutcome) / phantom (logExtractionOutcome) / dropped (flush).
      logger.warn(
        {
          event: "rpg.extraction.unparseable",
          chatId,
          model: conn.model,
          api: conn.api,
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        "rpg reliable extraction did not conform to the schema — dropped (no state written)",
      );
      return empty; // a non-conforming extraction never writes — the model gets one shot, no retry corruption
    }
    // The roster index resolves an extracted party/inventory target NAME to its roster ref (F2 — the same
    // first-class resolution the cheap-mode tools use; a reliable write on a party member must render too).
    const roster = buildRosterRefIndex(await deps.rpgChatOps.resolveRpgRoster(chatId));
    const delta = extractionToStateDelta(baseState, parsed.data, { item: () => newId(), quest: () => newId(), objective: () => newId() }, roster);
    // R3 — visibility: an extraction that parsed but resolves to ZERO renderable writes (all phantom mints /
    // no-ops) is a SIGNAL (mis-target or an empty beat), not a silent nothing. Log it with the ref context so
    // a dark panel is diagnosable from the provider trail.
    logExtractionOutcome({ chatId, model: conn.model, api: conn.api, refs, parsed: parsed.data, delta });
    return delta;
  };
}

/** R3 — the extraction-outcome visibility log. Emits a line when the delta writes NOTHING renderable (the
 *  silent-empty-panel signal) AND whenever the extraction MINTED a `cast:` actor (an unexpected non-roster
 *  target — the mis-target canary). Metadata only (ref counts + names), never beat/reply text. */
function logExtractionOutcome(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: string;
  readonly refs: ExtractionRefs;
  readonly parsed: RpgExtraction;
  readonly delta: { readonly statePatch: Record<string, unknown>; readonly journal: readonly unknown[] };
}): void {
  const wroteNothing = Object.keys(args.delta.statePatch).length === 0 && args.delta.journal.length === 0;
  // The party/inventory targets the model NAMED that are NOT in the valid roster ref list — each becomes a
  // phantom `cast:` mint (the exact R1 failure). Surfaced as the canary even when SOME writes landed.
  const validRefs = new Set(args.refs.actorRefs.map((r) => r.toLowerCase()));
  const named = [...args.parsed.party, ...args.parsed.inventory].map((e) => e.targetRef);
  const phantomTargets = [...new Set(named.filter((n) => !validRefs.has(n.toLowerCase())))];
  if (wroteNothing) {
    logger.warn(
      { event: "rpg.extraction.empty", chatId: args.chatId, model: args.model, api: args.api, actorRefs: args.refs.actorRefs.length, phantomTargets },
      "rpg reliable extraction wrote NOTHING renderable (mis-target or empty beat)",
    );
  } else if (phantomTargets.length > 0) {
    logger.warn(
      { event: "rpg.extraction.phantom", chatId: args.chatId, model: args.model, api: args.api, phantomTargets },
      "rpg reliable extraction minted cast actor(s) for non-roster target(s)",
    );
  }
}

/** Parse structured-output text to a value, or `null` on non-JSON (the schema parse then fails → empty). */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CHEAP mode — the DEDICATED TOOL ROUND (owner ruling 2026-07-27). The sibling of `runExtraction`.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A state-only request (NOT tools on the character turn): the 6 state tools + a `no_changes` escape, with
// ref-enum-constrained args (R1) + `tool_choice:"required"` (LIVE-VERIFIED: vLLM hermes/Qwen3 + OpenRouter
// both emit PARALLEL calls on a change beat + a single `no_changes` on a quiet one). No prose expected. The
// parsed calls fold to the SAME `RpgStateDelta` reliable produces (the shared-plane proof). Portable across
// the ARRAY wires (chat-completions/responses); an agent-sdk host connection has no wire `tools[]`, so it
// routes through the SAME structured-output extraction (identical delta by the shared-plane proof — the
// honest degrade, capability-keyed: cheap needs `capability.tools`, absent ⇒ readonly upstream).

/** The tool-round system prompt — state-focused, aggressive about tool use (no prose to lose). Reuses the
 *  ref enumeration (R1 fallback arm) + the player-semantic explainer. */
function toolRoundSystem(refs: ExtractionRefs, playerDisplayName: string | null): string {
  // DECOMPOSITION NUDGE (2026-07-27): the 8B under-fires — a beat that moved location AND wounded someone often
  // wrote only ONE plane. So the prompt now walks the model plane-by-plane (a checklist) and gives the concrete
  // multi-call example, forcing it to consider EACH plane independently rather than settling for one call.
  // Bounded attempt ([[plan-for-small-hardware]] — if the 8B ceiling holds, the honest-arms degrade holds).
  const base =
    "You maintain the tracked game state. Read the current state + the latest story beat, then call a SEPARATE " +
    "tool for EACH plane the beat changed. Check every plane independently:\n" +
    "• Did anyone's HP, pools, conditions, or status change? → update_party (one call PER affected actor)\n" +
    "• Did items or currency move? → update_inventory\n" +
    "• Did the location, time, weather, or present cast change? → update_scene\n" +
    "• Did a custom tracker change? → set_widget_value\n" +
    "• Did a quest start, advance, complete, or fail? → upsert_quest\n" +
    "• Is there a notable beat worth logging? → add_journal_entry\n" +
    'Most beats change MORE THAN ONE plane — e.g. "she\'s wounded and bleeding as you flee into the cave" ' +
    "needs update_party (a Bleeding condition on her) AND update_scene (location → cave), so call BOTH in this " +
    "one turn. Emit every applicable call together. If — and only if — the beat changed NOTHING trackable, call " +
    "no_changes and nothing else. Do not narrate.";
  const refLines = extractionSystemWithRefs(refs, playerDisplayName).slice(EXTRACTION_SYSTEM.length).trim();
  return refLines.length > 0 ? `${base}\n\n${refLines}` : base;
}

/** Build the ref-constrained wire tools for the round: each state tool's projected+enum-constrained args +
 *  the zero-arg `no_changes` escape. `constrainExtractionSchema` binds the ref enums on the extraction schema;
 *  we mirror that per-tool by constraining each tool's own arg schema through the SAME projection. */
function buildToolRoundWireTools(refs: ExtractionRefs): { name: string; description: string; parameters: Record<string, unknown> }[] {
  // The per-tool projected args, ref-constrained. We reuse the extraction constraint by projecting the whole
  // extraction schema once and lifting each array field's item schema (which carries the injected enums).
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs) as {
    properties?: Record<string, { items?: Record<string, unknown> } | Record<string, unknown>>;
  };
  const itemSchemaOf = (field: string): Record<string, unknown> => {
    const node = constrained.properties?.[field] as { items?: Record<string, unknown> } | undefined;
    return node?.items ?? { type: "object" };
  };
  const sceneSchema = (constrained.properties?.["scene"] as Record<string, unknown> | undefined) ?? { type: "object" };
  return [
    { name: "update_party", description: "HP, pools, conditions, status on any actor.", parameters: itemSchemaOf("party") },
    { name: "update_inventory", description: "Items and wallet on an actor.", parameters: itemSchemaOf("inventory") },
    { name: "update_scene", description: "Location, time, weather, present cast, a recent beat.", parameters: sceneSchema },
    { name: "set_widget_value", description: "Write a custom tracker's value.", parameters: itemSchemaOf("widgets") },
    { name: "upsert_quest", description: "Create/update/complete/fail a quest.", parameters: itemSchemaOf("quests") },
    { name: "add_journal_entry", description: "Log a notable beat.", parameters: itemSchemaOf("journal") },
    {
      name: RPG_NO_CHANGES_TOOL,
      description: "Call ONLY when the latest beat changed NOTHING trackable.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
}

/** Build the cheap-mode `runToolRound` op — the parallel-tool-call state round (the sibling of
 *  `runExtraction`). Rides the CHARACTER turn's ALREADY-RESOLVED connection + consent verdict
 *  (`input.turnConnection` — stickler F1: no re-resolve, no force-stamped consent); the vehicle is wire tools +
 *  `required`. On an agent-sdk host (no wire tools) it degrades to the structured extraction (identical delta,
 *  shared-plane). On any backend throw / no calls it returns the EMPTY delta (errors-as-data — never corrupts
 *  canon). */
function buildRunToolRound(deps: RpgComposeDeps): RpgRunToolRound {
  const extract = buildRunExtraction(deps);
  return async (input) => {
    const { chatId, variantId, baseState, turnConnection } = input;
    const empty = { statePatch: {}, journal: [] };
    const conn = turnConnection.connection;
    // agent-sdk has no wire tools[]; the shared-plane proof lets it ride the SAME structured extraction.
    if (conn.api === "agent-sdk") {
      return extract(input);
    }
    const beat = await readBeat(deps.db, variantId);
    const { refs, playerDisplayName } = await resolveExtractionRefs(deps, chatId, baseState);
    let calls: readonly RpgToolCall[];
    try {
      const result = await deps.executor.runChatTurn({
        api: conn.api,
        model: conn.model,
        credential: conn.credential,
        capability: conn.capability,
        params: {},
        systemPrompt: { static: toolRoundSystem(refs, playerDisplayName), dynamic: "" },
        history: [{ role: "user", content: [{ type: "text", text: extractionUserPrompt(JSON.stringify(baseState), beat) }] }],
        tools: buildToolRoundWireTools(refs),
        toolChoice: { mode: "required" },
        // The character turn's enforced consent verdict, inherited (never force-stamped `true` — F1). Non-sub
        // backends ignore it; a max-pro-sub round only ever runs because the character turn already consented.
        ownerConsented: turnConnection.ownerConsented,
      });
      calls = result.toolCalls ?? [];
    } catch (err) {
      logger.warn({ event: "rpg.toolround.failed", chatId, model: conn.model, api: conn.api, err }, "rpg cheap tool round failed");
      return empty;
    }
    // Fold the parallel tool calls → an RpgExtraction → the SAME state delta reliable produces (`no_changes`
    // and any unknown tool contribute nothing — the quiet-turn no-op).
    const extraction = toolCallsToExtraction(calls);
    const roster = buildRosterRefIndex(await deps.rpgChatOps.resolveRpgRoster(chatId));
    const delta = extractionToStateDelta(baseState, extraction, { item: () => newId(), quest: () => newId(), objective: () => newId() }, roster);
    logExtractionOutcome({ chatId, model: conn.model, api: conn.api, refs, parsed: extraction, delta });
    return delta;
  };
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
    runToolRound: buildRunToolRound(deps),
    // The feature-root rpg bus emit (§4.9) — a verb/flush calls it after its durable write; fire-and-forget.
    emitBus: publishRpgEvent,
    // The dice CSPRNG (bake-once, server-authoritative — a client seed is never honored, §4.4).
    randomInt: (max) => randomInt(max),
    // OBSERVABILITY: the flush write-boundary DROP hook (the F1 backstop refusing a contract-invalid state).
    // A state round fired, produced applicable output, and the write contract rejected it — surface WHICH
    // field/why so a dark panel is root-causable from the provider trail (never a silent vanish).
    onFlushDropped: (info) => {
      logger.warn(
        { event: "rpg.flush.dropped", chatId: info.chatId, gameId: info.gameId, variantId: info.variantId, reason: info.reason },
        "rpg flush DROPPED at the write-boundary backstop — extracted state was contract-invalid",
      );
    },
    // The per-chat FLUSH BARRIER (the race fix): the next turn's gather awaits this chat's in-flight flush before
    // reading the state its reminder assembles from. A hung flush releases the barrier (bounded) + logs — the
    // turn proceeds on last-known state, never a deadlock.
    flushBarrier: createRpgFlushBarrier((info) => {
      logger.warn(
        { event: "rpg.flush.barrier_timeout", chatId: info.chatId },
        "rpg flush barrier timed out — the next turn proceeded on last-known state (a prior flush did not settle in time)",
      );
    }),
  };
  const service = createRpgService(ctx);
  // Register the 7 cheap-mode state tools into the ONE registry (additive; the imagery precedent).
  for (const def of rpgToolDefinitions(ctx)) {
    deps.toolUse.register(def);
  }
  return { service, chatOps: createRpgChatOps(ctx) };
}

/** Read the chat's per-chat routing overlay (`metadata.providerRouting`) as a `RouteChatAssignment` — the SAME
 *  derivation the character turn's `resolveConnection` uses (`compose/chat.ts`). A malformed/absent metadata
 *  degrades to the empty assignment (falls through to the host's role default), never a throw. */
async function readRoutableChat(db: Db, chatId: ChatId): Promise<RouteChatAssignment> {
  const rows = await db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId)).limit(1);
  const meta = parseChatMetadata(rows.at(0)?.metadata ?? null);
  return meta.providerRouting !== undefined ? { providerRouting: meta.providerRouting } : {};
}

/** Build the honest-arms `resolveTrackersReadOnly` op (§4.6 — the READ-side CP pill): resolve the ROOM's chat
 *  connection capability (via `resolveChat` — the SAME per-chat-routing verb a turn resolves through, NOT the
 *  host's global `resolveRole` default, stickler F1) for THIS game's mode, and delegate to the rpg-owned
 *  `deriveTrackersReadOnly` mapping. A game with no host, or an unresolvable connection (a `resolveChat` that
 *  THROWS a connection-resolution error — incoherent (api,source) or the agent-sdk model-heal fail-loud), is
 *  readonly by construction (never assume a write path; a READ degrades to read-only trackers, never a 500).
 *  This mirrors the flush's F2 gate so the pill and the actual round-eligibility agree. */
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
    const routableChat = await readRoutableChat(deps.db, chatId);
    // An unresolvable/incoherent chat connection (a stale routing setting whose (api,source) pair maps to no
    // backend) is READONLY BY CONSTRUCTION — the same contract as the missing-game/missing-host arms above.
    // `resolveChat` THROWS the connection-resolution error classes on that (routing-incoherent + the agent-sdk
    // model-heal fail-loud); catch THOSE specifically so a misconfigured backend degrades a game READ to
    // read-only trackers instead of 500ing the panel. Anything else (a DB fault, a transient catalog gap) is a
    // genuine failure and RETHROWS — the catch never swallows a real bug.
    let conn: ResolvedConnection;
    try {
      conn = await deps.connection.resolveChat({ principal: host, routableChat });
    } catch (err) {
      if (err instanceof ConnectionRoutingError || err instanceof AgentModelHealError) {
        return true;
      }
      throw err;
    }
    return deriveTrackersReadOnly(game.config.extractionMode, conn.capability);
  };
}
