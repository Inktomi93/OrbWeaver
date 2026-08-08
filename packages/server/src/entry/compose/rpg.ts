// Composition seam for the rpg domain (rpg-design/05 §4.10, the LITE vertical). Owns no business logic — it
// assembles the `RpgContext` DI bundle (db-scoped persistence + injected clock/id-mints/dice-CSPRNG + the five
// injected cross-feature ops + the bus emit + the structured `runExtraction` impl) over the already-built
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
// THE `runExtraction` IMPL (§4.6 — the delivery-model amendment + the crunchy-cluster §1.3
// transcript threading): a DEDICATED structured-output turn. It rides the CHARACTER turn's ALREADY-RESOLVED
// connection + consent verdict AND its OWN canon transcript (`input.turnConnection`: `RpgTurnContext`, threaded
// from the engine through the flush — stickler F1 + §1.3), slices that transcript to the game's configured
// extraction window (`beat`/`window`/`full` — the beat is `transcript.at(-1)`, no DB read), builds the three-
// block prompt (RECENT STORY · CURRENT TRACKED STATE · LATEST BEAT), composes the per-plane teaching from the
// §1.6 registry, and drives ONE model call with `responseFormat` = the projected `rpgExtractionSchema` (the
// shared-plane proof: the extraction is "a batch of the tool calls the model would otherwise have made"). It
// NEVER re-resolves the host's global chat default and NEVER force-stamps consent — a room on vllm runs its
// round on vllm, a metered-sub round inherits the turn's owner-consent belt verdict. The `beat` arm is
// BYTE-COMPATIBLE with the pre-redesign one-beat request (the escape hatch). The parsed extraction folds into
// an `RpgStateDelta` the accumulator flushes exactly like a cheap-mode turn. A game whose resolved connection
// has no structured-output writer capability is gated OUT by the flush's readonly check (F2) before it reaches here.
//
// THE THIRD VEHICLE — `folded` (R1, the one-call exchange): `buildFoldedTurn` + `foldTurnToolCalls` below make
// NO model call of their own. The gather mounts the SAME `buildToolRoundWireTools` product on the CHARACTER
// turn as TERMINAL tools (`tool_choice:"auto"`, never `"required"` — required measurably kills the prose), and
// the flush folds the calls that turn co-emitted through the SAME `toolCallsToExtraction` →
// `extractionToStateDelta` path. Two model calls per exchange become one.

import { randomInt } from "node:crypto";
import type { ChatApi, ResolvedConnection, RouteChatAssignment } from "@orb/contracts/connection";
import { coEmitsProseWithTools } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ExtractionRefs, RpgActorRef, RpgExtraction, RpgGameConfig, RpgSheet, RpgSnapshotState, RpgToolCall, RpgTrackerCarrier } from "@orb/contracts/rpg";
import {
  actorRefKey,
  buildRpgToolDescriptions,
  buildTrackerWriteGroups,
  cacheStableExtractionRefs,
  composePlaneTeaching,
  composePopulateTeaching,
  constrainExtractionSchema,
  constrainPopulateSchema,
  gameTrackerWriteKeys,
  healedJournalTypes,
  malformedToolCallDetails,
  RPG_NO_CHANGES_TOOL,
  recordToolCalls,
  rpgExtractionSchema,
  rpgGameConfigSchema,
  rpgPopulateSchema,
  salvagedToolCallFields,
  salvageExtraction,
  salvagePopulate,
  strippedToolCallKeys,
  toolCallsToExtraction,
} from "@orb/contracts/rpg";
import type { StructuredOutputShape } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import { errorMessage } from "@orb/kit/error-message";
import type { CharacterHandle, ChatId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, newId } from "@orb/kit/ids";
import { projectJsonSchema, scrubWireSchema } from "@orb/kit/json-schema";
import { eq } from "drizzle-orm";
import { can } from "#domain/admin";
import type { CharacterService } from "#domain/character";
import type { ChatService, RpgCardCorpus, RpgTurnTranscriptMessage } from "#domain/chat";
import { parseChatMetadata } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import { AgentModelHealError, ConnectionRoutingError } from "#domain/connection";
import type {
  ImportRpgGame,
  RosterRefIndex,
  RpgContext,
  RpgCopyPresetToUser,
  RpgResolvePresetOwned,
  RpgRunExtraction,
  RpgRunToolRound,
  RpgService,
  RpgStateDelta,
  RpgTraceSink,
} from "#domain/rpg";
import {
  actorCarrier,
  buildRosterRefIndex,
  createImportRpgGame,
  createRpgChatOps,
  createRpgFlushBarrier,
  createRpgService,
  createRpgStagingStore,
  deriveTrackersReadOnly,
  extractionToStateDelta,
  findGameByChat,
  ghostTargetRefs,
  hasStructuredWriter,
  hasToolWriter,
  listSheets,
  publishRpgEvent,
  reachableActorRefs,
  rpgToolDefinitions,
} from "#domain/rpg";
import type { ToolUseService } from "#domain/tool-use";
import { logger } from "#foundation/observability";
import type { ChatResult, ProviderExecutor } from "#infra/providers";
import type { ChatComposeResult } from "./chat.ts";
import { minter } from "./minter.ts";

/** The structured-output schema NAME the structured extraction passes as `responseFormat.name` (OpenAI
 *  `json_schema.name`; Anthropic tool name). One home — no scattered magic string. */
const EXTRACTION_SCHEMA_NAME = "rpg_state_extraction";

/** THE STRICT-SHAPE ARMS (D126) — one builder per `StructuredOutputShape`, selected at RUNTIME off the
 *  AppSettings tier (`EffectiveAppConfig.structuredOutputShape`, admin-editable in Settings › Admin ›
 *  Structured output; env floor `as-projected`, DB override wins). It was a source-level `boolean` const until
 *  2026-08-03 — a capability reachable only by editing and redeploying, which is a dead switch (D107).
 *
 *  `strict-compatible` sends the schema in the OpenAI-strict shape (every property `required`, every optional
 *  emitted as `anyOf:[T,{"type":"null"}]`) and asks for `strict: true`. Nothing about the CONTRACT changes —
 *  `null ≡ absent` is imposed at the salvage boundary (`dropNullValues`), so omit-means-keep survives verbatim.
 *  It stays OFF by default because it costs ~46 explicit `null`s of output per extraction and reads materially
 *  worse to a small local model — the wire our populate lever depends on. The reason to switch it on is a
 *  hosted wall: OpenAI strict's "all fields must be required", or Anthropic's undocumented ceiling on the
 *  NUMBER of optionals a schema may carry.
 *
 *  A mapped Record, not a ternary: a new `StructuredOutputShape` without an arm is a tsc error (§5.5). */
const EXTRACTION_RESPONSE_FORMATS: Readonly<Record<StructuredOutputShape, (schema: Record<string, unknown>) => ResponseFormat>> = {
  "as-projected": (schema) => ({ name: EXTRACTION_SCHEMA_NAME, schema }),
  "strict-compatible": (schema) => ({ name: EXTRACTION_SCHEMA_NAME, schema: scrubWireSchema(schema, "strict-compatible").schema, strict: true }),
};

/** The extraction call's `ResponseFormat`, in whichever wire shape the deployment selected. ONE home, so the
 *  two arms (`extractViaChat` / `extractViaStructured`) can never disagree about what was sent. Resolved
 *  PER CALL (not captured at compose time) so an admin flip governs the very next extraction — the
 *  `getEffectiveConfig` cache is rebuilt on every admin write. */
function extractionResponseFormat(deps: RpgComposeDeps, schema: Record<string, unknown>): ResponseFormat {
  return EXTRACTION_RESPONSE_FORMATS[deps.structuredOutputShape()](schema);
}

/** What the rpg seam needs from the composition root: db + the sibling front doors rpg's injected ops route
 *  through (chat's rpg-facing ops, the connection resolve, the executor, the host-principal bridge, the tool
 *  registry). */
export interface RpgComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  /** R-OBS — the rpg flight-recorder sink (`domain/rpg/trace.ts`), wired by `createServices` ONLY when tracing
   *  is enabled (`RPG_TRACE=on`, or the `rpgTrace` compose dep an int test forces). ABSENT is the default and
   *  the point: every emit site guards with `deps.trace?.(…)`, and an optional CALL short-circuits its
   *  ARGUMENT, so a traced-off turn never even builds an event object and is byte-identical. */
  readonly trace?: RpgTraceSink;
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
  /** The preset-ownership gate (fork-clones-the-game §3.2) — `forkGame` calls it to decide whether the source
   *  game's `gmPresetId` is SAFE for the forker to carry (readable BY them: owned OR the shared default). Wired
   *  off the preset front door `get` (the ONLY legal preset import), which throws `PresetNotFoundError` for a
   *  preset the user can't read — the exact "foreign preset" the strip drops. rpg never reads preset tables. */
  readonly resolvePresetOwned: RpgResolvePresetOwned;
  /** The GM-preset GIFT (the host-handoff copy offer's preset arm) — copy the DEPARTING host's preset into the
   *  incoming host's library so the room keeps the voice it had instead of degrading to their default. Wired
   *  off preset's own `createCopyPresetToUser` factory (preset owns the table; rpg writes no preset row), and
   *  BOTH owners stay explicit params end to end — the injected-op caller-gate class. */
  readonly copyPresetToUser: RpgCopyPresetToUser;
  /** R4 PROMOTION's durable half. The character front door mints the card (`create`) and resolves whether a
   *  handle is already taken in the owner's library (`findByHandle` — the per-owner handle index is UNIQUE, so
   *  the mint would otherwise throw a raw constraint error at the host instead of a sentence). rpg reads no
   *  character table; this is the ONLY legal reach. */
  readonly character: Pick<CharacterService, "create" | "findByHandle">;
  /** R4 PROMOTION's other durable half — the chat participant-insert chokepoint (host-gated inside the verb,
   *  idempotent on a present seat). rpg reads no participant table; this is the ONLY legal reach. */
  readonly chat: Pick<ChatService, "addCharacterToChat">;
  /** The ONE tool-use registry — rpg registers its 7 state tools into it (the imagery precedent). */
  readonly toolUse: Pick<ToolUseService, "register">;
  /** The deployment's structured-output wire shape (D126), read PER CALL off the resolved AppSettings tier —
   *  a thunk, never a captured value, so an admin flip governs the next extraction with no restart. */
  readonly structuredOutputShape: () => StructuredOutputShape;
}

/** How many handle candidates the promotion mint probes before refusing (`vesna`, `vesna-2`, … `vesna-25`).
 *  The card HANDLE is a machine label in the owner's own namespace (the `__group__<chatId>` synthetic precedent
 *  — nothing addresses a character BY handle), so uniquifying it silently loses nothing; the display NAME is
 *  the identity, and a name collision is refused loudly by the verb instead. The bound exists so a pathological
 *  library cannot turn one promotion into an unbounded scan. */
const PROMOTE_HANDLE_ATTEMPTS = 25;

/** R4 — PROMOTION's durable half: mint the card + seat it on the roster, both AS THE ROOM HOST the verb
 *  resolved by role (threaded explicitly — the injected-op caller-gate class; an op that re-derived the owner
 *  here could mint a card into the wrong library). A promoted character MUST be host-owned, because
 *  `resolveRpgRoster` reads roster character cards under the room host's ownership — a card owned by anyone
 *  else resolves to no actor at all and the promotion would land the person nowhere.
 *
 *  The handle is uniquified against the owner's library BEFORE the mint, so the reachable failure is a
 *  legible refusal rather than the unique-index error the insert would otherwise throw at the host. */
/** The first handle in the owner's library that nothing already carries, or `null` if every candidate is taken.
 *
 *  TWO PHASES, deliberately: the bare `handle` is probed ALONE first, because it is free on essentially every
 *  promotion and one indexed owner-scoped read is the honest cost of the common case. Only a real collision
 *  pays for the suffixed candidates, and those are asked for IN PARALLEL — they are independent questions, so
 *  a sequential walk would be a per-iteration round-trip for no ordering benefit. `findIndex` then restores
 *  the deterministic lowest-suffix answer, so the same collision always resolves to the same handle. */
async function freePromotionHandle(deps: RpgComposeDeps, ownerId: UserId, handle: CharacterHandle): Promise<CharacterHandle | null> {
  if ((await deps.character.findByHandle({ ownerId, handle })) === null) {
    return handle;
  }
  const suffixed = Array.from({ length: PROMOTE_HANDLE_ATTEMPTS - 1 }, (_, i) => castId<CharacterHandle>(`${handle}-${i + 2}`));
  const taken = await Promise.all(suffixed.map((candidate) => deps.character.findByHandle({ ownerId, handle: candidate })));
  const index = taken.indexOf(null);
  return index === -1 ? null : (suffixed[index] ?? null);
}

function buildPromoteToRoster(deps: RpgComposeDeps): RpgContext["promoteToRoster"] {
  return async ({ chatId, hostUserId, name, handle, description }) => {
    const free = await freePromotionHandle(deps, hostUserId, handle);
    if (free === null) {
      return { ok: false, reason: `your character library already carries "${handle}" and every variant this promotion tried — rename the character first` };
    }
    const principal = await deps.resolveHostPrincipal(hostUserId);
    const created = await deps.character.create({ principal, input: { handle: free, name, description } });
    await deps.chat.addCharacterToChat({ principal, chatId, characterId: created.id });
    return { ok: true, characterId: created.id };
  };
}

/** The rpg compose product: the verb surface (transport consumes it) + the `ChatRpgOps` chat receives by
 *  injection (the `input.rpg ?? null` seam). */
export interface RpgComposeResult {
  readonly service: RpgService;
  readonly chatOps: ReturnType<typeof createRpgChatOps>;
  /** R6 — the campaign's portability WRITE half, surfaced because it closes over the SAME `ids` bundle every
   *  other rpg write uses. Building a second minter set at the portability seam would be two homes for one
   *  id vocabulary. (The READ half needs only `db`, so the root wires it directly.) */
  readonly importGame: ImportRpgGame;
}

// THE HOST resolves by ROLE (the injected `deps.rpgChatOps.resolveHostUserId`, role='host' — D19), never join
// order: `acceptHostHandoff` (D64) swaps roles in place, so the first-joined human is NOT the host (stickler F3).
// Both the resync extraction (whose human funds the model call) and the capability verdict read it.

/** Render one transcript row as a labeled story line (`Mara: …`, `You: …`, `System: …`). A null speaker
 *  name renders by role (user → "You", system → "System", assistant → "Narrator") — the model reads coherent
 *  story attribution without needing the id plumbing. */
const TRANSCRIPT_ROLE_FALLBACK: Readonly<Record<RpgTurnTranscriptMessage["role"], string>> = { user: "You", system: "System", assistant: "Narrator" };
function renderTranscriptLine(m: RpgTurnTranscriptMessage): string {
  return `${m.speakerName ?? TRANSCRIPT_ROLE_FALLBACK[m.role]}: ${m.content}`;
}

/** Slice the turn's transcript to the game's configured extraction window (§1.3). The LATEST BEAT is always
 *  `transcript.at(-1)` (the committed reply — the delta covers exactly it). The RECENT-STORY block is:
 *    • `beat`   → EMPTY (byte-compatible with the pre-redesign one-beat request — the user prompt drops the
 *                 RECENT STORY block entirely so the request is identical to today's `{state}\n{beat}`).
 *    • `window` → newest-first fill up to `extractionWindowTokens`, then reversed to oldest→newest (whole
 *                 messages — a huge single beat degrades to fewer messages, never truncated mid-utterance).
 *    • `full`   → the whole transcript (already compaction-bounded by the char turn's loading).
 *  The beat itself is never double-counted in the story block (it is the newest row, rendered under LATEST
 *  BEAT). Returns the story lines (oldest→newest) + the latest beat text. */
function sliceTranscript(transcript: readonly RpgTurnTranscriptMessage[], config: RpgGameConfig): { story: readonly RpgTurnTranscriptMessage[]; beat: string } {
  const beatRow = transcript.at(-1);
  const beat = beatRow?.content ?? "";
  if (config.extractionContext === "beat") {
    return { story: [], beat };
  }
  // The story is every row BEFORE the latest beat (the beat rides its own block).
  const priorRows = transcript.slice(0, -1);
  if (config.extractionContext === "full") {
    return { story: priorRows, beat };
  }
  // `window`: newest-first fill up to the token budget, then restore oldest→newest order.
  const budget = config.extractionWindowTokens;
  const kept: RpgTurnTranscriptMessage[] = [];
  let used = 0;
  for (let i = priorRows.length - 1; i >= 0; i--) {
    const row = priorRows[i];
    if (row === undefined) {
      continue;
    }
    if (used + row.tokens > budget && kept.length > 0) {
      break; // budget spent (always keep at least one prior message so `window` is never empty when story exists)
    }
    kept.push(row);
    used += row.tokens;
  }
  kept.reverse();
  return { story: kept, beat };
}

/** The structured-extraction system prompt HEADER (the arc semantics § the plane teaching composes onto).
 *  The model reads the RECENT STORY + the CURRENT TRACKED STATE + the LATEST BEAT and emits the WHOLE state
 *  delta as ONE structured object — no user-facing prose, structured output is the fit. The projected schema
 *  marks the five array fields REQUIRED (zod `.default([])` in output mode), so "nothing changed" is EMPTY
 *  ARRAYS, not a literal `{}` (stickler S5 — a bare `{}` fails the Anthropic runtime's schema validation).
 *
 *  ARC AWARENESS (crunchy-cluster §1.3): the RECENT STORY is the model's EVIDENCE. The delta it outputs covers
 *  ONLY the LATEST BEAT, but it may use the whole story to understand it — a relationship warming over several
 *  turns, an item picked up earlier and still carried, a quest implied across turns. The per-plane teaching
 *  (below, composed from `EXTRACTION_PLANE_PROMPTS`) carries the RECONCILE + INFER doctrine and the newly-
 *  covered planes (plot/trackers/emoji/day — §1.6). ESTABLISH-when-unset stays the ENFORCED-SCHEMA
 *  lever (`constrainExtractionSchema` marks scene fields REQUIRED on a fresh game); this prompt is the content-
 *  quality arm. The R1 ref enums (below) keep targets honest. */
/** The per-call PROMPT INPUTS every extraction vehicle resolves once and threads whole: the ref bundle, the
 *  game config, the player's display name, and the turn's PROSE overrides. Bundled so the four prompt builders
 *  below stay under the param-count gate and so a new prompt-shaping input lands as ONE field. */
interface PromptInputs {
  readonly config: RpgGameConfig;
  readonly refs: ExtractionRefs;
  readonly playerDisplayName: string | null;
  readonly reconcile: boolean;
  /** PROSE-1 S4 — the GM PRESET's `promptConfig.prose`, by two DIFFERENT routes for two DIFFERENT invocation
   *  classes (see `RpgTurnContext.prose` and `ChatRpgOps.resolveChatPresetProse`). Absent/`{}` ⇒ every slot
   *  resolves to its shipped default, byte-identical to the pre-PROSE-1 prompt. */
  readonly prose: ProseOverrides;
}

/** Compose the full structured-extraction system prompt: the header + the per-plane teaching (from the §1.6 registry,
 *  config/refs/prose aware — plot/trackers/emoji/day/deception-clause) + the R1 ref enumeration + (on a
 *  reconcile beat) the reconcile line. The registry is the ONE home both the structured extraction and the cheap
 *  tool round teach their planes from; every string in it is a PROSE-1 slot (`contracts/rpg/prose.ts`). */
function extractionSystem(inputs: PromptInputs): string {
  const { config, refs, prose, reconcile } = inputs;
  const teaching = composePlaneTeaching({ config, refs, prose });
  const refLines = refEnumerationLines(inputs);
  const parts = [
    resolveProseText("rpg.extract.systemHeader", prose),
    teaching,
    ...(refLines.length > 0 ? [refLines] : []),
    ...(reconcile ? [resolveProseText("rpg.extract.reconcilePass", prose)] : []),
  ];
  return parts.join("\n\n");
}

/** Strip model-facing PLUMBING from the base state before it rides the CURRENT TRACKED STATE block (§4.4):
 *   • `fieldLocks` — the lock record is not model data; the model-facing frame renders it as one prose "Locked
 *     paths" line (so the model honors pins without reading the raw record as noise).
 *   • quest + objective `id`s — the extractor targets quests by NAME (`upsert_quest`), so the branded ids are
 *     pure noise that bloat the prompt and can mislead a weak model into echoing an id.
 *  Returns the projected JSON string + the locked-paths line (empty when nothing is locked). */
function projectStateForModel(baseState: RpgSnapshotState, prose: ProseOverrides): { json: string; lockedPathsLine: string } {
  const { fieldLocks, quests, ...rest } = baseState;
  const strippedQuests = quests.map(({ id: _id, objectives, ...q }) => ({
    ...q,
    objectives: objectives.map(({ id: _oid, ...o }) => o),
  }));
  const json = JSON.stringify({ ...rest, quests: strippedQuests });
  const lockedPaths = fieldLocks !== null ? Object.keys(fieldLocks) : [];
  const lockedPathsLine = lockedPaths.length > 0 ? resolveProseText("rpg.extract.lockedPaths", prose, { lockedPaths: lockedPaths.join(", ") }) : "";
  return { json, lockedPathsLine };
}

/** The user-turn body both extraction arms send — the three labeled blocks (§1.3). RECENT STORY (oldest first)
 *  is DROPPED on the `beat` arm so the request is byte-identical to the pre-redesign `{state}\n{beat}` shape
 *  (the escape hatch's byte-compat contract). The CURRENT TRACKED STATE is the model-projected state (§4.4
 *  strip); the LATEST BEAT is the newest committed turn (its delta target). */
function extractionUserPrompt(args: { story: readonly RpgTurnTranscriptMessage[]; stateJson: string; lockedPathsLine: string; beat: string }): string {
  const stateBlock = args.lockedPathsLine.length > 0 ? `${args.stateJson}\n${args.lockedPathsLine}` : args.stateJson;
  // `beat` arm: no RECENT STORY block — byte-identical to today's `CURRENT STATE:\n{json}\n\nLATEST BEAT:\n{beat}`.
  if (args.story.length === 0) {
    return `CURRENT STATE:\n${stateBlock}\n\nLATEST BEAT:\n${args.beat}`;
  }
  const storyLines = args.story.map(renderTranscriptLine).join("\n");
  return (
    `RECENT STORY (oldest first):\n${storyLines}\n\n` +
    `CURRENT TRACKED STATE:\n${stateBlock}\n\n` +
    `LATEST BEAT (the newest story turn above — your delta covers exactly this):\n${args.beat}`
  );
}

/** Build the user-turn body BOTH extraction arms share, from the turn context + base state + config. The ONE
 *  place that honors the §1.3 byte-compat contract: on the `beat` arm the request is IDENTICAL to the
 *  pre-redesign shape — the FULL `JSON.stringify(baseState)` (no §4.4 strip) and no RECENT STORY block, so the
 *  verifier's diff matches today exactly. The `window`/`full` arms slice the turn's transcript and ride the
 *  model-projected state (locks/ids stripped, §4.4). */
function buildExtractionUserPrompt(
  transcript: readonly RpgTurnTranscriptMessage[],
  baseState: RpgSnapshotState,
  config: RpgGameConfig,
  prose: ProseOverrides,
): string {
  const { story, beat } = sliceTranscript(transcript, config);
  // `beat` arm — byte-identical to the pre-redesign request: the raw full state JSON, no strip, no story block.
  if (config.extractionContext === "beat") {
    return extractionUserPrompt({ story: [], stateJson: JSON.stringify(baseState), lockedPathsLine: "", beat });
  }
  // `window`/`full` — the new behavior: sliced story + the §4.4 model-projected state.
  const { json, lockedPathsLine } = projectStateForModel(baseState, prose);
  return extractionUserPrompt({ story, stateJson: json, lockedPathsLine, beat });
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
  /** The chat this round belongs to — threaded onto the provider request PURELY as the wire-capture
   *  correlation key (`ChatRequest.chatId` → the `captureWire` sink → `/api/_debug/wire/captures?chatId=`).
   *  A state round that omits it still lands in the ring, but ANONYMOUS: the operator's only filter is the
   *  chatId, so an unstamped round is invisible exactly when a chat is being debugged (measured — the live
   *  spill held a `tool_choice:"required"` state round with `chatId: undefined` beside the captured character
   *  turns). REQUIRED, like `signal`, so a new arm cannot forget to answer the question. */
  readonly chatId: ChatId;
  readonly ownerConsented: boolean;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly schema: Record<string, unknown>;
  /** The round's cancellation, threaded onto the provider request so a Stop actually kills the socket instead of
   *  letting a turn the user abandoned finish billing (`RpgStateRoundInput.signal`; minted by the flush barrier).
   *  `undefined` on the two HOST doors (`resyncFromStory` / `populateFromCharacter`): those are verb-initiated,
   *  and the tRPC request's signal is not threaded down to verbs on this tree — a doorway, not a gap in this
   *  seam. The field is REQUIRED so a new arm cannot forget to answer the question. */
  readonly signal: AbortSignal | undefined;
}

async function extractViaChat(deps: RpgComposeDeps, ctx: ExtractCtx): Promise<string> {
  const orSkinTierModels = await deps.connection.getOrSkinTierModels();
  const result = await deps.executor.runChatTurn({
    api: "agent-sdk",
    chatId: ctx.chatId,
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
    responseFormat: extractionResponseFormat(deps, ctx.schema),
    signal: ctx.signal,
  });
  return result.reply;
}

/** Emit the extraction JSON TEXT for a NON-agent-sdk host connection (vLLM backend / OpenRouter
 *  chat-completions|responses) via the `structured` dispatcher — the one-shot schema-constrained generation
 *  PRIMITIVE (owner ruling 2026-07-27: rpg extraction summarizes NOTHING; it rides `structured`, not
 *  `summarize`). Its firewall serves openrouter|vllm, same as before. */
async function extractViaStructured(deps: RpgComposeDeps, ctx: ExtractCtx): Promise<string> {
  // NO `chatId` here, and it is not an omission: the `structured` ROLE is chatless by contract (its request
  // shape has no chatId, and its surfaces stamp the capture `chatId: undefined` — a role serves probes and
  // batch work that belong to no chat). So this arm's capture is correlatable by backend + time only; the
  // chatId key rides the two vehicles whose request shape carries one (`runChatTurn` — the tool round and
  // the agent-sdk degrade above).
  const result = await deps.executor.structured({
    credential: ctx.conn.credential,
    model: ctx.conn.model,
    inputs: [{ systemPrompt: ctx.systemPrompt, userPrompt: ctx.userPrompt }],
    responseFormat: extractionResponseFormat(deps, ctx.schema),
    signal: ctx.signal,
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
 *  prompt's `player = X` explainer; null when no user actor) + the game config (the plane-teaching + window
 *  knobs read it — resolved once here, off the game the refs already fetch). A turnless game (no row) folds to
 *  the all-defaults config so the fresh-game path still teaches every default plane. */
interface ResolvedRefs {
  readonly refs: ExtractionRefs;
  readonly playerDisplayName: string | null;
  readonly config: RpgGameConfig;
}

/** The valid per-call refs the schema constraint + the prompt enumerate. The set MIRRORS what `resolveActor`
 *  (`tools/apply.ts`) can actually resolve, so the enum offers exactly the resolvable targets:
 *   • the semantic `player` token — ADDED only when NO roster member already occupies the name "player"
 *     (`buildRosterRefIndex` gives an explicit roster name precedence over the self-alias; a roster char
 *     literally named "Player" therefore OWNS the `player` ref — stickler F10 — and the human is addressed by
 *     their own display name, kept below);
 *   • every roster member's display name (incl. a "Player"-named char and the user's persona name);
 *   • every tracked CAST actor's display name (`baseState.actorState` cast entries — R2 folded the old separate
 *     `presentCharacters[].key` walk into this one, because the scene cast and the tracked cast are the same
 *     rows now) — so `scene.presentRemove` can name an NPC the model previously upserted, and
 *     party/inventory/wallet reach a first-class cast actor whether or not she is on stage (stickler F4, D108).
 *  Deduped case-insensitively. A model can then only target a REAL, resolvable ref under an enforcing backend,
 *  and the cast-actor reach is representable in BOTH constrained modes. */
async function resolveExtractionRefs(deps: RpgComposeDeps, chatId: ChatId, baseState: RpgSnapshotState, reconcile: boolean): Promise<ResolvedRefs> {
  const [roster, game] = await Promise.all([deps.rpgChatOps.resolveRpgRoster(chatId), findGameByChat(deps.db, chatId)]);
  const config = game?.config ?? rpgGameConfigSchema.parse({});
  // R6 — the per-actor write surface needs each roster actor's SHEET exceptions (grants/revokes). One read,
  // only when the game actually defines trackers (a tracker-free game pays nothing for the machinery).
  const sheets = game !== undefined && config.trackers.length > 0 ? await listSheets(deps.db, game.id) : [];
  const player = roster.find((r) => r.actorRef.kind === "user");
  const rosterOwnsPlayerName = roster.some((r) => r.name.toLowerCase() === PLAYER_SEMANTIC_REF);
  // The CARRIERS and the target-name enum are built from ONE walk, so they can never diverge: every name the
  // enum offers belongs to a carrier whose writable-tracker set the schema then pins (R6), and every carrier
  // is reachable. Insertion-ordered, case-insensitively deduped.
  const seen = new Set<string>();
  const carriers: RpgTrackerCarrier[] = [];
  const add = (carrier: RpgTrackerCarrier): void => {
    const key = carrier.name.toLowerCase();
    if (carrier.name.length > 0 && !seen.has(key)) {
      seen.add(key);
      carriers.push(carrier);
    }
  };
  // Every carrier is minted through the ONE derivation the READ surface uses (`actorCarrier`, the tracker
  // view's) — never a second inline spelling of "which class is this person, and what are their exceptions".
  // That is the §1.4 fix made literal: the read surface used to class by which PLANE a row sat on and the
  // write surface by name-dedup order, so a roster character standing in the scene was `npcs` to one and
  // `party` to the other, and a `trust(appliesTo:"npcs")` def was taught on her line and offered on nobody's.
  // One function, both surfaces, class derived from `actorRef.kind` — the drift is unrepresentable.
  const sheetByKey = new Map<string, RpgSheet>(
    sheets.map((row) => [
      actorRefKey(row.characterId !== null ? { kind: "character", characterId: row.characterId } : { kind: "user", userId: row.userId as UserId }),
      row.sheet,
    ]),
  );
  const carrierFor = (ref: RpgActorRef, name: string): RpgTrackerCarrier => actorCarrier(ref, name, sheetByKey.get(actorRefKey(ref)));
  // The stable semantic token leads — UNLESS a roster member already claims "player" (that char owns it, F10).
  // It rides as a SECOND carrier over the same actor so it lands in the player's own write-surface group.
  if (player !== undefined && !rosterOwnsPlayerName) {
    add(carrierFor(player.actorRef, PLAYER_SEMANTIC_REF));
  }
  for (const r of roster) {
    // every roster display name is valid (persona-name + the F10 "Player"-named char)
    add(carrierFor(r.actorRef, r.name));
  }
  // The tracked CAST actors — on stage or off (F4: party/inventory/wallet reach a tracked NPC either way).
  // ONE walk since R2, because the scene cast and the tracked cast are the SAME rows now: the presence plane
  // holds only ref keys, so there is no second name namespace to add and no way for a carrier to be classed
  // twice. The enum offers the DISPLAY name (what the model wrote and will write back), never the slug key.
  for (const actor of baseState.actorState) {
    if (actor.actorRef.kind === "cast") {
      add(carrierFor(actor.actorRef, actor.identity?.name ?? actor.actorRef.castKey));
    }
  }
  const actorRefs = carriers.map((c) => c.name);
  // R5a — the CURRENTLY-ACTIVE condition names (across every tracked actor, deduped in encounter order)
  // constrain `party[].removeCondition`, so a retirement can only name a condition that is actually on
  // someone. Nobody afflicted ⇒ an empty list ⇒ the field stays unconstrained (never an empty enum).
  const conditionNames = [...new Set(baseState.actorState.flatMap((a) => a.volatile.conditions.map((c) => c.name)))];
  // ESTABLISH-WHEN-UNSET: force scene fields REQUIRED (constrainExtractionSchema) ONLY while the current scene
  // lacks them — a fresh game establishes the scene from the first beat, an ongoing scene keeps the optional
  // omit=keep patch. `location` defaults to "" (unset), `clock` is null until a timeOfDay lands, and an empty
  // `presentCharacters` means the cast hasn't been put on stage yet (force a non-empty presentUpsert).
  //
  // RECONCILE (crunchy-cluster §1.3): on a reconcile beat / a resync, force EVERY scene field REQUIRED
  // UNCONDITIONALLY (not just the unset ones) — the establish-when-unset lever becomes the standing anti-drift
  // mechanism, so the model re-states the whole scene + present cast even when the state already has them. The
  // re-emission still merges through [merge-clear] + lock honoring, so a hand-pin survives a reconcile.
  const establishScene = reconcile
    ? { location: true, timeOfDay: true, presentCast: true }
    : {
        location: baseState.location === "",
        timeOfDay: baseState.clock === null,
        presentCast: baseState.presentCharacters.length === 0,
      };
  return {
    refs: {
      actorRefs,
      // R6 — the per-actor write surface: each distinct writable-tracker set with the target names that share
      // it. Identical sets collapse into ONE group, so the common all-`everyone` game projects a flat schema.
      trackerWriteGroups: buildTrackerWriteGroups(config.trackers, carriers),
      gameTrackerKeys: gameTrackerWriteKeys(config.trackers),
      conditionNames,
      establishScene,
    },
    playerDisplayName: player?.name ?? null,
    config,
  };
}

/** The valid-ref enumeration block (the FALLBACK arm for a model whose wire can't enforce the schema enum —
 *  the schema binds it structurally where the backend supports it, and the prompt names the valid refs
 *  everywhere). The `player` token is explained (= the human's character, currently shown as X) so the model
 *  prefers the stable ref. Returns "" for a fresh game with no refs (the composer omits the block). Both the
 *  structured extraction (`extractionSystem`) and the cheap tool round (`toolRoundSystem`) append this. */
function refEnumerationLines(inputs: PromptInputs): string {
  const { refs, playerDisplayName, prose } = inputs;
  const lines: string[] = [];
  if (refs.actorRefs.length > 0) {
    lines.push(resolveProseText("rpg.extract.refs.targets", prose, { targetRefs: refs.actorRefs.join(", ") }));
  }
  // Explain the `player` token ONLY when it is actually in the enum — a roster char literally named "Player"
  // owns that ref (F10), so the token is withheld and the human is addressed by their display name instead.
  if (playerDisplayName !== null && refs.actorRefs.includes(PLAYER_SEMANTIC_REF)) {
    lines.push(resolveProseText("rpg.extract.refs.playerToken", prose, { playerRef: PLAYER_SEMANTIC_REF, playerName: playerDisplayName }));
  }
  // R6 — the TRACKER write surface named in prose (the fallback arm for a wire that can't enforce the enums).
  // The keys are listed per distinct carrier set, so a model reading only the prompt still learns that not
  // every actor carries every tracker. Empty groups (a tracker-free game) contribute nothing.
  //
  // The two ARM LABELS stay inline literals and are NOT slots: `trackerDeltas keys:` / `trackerSets keys:` are
  // the wire field names with a colon — structural grammar, three words, §2.11's out-of-scope class (editing
  // one buys a host nothing and desyncs the label from the arg it names).
  for (const group of refs.trackerWriteGroups) {
    if (group.deltaKeys.length === 0 && group.setKeys.length === 0) {
      continue;
    }
    const arms: string[] = [];
    if (group.deltaKeys.length > 0) {
      arms.push(`trackerDeltas keys: ${group.deltaKeys.join(", ")}`);
    }
    if (group.setKeys.length > 0) {
      arms.push(`trackerSets keys: ${group.setKeys.join(", ")}`);
    }
    lines.push(resolveProseText("rpg.extract.refs.trackerGroup", prose, { targetRefs: group.targetRefs.join(", "), trackerKeys: arms.join("; ") }));
  }
  const gameKeys = [...refs.gameTrackerKeys.deltaKeys, ...refs.gameTrackerKeys.setKeys];
  if (gameKeys.length > 0) {
    lines.push(resolveProseText("rpg.extract.refs.gameTrackerKeys", prose, { trackerKeys: gameKeys.join(", ") }));
  }
  // R5b(a) — the schema binds `removeCondition` to the live conditions (R5a); this is the matching PROMPT half
  // for a backend that can't enforce the enum. Without it the model retires a condition nobody carries (or
  // comma-joins four into the scalar, the measured 8B failure) and the write is silently dropped at apply.
  if (refs.conditionNames.length > 0) {
    lines.push(resolveProseText("rpg.extract.refs.conditions", prose, { conditions: refs.conditionNames.join(", ") }));
  }
  lines.push(resolveProseText("rpg.extract.refs.closing", prose));
  return lines.join("\n");
}

/** Build the STRUCTURED-OUTPUT extraction op (§4.6). No longer a delivery mode of its own (the `reliable` knob
 *  was deleted 2026-08-01 — owner ruling): it is the vehicle `runToolRound` degrades to on an agent-sdk wire (no
 *  wire `tools[]`) and the vehicle the host resync drives. Rides the CHARACTER turn's ALREADY-RESOLVED connection +
 *  consent verdict (`input.turnConnection` — stickler F1: never a re-resolve of the host's global default, never
 *  a force-stamped consent), reads the beat, drives ONE structured-output call ROUTED BY API (agent-sdk → the
 *  chat structured-output path; every other api → the `structured` dispatcher), and folds the parsed extraction
 *  into an `RpgStateDelta`. On any backend throw / parse failure it returns an EMPTY delta (the byte-identical
 *  non-writing turn — a broken extraction never corrupts canon, the errors-as-data posture).
 *
 *  State-round economics: this is a real billed call that lands NO `ToolCallRecord` and NO stats delta (deliberate — the char turn is
 *  tool-less, so persisting the round's calls on the variant would lie to the transcript reader). The per-item provider log is the v1
 *  record (`provider.structured-item`; the agent-sdk arm's `provider.turn`) — see spec §10.1a. */
function buildRunExtraction(deps: RpgComposeDeps): RpgRunExtraction {
  return async ({ chatId, baseState, turnConnection, reconcile, signal }) => {
    const empty = { statePatch: {}, journal: [] };
    const conn = turnConnection.connection;
    // CANCELLED BEFORE THE CALL — spend nothing, read nothing, return the empty delta (the same shape a failed
    // extraction returns; a cancelled round is byte-identical to a non-writing turn).
    if (isCancelled(signal)) {
      logCancelled({ chatId, model: conn.model, api: conn.api, vehicle: "structured extraction", preflight: true });
      return empty;
    }
    // R1 — the mis-target fix: constrain the response schema's ref fields to the ACTUAL per-call refs (the
    // semantic `player` token + roster/persona names + existing scene-cast + cast-actor keys + tracker keys)
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
      ownerConsented: turnConnection.ownerConsented,
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
      text = conn.api === "agent-sdk" ? await extractViaChat(deps, ctx) : await extractViaStructured(deps, ctx);
    } catch (err) {
      // A CANCEL is not a FAILURE. Reading the signal (not the error's shape) is what keeps the two apart: the
      // thrown value differs per backend, and misfiling a user's Stop as `rpg.extraction.failed` would put a
      // normal cancellation in the same warn stream we use to diagnose broken extractions.
      if (isCancelled(signal)) {
        logCancelled({ chatId, model: conn.model, api: conn.api, vehicle: "structured extraction", preflight: false });
        return empty;
      }
      logger.warn({ event: "rpg.extraction.failed", chatId, model: conn.model, api: conn.api, err }, "rpg structured extraction failed");
      return empty;
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
    // The roster index resolves an extracted party/inventory target NAME to its roster ref (F2 — the same
    // first-class resolution the cheap-mode tools use; a structured write on a party member must render too).
    const roster = buildRosterRefIndex(await deps.rpgChatOps.resolveRpgRoster(chatId));
    const delta = extractionToStateDelta(baseState, extraction, { item: () => newId(), quest: () => newId(), objective: () => newId() }, roster);
    // R3 — visibility: an extraction that parsed but resolves to ZERO renderable writes (all phantom mints /
    // no-ops) is a SIGNAL (mis-target or an empty beat), not a silent nothing. Log it with the ref context so
    // a dark panel is diagnosable from the provider trail.
    logExtractionOutcome({ chatId, model: conn.model, api: conn.api, actorRefs: refs.actorRefs.length, base: baseState, roster, parsed: extraction, delta });
    return delta;
  };
}

/** R3 — the extraction-outcome visibility log, and the ONE TAIL all three delivery vehicles run through (so a
 *  degrade reads identically whichever way the calls arrived). Emits a line when the delta writes NOTHING
 *  renderable (the silent-empty-panel signal), whenever the extraction named a GHOST actor (a target with no
 *  referent this turn — the R5 guard dropped its arg), and whenever a journal `type` was HEALED (EXT-4b).
 *  Metadata only (ref counts + names + indexes), never beat/reply text.
 *
 *  The lines are INDEPENDENT (not an either/or): since R5 drops the ghost args, a ghost-only extraction is
 *  precisely the case that also writes nothing — an `else if` would have hidden the cause behind the symptom. */
function logExtractionOutcome(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: string;
  /** How many actors the model could legally have targeted — the denominator that makes a write-nothing line
   *  actionable ("nobody to write about" vs "targets existed and it wrote none"). The round arms pass their
   *  per-call `refs.actorRefs.length`; the FOLD passes `reachableActorRefs(base, roster).size`, the same menu
   *  derived from state it already holds — so it never re-resolves the ref bundle just to log. */
  readonly actorRefs: number;
  readonly base: RpgSnapshotState;
  readonly roster: RosterRefIndex;
  readonly parsed: RpgExtraction;
  readonly delta: { readonly statePatch: Record<string, unknown>; readonly journal: readonly unknown[] };
}): void {
  // The party/inventory targets naming NOBODY reachable this turn — the SAME predicate the fold drops on (one
  // home, so the log can never disagree with what actually applied).
  const phantomTargets = ghostTargetRefs(args.base, args.parsed, args.roster);
  if (phantomTargets.length > 0) {
    logger.warn(
      { event: "rpg.extraction.phantom", chatId: args.chatId, model: args.model, api: args.api, phantomTargets },
      "rpg extraction named ghost actor(s) with no live referent — those args were DROPPED (no cast mint)",
    );
  }
  // EXT-4b — the HEAL is visible. A journal entry whose `type` the model omitted is healed to `note` rather than
  // dropped (the nested-required blind spot), which is a silent quality loss unless it is named. Read off the
  // FOLDED extraction, so all three delivery paths report it identically (this function is their one tail).
  const healed = healedJournalTypes(args.parsed);
  if (healed.length > 0) {
    logger.warn(
      { event: "rpg.extraction.healed", chatId: args.chatId, model: args.model, api: args.api, healedJournalTypes: healed },
      "rpg extraction: journal entry(ies) omitted `type` — HEALED to note (the entry still applies)",
    );
  }
  const wroteNothing = Object.keys(args.delta.statePatch).length === 0 && args.delta.journal.length === 0;
  if (wroteNothing) {
    logger.warn(
      { event: "rpg.extraction.empty", chatId: args.chatId, model: args.model, api: args.api, actorRefs: args.actorRefs, phantomTargets },
      "rpg extraction wrote NOTHING renderable (mis-target or empty beat)",
    );
  }
}

/** The TOOL vehicles' loss log (EXT-4a — one home for both, so the cheap round and the folded turn can never
 *  report a loss differently). TWO classes, each with its own event and neither silent:
 *
 *   • DROPPED — the call's args were non-JSON or failed their schema; nothing of it applied
 *     (`malformedToolCalls`, mirroring the fold's silent `continue`s).
 *   • STRIPPED — the call PARSED and applied, minus one or more keys the schema never declared
 *     (`strippedToolCallKeys`). zod `z.object` is strip-mode, so an invented key (`update_party.mana` where a
 *     `trackerDeltas` entry belonged) used to land as a SUCCESS record with its write silently gone — a quiet
 *     delivery fork, banned by D112 (3). It is a WARN and not an error because the rest of the call still
 *     applied; `z.strictObject` would have cost the whole call, against EXT-4a's drop-as-little-as-possible.
 *
 *  Both are silent on the happy path. */
function logToolCallLosses(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: string;
  readonly calls: readonly RpgToolCall[];
  readonly vehicle: string;
  /** The caller's event namespace, mirroring `logStrippedKeys`. Omitted ⇒ the IN-TURN namespace, which is what
   *  both turn vehicles have always emitted (their call sites are byte-unchanged); the host resync passes its
   *  own `rpg.resync.*` pair so a catch-up round's losses stay on the resync's trail. */
  readonly events?: { readonly unparseable: string; readonly stripped: string } | undefined;
}): void {
  const events = args.events ?? { unparseable: "rpg.extraction.unparseable", stripped: "rpg.extraction.stripped" };
  // The DETAIL arm, not the names one: a tool name alone is unactionable (12 identical `update_scene` drops
  // cost a live session hours before a schema probe found the offending field). `droppedIssues` carries the
  // failing path, the expectation, and the value the model actually sent.
  const droppedDetails = malformedToolCallDetails(args.calls);
  if (droppedDetails.length > 0) {
    logger.warn(
      {
        event: events.unparseable,
        chatId: args.chatId,
        model: args.model,
        api: args.api,
        droppedTools: droppedDetails.map((detail) => detail.name),
        droppedIssues: droppedDetails.flatMap((detail) => detail.issues.map((issue) => `${detail.name}.${issue}`)),
      },
      `rpg ${args.vehicle}: tool call(s) with unusable args — DROPPED (every other call this turn still applies)`,
    );
  }
  // The THIRD loss class (EXT-4a salvage): fields whose VALUES the schema rejected, dropped so the rest of
  // the call could apply. Distinct from STRIPPED (a key the schema never declared) — this one means the model
  // tried to write something real and the vocabulary had no room for it, which is how a closed enum with a
  // hole in it announces itself (`update_scene.weather` on an indoor scene).
  const salvaged = salvagedToolCallFields(args.calls);
  if (salvaged.length > 0) {
    logger.warn(
      { event: events.unparseable, chatId: args.chatId, model: args.model, api: args.api, salvagedFields: salvaged },
      `rpg ${args.vehicle}: field(s) with unusable values DROPPED — the rest of the call applied (a closed vocabulary may be missing a member)`,
    );
  }
  logStrippedKeys({ ...args, event: events.stripped, stripped: strippedToolCallKeys(args.calls) });
}

/** The STRIP log, one home for all four emitters (cheap round · folded turn · structured extraction · resync)
 *  so an invented key reads identically whichever vehicle carried it. `event` is the caller's own namespace
 *  (`rpg.extraction.stripped` / `rpg.resync.stripped`) — the resync keeps its own trail, as it does for every
 *  other class. Silent on the happy path. */
function logStrippedKeys(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: string;
  readonly vehicle: string;
  readonly event: string;
  readonly stripped: readonly string[];
}): void {
  if (args.stripped.length === 0) {
    return;
  }
  logger.warn(
    { event: args.event, chatId: args.chatId, model: args.model, api: args.api, strippedKeys: args.stripped },
    `rpg ${args.vehicle}: the model sent key(s) the schema does not declare — those writes were DROPPED (everything else applied)`,
  );
}

/** The DEDICATED state round's economics record (spec §10.1a). That section's claim — "the state round's
 *  economics ARE recorded, in the provider-observability plane" — was only true for the STRUCTURED vehicles:
 *  `runStructuredTurn`'s surfaces emit `provider.structured-item` per item, and the agent-sdk arm emits
 *  `provider.turn`. The cheap tool round rides the CHAT role on a stateless backend (vLLM / OpenRouter),
 *  which emits NEITHER — so its tokens and cost left no record at all unless a wire capture happened to be
 *  armed. This is that record: same fields as the `provider.*-item` precedent (model + tokens + duration +
 *  finishReason) plus the cost the `ChatUsage` carries, emitted from the round's own vehicle so the event
 *  name says which one billed. Metadata only — never prompt/reply/extraction text. The FAILURE arm is
 *  already named by `rpg.toolround.failed` (a throw has no usage to report). */
function logToolRoundUsage(args: { readonly chatId: ChatId; readonly api: string; readonly result: ChatResult }): void {
  const { usage } = args.result;
  logger.info(
    {
      event: "rpg.toolround.usage",
      chatId: args.chatId,
      api: args.api,
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      reasoningTokens: usage.reasoningTokens,
      costUsd: usage.costUsd,
      durationMs: args.result.durationApiMs,
      finishReason: args.result.finishReason,
    },
    "rpg cheap tool round billed",
  );
}

/** Re-READ a signal's LIVE abort flag. Deliberately a call, not a bare `signal.aborted`: the checker models
 *  `aborted` as a plain boolean and narrows it, so the SECOND read — the one inside the `catch`, which is the
 *  read that actually decides cancelled-vs-failed — is reported as always-false dead code. In reality the flag
 *  flips ASYNCHRONOUSLY while the model call is in flight. A call keeps the re-read honest instead of
 *  suppressing a rule that is (reasonably) confused by a mutable getter. */
function isCancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** The CANCELLED-round line, one home for both in-turn vehicles (the caller aborted the turn while the round was
 *  queued or in flight). `info`, not `warn`: a cancellation is a correct, user-initiated outcome, and filing it
 *  beside `rpg.extraction.failed` / `rpg.toolround.failed` would poison the stream those warns exist to make
 *  readable. It is not SILENT either — a round that spent tokens and wrote nothing must be visible, and
 *  `preflight` says whether any spend happened at all (`true` = the abort beat the call, so nothing was billed).
 *  The vehicle is named because the two arms bill on different provider trails. */
function logCancelled(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: string;
  readonly vehicle: string;
  readonly preflight: boolean;
}): void {
  logger.info(
    { event: "rpg.stateround.cancelled", chatId: args.chatId, model: args.model, api: args.api, vehicle: args.vehicle, preflight: args.preflight },
    args.preflight
      ? `rpg ${args.vehicle} cancelled before its model call — nothing billed, no state written`
      : `rpg ${args.vehicle} cancelled in flight (the caller aborted the turn) — no state written`,
  );
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
// parsed calls fold to the SAME `RpgStateDelta` the structured arm produces (the shared-plane proof). Portable across
// the ARRAY wires (chat-completions/responses); an agent-sdk host connection has no wire `tools[]`, so it
// routes through the SAME structured-output extraction (identical delta by the shared-plane proof — the
// honest degrade, capability-keyed: cheap needs `capability.tools`, absent ⇒ readonly upstream).

/** The tool-round system prompt — state-focused, aggressive about tool use (no prose to lose). Composes the
 *  SAME per-plane teaching (from the §1.6 registry — plot/trackers/deception-clause) that the
 *  structured arm uses, plus the tool-round's decomposition-nudge framing + the ref enumeration (R1 fallback). */
function toolRoundSystem(inputs: PromptInputs): string {
  const { config, refs, prose, reconcile } = inputs;
  // DECOMPOSITION NUDGE (2026-07-27): the 8B under-fires — a beat that moved location AND wounded someone often
  // wrote only ONE plane. So the prompt walks the model plane-by-plane (a checklist) and gives the concrete
  // multi-call example, forcing it to consider EACH plane independently rather than settling for one call.
  // Bounded attempt ([[plan-for-small-hardware]] — if the 8B ceiling holds, the honest-arms degrade holds).
  // The bytes are a PROSE-1 slot, so a host whose model under-fires differently can retune the checklist.
  const base = resolveProseText("rpg.extract.toolRoundHeader", prose);
  const teaching = composePlaneTeaching({ config, refs, prose });
  const refLines = refEnumerationLines(inputs);
  const parts = [base, teaching, refLines, ...(reconcile ? [resolveProseText("rpg.extract.reconcilePass", prose)] : [])];
  return parts.join("\n\n");
}

/** Build the per-game, per-actor wire tools for a state round / a folded turn (R6 + R2). The parameters come
 *  from ONE projection of the extraction schema constrained by this call's refs — so the tool a model is handed
 *  offers EXACTLY the trackers each target actually carries, minus the locked ones (prevent-at-schema; the
 *  apply-time lock strip stays a backstop). The descriptions are the R2 TEMPLATES rendered against THIS game,
 *  so a host's `Grit ("resolve you spend to push through danger")` reaches the write surface by name + gloss.
 *
 *  A plane the game doesn't have is OMITTED ENTIRELY, never offered as an empty husk: `set_tracker` disappears
 *  when the game defines no game-subject trackers (the constraint dropped the plane from the schema, and a
 *  tool whose parameters no longer exist would be an invitation to write nothing). */
function buildToolRoundWireTools(
  refs: ExtractionRefs,
  config: RpgGameConfig,
  prose: ProseOverrides,
): { name: string; description: string; parameters: Record<string, unknown> }[] {
  // The per-tool projected args, ref-constrained. We reuse the extraction constraint by projecting the whole
  // extraction schema once and lifting each array field's item schema (which carries the injected enums).
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs) as {
    properties?: Record<string, { items?: Record<string, unknown> } | Record<string, unknown>>;
  };
  const itemSchemaOf = (field: string): Record<string, unknown> | undefined => {
    const node = constrained.properties?.[field] as { items?: Record<string, unknown> } | undefined;
    return node === undefined ? undefined : (node.items ?? { type: "object" });
  };
  const sceneSchema = (constrained.properties?.["scene"] as Record<string, unknown> | undefined) ?? { type: "object" };
  const descriptions = buildRpgToolDescriptions({ config, refs, prose });
  const describeTool = (name: string): string => descriptions.get(name) ?? "";
  const tools: { name: string; description: string; parameters: Record<string, unknown> }[] = [
    { name: "update_party", description: describeTool("update_party"), parameters: itemSchemaOf("party") ?? { type: "object" } },
    { name: "update_inventory", description: describeTool("update_inventory"), parameters: itemSchemaOf("inventory") ?? { type: "object" } },
    { name: "update_scene", description: describeTool("update_scene"), parameters: sceneSchema },
  ];
  // The game-subject tracker tool — present ONLY when this game defines one (R6 "a disabled feature's tool is
  // omitted entirely"). `itemSchemaOf` returns undefined exactly when the constraint pruned the plane.
  const trackerParams = itemSchemaOf("trackers");
  if (trackerParams !== undefined) {
    tools.push({ name: "set_tracker", description: describeTool("set_tracker"), parameters: trackerParams });
  }
  tools.push(
    { name: "upsert_quest", description: describeTool("upsert_quest"), parameters: itemSchemaOf("quests") ?? { type: "object" } },
    { name: "add_journal_entry", description: describeTool("add_journal_entry"), parameters: itemSchemaOf("journal") ?? { type: "object" } },
    {
      name: RPG_NO_CHANGES_TOOL,
      description: resolveProseText("rpg.extract.tool.noChanges", prose),
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  );
  return tools;
}

/** Build the cheap-mode `runToolRound` op — the parallel-tool-call state round (the sibling of
 *  `runExtraction`). Rides the CHARACTER turn's ALREADY-RESOLVED connection + consent verdict
 *  (`input.turnConnection` — stickler F1: no re-resolve, no force-stamped consent); the vehicle is wire tools +
 *  `required`. On an agent-sdk host (no wire tools) it degrades to the structured extraction (identical delta,
 *  shared-plane). On any backend throw / no calls it returns the EMPTY delta (errors-as-data — never corrupts
 *  canon).
 *
 *  State-round economics: same posture as `runExtraction` (no `ToolCallRecord`, no stats delta — see spec §10.1a). This vehicle rides the
 *  CHAT role, so no backend emits a per-item usage log for it; `logToolRoundUsage` is its economics record (`rpg.toolround.usage`), which
 *  is what makes §10.1a's "recorded in the provider-observability plane" true here. The degraded agent-sdk arm rides `runExtraction`'s
 *  per-item record instead. */
function buildRunToolRound(deps: RpgComposeDeps): RpgRunToolRound {
  const extract = buildRunExtraction(deps);
  return async (input) => {
    const { chatId, baseState, turnConnection, reconcile, signal } = input;
    const empty = { statePatch: {}, journal: [] };
    const conn = turnConnection.connection;
    // agent-sdk has no wire tools[]; the shared-plane proof lets it ride the SAME structured extraction (which
    // runs its own pre-flight cancel check, so the degrade inherits cancellation identically).
    if (conn.api === "agent-sdk") {
      return extract(input);
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
    let calls: readonly RpgToolCall[];
    try {
      const result = await deps.executor.runChatTurn({
        api: conn.api,
        // The wire-capture correlation key (see `ExtractCtx.chatId`). Without it this round — the ONE vehicle
        // that carries the state tools on its own request — records ANONYMOUSLY, so
        // `/api/_debug/wire/captures?chatId=` shows the character turns and nothing of the round that actually
        // wrote the state. Measured on the live spill before this landed.
        chatId,
        model: conn.model,
        credential: conn.credential,
        capability: conn.capability,
        params: {},
        systemPrompt: { static: toolRoundSystem(inputs), dynamic: "" },
        history: [{ role: "user", content: [{ type: "text", text: buildExtractionUserPrompt(turnConnection.transcript, baseState, config, prose) }] }],
        tools: buildToolRoundWireTools(refs, config, prose),
        toolChoice: { mode: "required" },
        // The character turn's enforced consent verdict, inherited (never force-stamped `true` — F1). Non-sub
        // backends ignore it; a max-pro-sub round only ever runs because the character turn already consented.
        ownerConsented: turnConnection.ownerConsented,
        signal,
      });
      // The round's economics record — §10.1a's claim, made true on the vehicle that had no emitter.
      logToolRoundUsage({ chatId, api: conn.api, result });
      calls = result.toolCalls ?? [];
    } catch (err) {
      // A CANCEL is not a FAILURE — read the signal, never the error's shape (see the structured arm's twin).
      if (isCancelled(signal)) {
        logCancelled({ chatId, model: conn.model, api: conn.api, vehicle: "cheap tool round", preflight: false });
        return empty;
      }
      logger.warn({ event: "rpg.toolround.failed", chatId, model: conn.model, api: conn.api, err }, "rpg cheap tool round failed");
      return empty;
    }
    // Fold the parallel tool calls → an RpgExtraction → the SAME state delta the structured arm produces (`no_changes`
    // and any unknown tool contribute nothing — the quiet-turn no-op). A call the fold threw away is NAMED, the
    // same way the folded arm names its drops (EXT-4a: equal drop semantics means equal VISIBILITY too — the
    // dedicated round was the one vehicle that dropped silently).
    logToolCallLosses({ chatId, model: conn.model, api: conn.api, calls, vehicle: "cheap tool round" });
    const extraction = toolCallsToExtraction(calls);
    const roster = buildRosterRefIndex(await deps.rpgChatOps.resolveRpgRoster(chatId));
    const delta = extractionToStateDelta(baseState, extraction, { item: () => newId(), quest: () => newId(), objective: () => newId() }, roster);
    logExtractionOutcome({ chatId, model: conn.model, api: conn.api, actorRefs: refs.actorRefs.length, base: baseState, roster, parsed: extraction, delta });
    return delta;
  };
}

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
function buildFoldedTurnBuilder(deps: RpgComposeDeps): RpgContext["buildFoldedTurn"] {
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
function buildFoldTurnToolCalls(deps: RpgComposeDeps): RpgContext["foldTurnToolCalls"] {
  return async ({ chatId, turnId, baseState, turnConnection, toolCalls }) => {
    const conn = turnConnection.connection;
    // R-OBS: what the model CALLED and what survived the schema — the folded turn's tool traffic is otherwise
    // server-internal by D112 design, so this ring is the only place it is legible after the fact.
    // `recordToolCalls` is the ONE projection (`@orb/contracts/rpg`) — the durable per-variant row the user
    // disclosure reads is written from the same call, so the ring, the warn and the row cannot disagree.
    deps.trace?.({ phase: "tool", chatId, turnId, vehicle: "folded extraction", calls: recordToolCalls(toolCalls) });
    // A malformed arg NEVER fails the turn (the narrative is already committed) — `toolCallsToExtraction` drops
    // it, and this names what was dropped so the loss is diagnosable instead of silent (D109-7 totality).
    logToolCallLosses({ chatId, model: conn.model, api: conn.api, calls: toolCalls, vehicle: "folded extraction" });
    // ZERO calls is a legitimate no-change beat, NOT a failure: with `tool_choice:"auto"` a quiet beat is the
    // model correctly declining to write. It gets its OWN event so it can never be confused with a parse
    // failure or a dead fold, and it returns before the ref resolve (nothing to constrain, nothing to apply).
    if (toolCalls.length === 0) {
      logger.info({ event: "rpg.extraction.folded.quiet", chatId, model: conn.model, api: conn.api }, "rpg folded turn recorded no state change (quiet beat)");
      return { statePatch: {}, journal: [] };
    }
    const extraction = toolCallsToExtraction(toolCalls);
    // ONE db read. The ref bundle (`resolveExtractionRefs`) is the MOUNT's job — it constrains what the model
    // may write, and the model has already written by the time we get here; re-resolving it at flush would be
    // two more reads (the game row + a SECOND roster) whose only consumer is a log field. The roster index is
    // genuinely needed (it resolves target names to roster refs and backs the ghost guard), and the log's
    // target-menu denominator derives from state we already hold.
    const roster = buildRosterRefIndex(await deps.rpgChatOps.resolveRpgRoster(chatId));
    const delta = extractionToStateDelta(baseState, extraction, { item: () => newId(), quest: () => newId(), objective: () => newId() }, roster);
    logExtractionOutcome({
      chatId,
      model: conn.model,
      api: conn.api,
      actorRefs: reachableActorRefs(baseState, roster).size,
      base: baseState,
      roster,
      parsed: extraction,
      delta,
    });
    return delta;
  };
}

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
// The STRUCTURED arm survives as the degrade, unchanged: an agent-sdk host connection carries no wire
// `tools[]` (the terminal-tools channel is a CHAT-pipeline mount, not a state-round vehicle), so it still
// rides `extractViaChat` with the projected schema. Same delta either way — the shared-plane proof.

/** The resync's TOOL-ROUND arm: one state-only turn, the 7 per-plane tools, `tool_choice:"required"`. Errors
 *  are DATA (the RESYNC-OR grammar): a throw becomes the host's sentence, never a silent empty rebuild. */
async function resyncViaToolRound(
  deps: RpgComposeDeps,
  args: {
    readonly chatId: ChatId;
    readonly conn: ResolvedConnection;
    /** The resolved connection's api, NARROWED to the array wires — an agent-sdk connection carries no wire
     *  `tools[]` and never reaches this arm (it takes the structured degrade instead). */
    readonly api: Exclude<ChatApi, "agent-sdk">;
    readonly baseState: RpgSnapshotState;
    readonly inputs: PromptInputs;
    readonly userPrompt: string;
  },
): Promise<{ readonly ok: true; readonly delta: RpgStateDelta } | { readonly ok: false; readonly reason: string }> {
  const { chatId, conn, api, baseState, inputs, userPrompt } = args;
  const { refs, config, prose } = inputs;
  let calls: readonly RpgToolCall[];
  try {
    const result = await deps.executor.runChatTurn({
      api,
      // Same correlation key as the in-turn round (see `ExtractCtx.chatId`) — a host-clicked resync is exactly
      // the moment an operator is reading the wire ring for that chat.
      chatId,
      model: conn.model,
      credential: conn.credential,
      capability: conn.capability,
      params: {},
      systemPrompt: { static: toolRoundSystem(inputs), dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
      tools: buildToolRoundWireTools(refs, config, prose),
      toolChoice: { mode: "required" },
      // The host funds + authorizes this call (the consenting human clicked the button) — never an inherited
      // turn verdict, because no turn is running.
      ownerConsented: true,
    });
    logToolRoundUsage({ chatId, api: conn.api, result });
    calls = result.toolCalls ?? [];
  } catch (err) {
    logger.warn({ event: "rpg.resync.failed", chatId, model: conn.model, api: conn.api, err }, "rpg resync tool round failed");
    return { ok: false, reason: `${RESYNC_FAILED_REASON} ${errorMessage(err)}` };
  }
  // The SAME loss log both in-turn tool vehicles run, in the resync's own event namespace.
  logToolCallLosses({
    chatId,
    model: conn.model,
    api: conn.api,
    calls,
    vehicle: "resync tool round",
    events: { unparseable: "rpg.resync.unparseable", stripped: "rpg.resync.stripped" },
  });
  const extraction = toolCallsToExtraction(calls);
  const roster = buildRosterRefIndex(await deps.rpgChatOps.resolveRpgRoster(chatId));
  const delta = extractionToStateDelta(baseState, extraction, { item: () => newId(), quest: () => newId(), objective: () => newId() }, roster);
  logExtractionOutcome({ chatId, model: conn.model, api: conn.api, actorRefs: refs.actorRefs.length, base: baseState, roster, parsed: extraction, delta });
  return { ok: true, delta };
}

/** Build the host `resyncFromStory` model call. Resolves the room connection AS THE HOST, gates readonly
 *  (capability-absent ⇒ a legible refusal), runs the establish-EVERYTHING extraction over the deep window. */
function buildRunResyncExtraction(deps: RpgComposeDeps): RpgContext["runResyncExtraction"] {
  return async ({ chatId, hostUserId, baseState, transcript }) => {
    // Resolve the ROOM connection AS THE HOST — fresh, at the verb (the `resolveStateDelivery` host-resolve
    // precedent). The host principal is minted from the room-host userId the VERB resolved by role, never a
    // caller-supplied id (the injected-op caller-gate class). A misconfigured/incoherent backend REFUSES the
    // resync legibly (never a 500); anything else rethrows (never swallow a real bug).
    const host = await deps.resolveHostPrincipal(hostUserId);
    const routableChat = await readRoutableChat(deps.db, chatId);
    let conn: ResolvedConnection;
    try {
      conn = await deps.connection.resolveChat({ principal: host, routableChat });
    } catch (err) {
      if (err instanceof ConnectionRoutingError || err instanceof AgentModelHealError) {
        logger.warn({ event: "rpg.resync.unresolvable", chatId }, "rpg resync: room connection did not resolve — no rebuild");
        return { ok: false, reason: RESYNC_UNRESOLVABLE_REASON };
      }
      throw err;
    }
    // NO WRITE PATH AT ALL ⇒ no rebuild (the resync's OWN capability gate — it is not a per-turn delivery mode,
    // so it keys on the capability directly, mirroring the flush's F2 posture: a resync on a manual-steering
    // connection would predictably fail and, on hosted creds, cost real spend). TWO vehicles satisfy it now:
    // wire tools (the catch-up round) or the structured writer (the agent-sdk degrade).
    const toolWire = conn.api !== "agent-sdk" && hasToolWriter(conn.capability) ? conn.api : null;
    if (toolWire === null && !hasStructuredWriter(conn.capability)) {
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
    const userPrompt = buildExtractionUserPrompt(transcript, baseState, resyncConfig, prose);
    const args = { chatId, conn, baseState, inputs, userPrompt };
    return toolWire !== null ? await resyncViaToolRound(deps, { ...args, api: toolWire }) : await resyncViaStructured(deps, args);
  };
}

/** The resync's STRUCTURED arm — unchanged in every respect except that it is now the DEGRADE (a wire with no
 *  `tools[]` takes it) rather than the only vehicle. Same schema, same salvage, same RESYNC-OR refusal grammar. */
async function resyncViaStructured(
  deps: RpgComposeDeps,
  args: {
    readonly chatId: ChatId;
    readonly conn: ResolvedConnection;
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
    // The host funds + authorizes this call: consent is the HOST's own (the consenting human initiated it),
    // never a force-stamped inheritance from an unrelated turn. A max-pro-sub firewall still applies — a host
    // whose own consent belt refuses a metered sub simply refuses the resync.
    ownerConsented: true,
    systemPrompt: extractionSystem(inputs),
    userPrompt,
    schema: constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs),
    // A HOST DOOR has no cancellation to inherit: it is verb-initiated, and the tRPC request's signal is not
    // threaded down to verbs on this tree. Stated, not defaulted — a future arm must answer the question.
    signal: undefined,
  };
  let text: string;
  try {
    text = conn.api === "agent-sdk" ? await extractViaChat(deps, ctx) : await extractViaStructured(deps, ctx);
  } catch (err) {
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
  const roster = buildRosterRefIndex(await deps.rpgChatOps.resolveRpgRoster(chatId));
  const delta = extractionToStateDelta(baseState, extraction, { item: () => newId(), quest: () => newId(), objective: () => newId() }, roster);
  logExtractionOutcome({ chatId, model: conn.model, api: conn.api, actorRefs: refs.actorRefs.length, base: baseState, roster, parsed: extraction, delta });
  return { ok: true, delta };
}

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

/** The populate system prompt HEADER. Names the two evidence blocks + the ONE-SHOT framing (this runs once, at
 *  a host's click, on a character who has not played yet), and hands the invent-nothing doctrine to the shared
 *  teaching composer (`composePopulateTeaching`, the §1.6 registry's populate arm). */
const POPULATE_SYSTEM_HEADER =
  "You are reading a role-play character's CARD and the story's OPENING scene to fill in what that character " +
  "starts the game with. This runs ONCE, before the character has played: you are establishing their sheet and " +
  "the gear, coin, and goals they walked in with — not reacting to any beat. Output ONE JSON object.";

/** The populate user-turn body: the two evidence blocks + the target the writes must name. The CURRENT state is
 *  deliberately NOT sent — a born-state round has nothing to reconcile against, and showing it invites the
 *  model to restate what is already there instead of reading the card. */
function populateUserPrompt(corpus: RpgCardCorpus, targetRef: string): string {
  const blocks = [`CHARACTER CARD — ${corpus.name}:\n${corpus.card === "" ? "(the card carries no written description)" : corpus.card}`];
  if (corpus.opening !== "") {
    blocks.push(`OPENING SCENE (how the story begins):\n${corpus.opening}`);
  }
  blocks.push(`Write everything for targetRef "${targetRef}" — this round fills exactly this one character.`);
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
  deps: RpgComposeDeps,
  chatId: ChatId,
  hostUserId: UserId,
): Promise<{ readonly ok: true; readonly conn: ResolvedConnection } | { readonly ok: false; readonly reason: string }> {
  const host = await deps.resolveHostPrincipal(hostUserId);
  const routableChat = await readRoutableChat(deps.db, chatId);
  let conn: ResolvedConnection;
  try {
    conn = await deps.connection.resolveChat({ principal: host, routableChat });
  } catch (err) {
    if (err instanceof ConnectionRoutingError || err instanceof AgentModelHealError) {
      logger.warn({ event: "rpg.populate.unresolvable", chatId }, "rpg populate: room connection did not resolve — no round");
      return { ok: false, reason: POPULATE_UNRESOLVABLE_REASON };
    }
    throw err;
  }
  if (!hasStructuredWriter(conn.capability)) {
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
function buildRunPopulateExtraction(deps: RpgComposeDeps): RpgContext["runPopulateExtraction"] {
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
      // The host funds + authorizes this call (the consenting human clicked the button) — the resync's posture.
      ownerConsented: true,
      systemPrompt: `${POPULATE_SYSTEM_HEADER}\n\n${composePopulateTeaching({ config: game?.config ?? rpgGameConfigSchema.parse({}), refs, prose })}`,
      userPrompt: populateUserPrompt(corpus, targetRef),
      schema: constrainPopulateSchema(projectJsonSchema(rpgPopulateSchema), targetRef),
      // A HOST DOOR has no cancellation to inherit — the resync's posture verbatim (see `resyncViaStructured`).
      signal: undefined,
    };
    let text: string;
    try {
      text = conn.api === "agent-sdk" ? await extractViaChat(deps, ctx) : await extractViaStructured(deps, ctx);
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
    const roster = buildRosterRefIndex(await deps.rpgChatOps.resolveRpgRoster(chatId));
    const delta = extractionToStateDelta(baseState, extraction, { item: () => newId(), quest: () => newId(), objective: () => newId() }, roster);
    logExtractionOutcome({ chatId, model: conn.model, api: conn.api, actorRefs: refs.actorRefs.length, base: baseState, roster, parsed: extraction, delta });
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

export function buildRpg(deps: RpgComposeDeps): RpgComposeResult {
  const ctx: RpgContext = {
    db: deps.db,
    now: deps.now,
    ids: {
      game: minter(ID_PREFIX.rpgGame),
      snapshot: minter(ID_PREFIX.rpgSnapshot),
      sheet: minter(ID_PREFIX.rpgSheet),
      journal: minter(ID_PREFIX.rpgJournal),
      checkpoint: minter(ID_PREFIX.rpgCheckpoint),
      turnToolCalls: minter(ID_PREFIX.rpgTurnToolCalls),
      // Quest + inventory-item ids are PLAIN strings minted inside the snapshot blob (no table, no FK — §4.1).
      quest: () => newId(),
      item: () => newId(),
    },
    staging: createRpgStagingStore(),
    // The ONE privilege kernel (spine invariant #6) — rpg's `guard.ts` resolves membership and asks THIS for the
    // host verdict, exactly as chat/automation do. Wired here, never imported by the domain (§2 flow).
    can,
    getMembership: deps.rpgChatOps.getMembership,
    setPointer: deps.rpgChatOps.setRpgPointer,
    resolveRoster: deps.rpgChatOps.resolveRpgRoster,
    // R4 — promotion's durable half (card + roster seat), the ONE rpg write that reaches outside the game.
    promoteToRoster: buildPromoteToRoster(deps),
    postNarratorMessage: deps.rpgChatOps.postNarratorMessage,
    resolvePresetOwned: deps.resolvePresetOwned,
    copyPresetToUser: deps.copyPresetToUser,
    // The chat's active-preset macros (WAVE MU) — the injected chat op the GM console's shadow gloss reads.
    resolvePresetUserMacros: deps.rpgChatOps.resolvePromptUserMacros,
    resolveStateDelivery: buildResolveStateDelivery(deps),
    runToolRound: buildRunToolRound(deps),
    // R1 (`folded` mode) — the two halves of the ONE-CALL exchange: the gather's tool mount + the flush's fold.
    // Neither makes a model call; the character turn already paid for both.
    buildFoldedTurn: buildFoldedTurnBuilder(deps),
    foldTurnToolCalls: buildFoldTurnToolCalls(deps),
    // The DEEP canon-window read (§1.3) the `resyncFromStory` host verb reads its story feed from — the injected
    // chat op (chat owns canon reads; rpg reads no chat table), shares the engine's transcript projection.
    resolveCanonWindow: deps.rpgChatOps.resolveCanonWindow,
    // The host resync model call (§1.3) — resolves the room connection AS THE HOST fresh at the verb (the ONE
    // non-inherited rpg model call, gated host-only inside the verb).
    runResyncExtraction: buildRunResyncExtraction(deps),
    // The BORN-STATE corpus read (the injected chat op — rpg reads no chat/character table) + the host populate
    // model call it feeds (owner ruling 2026-08-01 — the ONE sanctioned doorway for the hand-only sheet fields).
    resolveCardCorpus: deps.rpgChatOps.resolveCardCorpus,
    runPopulateExtraction: buildRunPopulateExtraction(deps),
    // The feature-root rpg bus emit (§4.9) — a verb/flush calls it after its durable write; fire-and-forget.
    // R-OBS taps it in passing: what the turn ANNOUNCED to the live panel is the other half of "did the write
    // reach the user", beside what it wrote. Untraced, this is `publishRpgEvent` verbatim.
    emitBus: (event) => {
      deps.trace?.({ phase: "bus", chatId: event.chatId, type: event.type });
      publishRpgEvent(event);
    },
    // The dice CSPRNG (bake-once, server-authoritative — a client seed is never honored, §4.4).
    randomInt: (max) => randomInt(max),
    // OBSERVABILITY: the flush write-boundary DROP hook (the F1 backstop refusing a contract-invalid state).
    // A state round fired, produced applicable output, and the write contract rejected it — surface WHICH
    // field/why so a dark panel is root-causable from the provider trail (never a silent vanish).
    // OBSERVABILITY (R1): which state-round PATH each flush resolved to. A `folded` game that quietly fell back
    // to the post-commit round still writes correct state — and silently pays the second call the fold exists
    // to delete. `warn` on a fallback (something to look at), `debug` when the knob got what it asked for.
    onStateRoundPath: (info) => {
      // R-OBS: the delivery FORK, per turn. A `folded` game quietly paying the second call forever is the
      // failure this event exists to make visible, and the ring is where it becomes queryable per chat.
      deps.trace?.({ phase: "flush", chatId: info.chatId, turnId: info.turnId, path: info.path, fallbackReason: info.fallbackReason });
      const line = { event: "rpg.extraction.path", chatId: info.chatId, gameId: info.gameId, mode: info.mode, path: info.path };
      if (info.fallbackReason !== null) {
        logger.warn({ ...line, fallbackReason: info.fallbackReason }, "rpg folded turn could not mount its tools — fell back to the post-commit state round");
        return;
      }
      logger.debug(line, "rpg state round resolved");
    },
    // OBSERVABILITY (R1): the folded turn's PRE-commit tool mount threw and was swallowed to protect the
    // character turn. The turn shipped tool-less and its state falls to the post-commit round — correct, but a
    // game that silently stops folding is a game that silently starts paying twice again. This is the only
    // trace, so it is a WARN with the cause attached.
    onFoldBuildFailed: (info) => {
      logger.warn(
        { event: "rpg.extraction.fold_build_failed", chatId: info.chatId, gameId: info.gameId, err: info.err },
        "rpg folded turn could not BUILD its tools — the turn ran tool-less; state falls to the post-commit round",
      );
    },
    // OBSERVABILITY: the caller pressed Stop and this flush refused to write (the cancellation ruling). A
    // deliberate, correct discard — `info`, not `warn` — but never SILENT: a cancelled round that threw away a
    // finished extraction (`discardedStagedWrites`) is the expensive case and must be countable.
    onStateRoundCancelled: (info) => {
      logger.info(
        {
          event: "rpg.flush.cancelled",
          chatId: info.chatId,
          gameId: info.gameId,
          turnId: info.turnId,
          discardedStagedWrites: info.discardedStagedWrites,
        },
        "rpg flush CANCELLED (the caller aborted the turn) — no snapshot, no journal, no emits",
      );
    },
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
  return { service, chatOps: createRpgChatOps(ctx), importGame: createImportRpgGame(ctx) };
}

/** Read the chat's per-chat routing overlay (`metadata.providerRouting`) as a `RouteChatAssignment` — the SAME
 *  derivation the character turn's `resolveConnection` uses (`compose/chat.ts`). A malformed/absent metadata
 *  degrades to the empty assignment (falls through to the host's role default), never a throw. */
async function readRoutableChat(db: Db, chatId: ChatId): Promise<RouteChatAssignment> {
  const rows = await db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId)).limit(1);
  const meta = parseChatMetadata(rows.at(0)?.metadata ?? null);
  return meta.providerRouting !== undefined ? { providerRouting: meta.providerRouting } : {};
}

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
function buildResolveStateDelivery(deps: RpgComposeDeps): RpgContext["resolveStateDelivery"] {
  // Nothing resolved ⇒ no model write path AND no fold — the fail-closed verdict every degraded arm returns.
  const closed = { trackersReadOnly: true, foldGuarded: true, canPopulate: false };
  return async (chatId) => {
    const game = await findGameByChat(deps.db, chatId);
    if (game === undefined) {
      return closed; // no game — the verb caller resolves game-ness itself; a defensive readonly is harmless
    }
    const hostUserId = await deps.rpgChatOps.resolveHostUserId(chatId);
    if (hostUserId === null) {
      return closed;
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
        return closed;
      }
      throw err;
    }
    return {
      trackersReadOnly: deriveTrackersReadOnly(game.config.extractionMode, conn.capability),
      foldGuarded: !coEmitsProseWithTools(conn.capability),
      canPopulate: hasStructuredWriter(conn.capability),
    };
  };
}
