// Chat domain's slice of the composition root: wires the widest DI bundle in the system (ChatContext +
// ChatServiceDeps). Owns no business logic.
//
// Identity impedance: chat's cross-feature ops are keyed by the frozen host `UserId` (the host may be
// offline, so no request Principal exists). Two bridges: role-irrelevant ops use the cheap synthetic
// `hostPrincipal`; role-sensitive ops (owner-gates) use the injected `resolveHostPrincipal`.

import { setTimeout as sleep } from "node:timers/promises";
import type { DurableChatBusEvent, LiveOnlyChatBusEvent, VariablePrecondition, VariableWriteResult } from "@orb/contracts/chat";
import { resolveRenderPolicy, SIGNUP_INVITES_MINTABLE } from "@orb/contracts/chat";
import type { AuthMode, Can, Principal } from "@orb/contracts/identity";
import { EMBED_SPACE_DIMS } from "@orb/contracts/inference";
import type { ChoiceBlockSpec, PromptConfig, UserIntent, UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { composeProse } from "@orb/contracts/prose";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { characterPersonas, chatParticipants, personas, users } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { ChatDeltaEvent, ChatEvent, ChatRequest, ChatResult, ChatTurnInput, Resolved, RoleClientsWithSignal } from "@orb/inference";
import { NoConnectionError, toChatRequest, unavailableRefusal } from "@orb/inference";
import type { AssetId, ChatId, Handle, PersonaId, PresetId, TypeIdOf, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { resolvePersonaDescriptionPlacement } from "@orb/kit/persona";
import { and, eq, isNull } from "drizzle-orm";
import { isAdmin } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import { createCopyHandoffCards } from "#domain/character";
import type {
  ChatContext,
  ChatService,
  ChatServiceDeps,
  ChatToolOps,
  ChatToolSet,
  GetMembership,
  GetPendingUserText,
  HumanSeatPersona,
  MemoryConfig,
  MemoryEmbedSpace,
  MemoryRecallRecorder,
  MemoryStoreReceipt,
  PostNarratorMessage,
  PresenceReadOp,
  PromptTransformRegistry,
  RequestTurnOp,
  ResolveCanonWindow,
  ResolvedPersonas,
  ResolveForeignInputsOp,
  ResolveRpgCardCorpus,
  ResolveRpgParticipants,
  SetRpgPointer,
  SignupInviteDeps,
  SignupInviteOps,
  SignupMinterCheckOp,
  TurnRequest,
  TurnStreamChunk,
  TurnTrigger,
  TurnVoice,
} from "#domain/chat";
import {
  applyStandaloneVariableOps,
  backfillGroupCharacters,
  backfillMemory,
  createActiveTurns,
  createChatService,
  createChatTeachingContributions,
  createClaimChat,
  createGetMembership,
  createGetPendingUserText,
  createPostNarratorMessage,
  createPromptTransformRegistry,
  createReactAsCharacter,
  createResolveCanonWindow,
  createResolveRpgCardCorpus,
  createResolveRpgParticipants,
  createSetRpgPointer,
  getGroupConfig,
  getRoomOverrides,
} from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { EmbeddingsService } from "#domain/embeddings";
import { createHandoffRestampStatements } from "#domain/embeddings";
import type { ImageryService } from "#domain/imagery";
import type { NotificationsService } from "#domain/notifications";
import type { PersonaService, ResolvePersonasForParticipants } from "#domain/persona";
import { PersonaNotFoundError } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import { PresetNotFoundError } from "#domain/preset";
import type { ResolveRegexSources } from "#domain/regex";
import { createCopyHandoffRegexScripts, createCountHandoffRegexScripts } from "#domain/regex";
import type { SearchService } from "#domain/search";
import type { SessionsService } from "#domain/sessions";
import { createTokenHasher } from "#domain/sessions";
import type { SettingsService } from "#domain/settings";
import { applyStatsDelta, bumpStatsCanonVersion } from "#domain/stats";
import type { ResolvedToolSet, ToolUseService } from "#domain/tool-use";
import { createCopyHandoffBooks, createCountHandoffBooks } from "#domain/world-info";
import type { AuditEntry } from "#foundation/observability";
import { buildAuditStatement, buildAuditStatementIfPrecedingWrote, recordMemoryLog } from "#foundation/observability";
import { createRegexApplyReplace, createRegexTest } from "#kit/regex";
import { publishNotification } from "../../transport/trpc/index.ts";
import { createReactToolDefinition } from "./chat-tools.ts";
import { createChatChangedEmitter } from "./emit-chat-changed.ts";
import { resolveImageRefToUrl } from "./resolve-image-ref.ts";
import { withRetrievalDegrade } from "./retrieval-degrade.ts";

/** Per-chat turn-lock TTL (ms) — auto-expires so a crashed holder's lock is takeover-eligible. */
const CHAT_LOCK_TTL_MS = 120_000;

function minter<P extends string>(prefix: P): () => TypeIdOf<P> {
  return (): TypeIdOf<P> => mintTypeId(prefix);
}

/**
 * THE TRIGGER BINDING — which persona id prompt-config `{{user}}` (the assemble ctx's ACTIVE persona)
 * resolves against on a `trigger`-voice turn (an impersonate draft — see {@link voicePersonaFor}), dispatched
 * exhaustively over {@link TurnTrigger} (Chat-Macro-Resolution §3–§4; the union's own doc carries the arm
 * semantics). PURE; exported for its unit pin only — not a composition surface.
 *
 *   • `human`  → THAT human's persona ("who's speaking right now", §A.1), and `null` when their seat holds
 *     none — the kit floor, NEVER the anchor. Borrowing the anchor here is INVITE-JOIN-NULL-PERSONA: it
 *     hands a member the host's identity on the wire.
 *   • `none` (deferred drain / auto turn) → the chat ANCHOR. The anchor is the chat-invariant identity (D51
 *     rider); binding to `personaIds[0]` instead would address the prompt to a presence-order-arbitrary
 *     bystander, and falling to the kit floor would address `DEFAULT_PERSONA_NAME` in a room whose `{{user}}` is well-defined.
 *
 * THERE IS NO ABSENT ARM (owner ruling, 2026-08-07 — the `personaIds[0]` fallback is RETIRED). It used to
 * exist for trigger-less contexts (previews, host instruments) and bound `{{user}}` to "whoever joined
 * first" — presence-order-arbitrary, nondeterministic across a join, and on a host instrument a cross-member
 * read. Every caller now states its arm, and `trigger` is REQUIRED rather than loud-at-runtime: a caller that
 * genuinely has no triggering human passes `{kind:"none"}` (⇒ the anchor, the chat-invariant identity), which
 * is what a preview wanted all along. The enforcement ladder prefers unrepresentable over thrown (§2.2).
 *
 * Returning an ID (not a resolved persona) is deliberate: the anchor arm then resolves through the SAME
 * participants read as every other arm, so `active === anchor` is byte-identical to the anchor projection and the
 * `sameProjectedPersona` dedup keeps holding.
 */
export function activePersonaIdFor(args: { readonly trigger: TurnTrigger; readonly anchorPersonaId: PersonaId | null }): PersonaId | null {
  const trigger = args.trigger;
  switch (trigger.kind) {
    case "human":
      return trigger.personaId;
    case "none":
      return args.anchorPersonaId;
    default:
      return assertNeverTrigger(trigger);
  }
}

function assertNeverTrigger(trigger: never): never {
  throw new Error(`activePersonaIdFor: unhandled TurnTrigger ${JSON.stringify(trigger)}`);
}

/**
 * THE VOICE BINDING (D122 as amended) — which persona id prompt-config `{{user}}` resolves against, and whose
 * persona it is. PURE; exported for its unit pin.
 *
 *   • `anchor` (every canon turn) → the anchor HUMAN's current seat persona. The anchor human owns the anchor
 *     persona when it resolved under the consent gate, else the frozen host. Who pressed send never enters, so
 *     the system block and every history label are byte-identical across senders. A mid-chat persona swap
 *     still splits the two personas: the card keeps the anchor persona, the preset follows the seat. An empty
 *     seat falls back to the anchor persona its human owns, never to another human's.
 *   • `trigger` (an impersonate draft, the presser's own next line) → {@link activePersonaIdFor}.
 */
export function voicePersonaFor(args: {
  readonly voice: TurnVoice;
  readonly trigger: TurnTrigger;
  readonly anchorPersonaId: PersonaId | null;
  readonly anchorOwnerId: UserId | null;
  readonly runAsUserId: UserId;
  readonly humanSeats: readonly HumanSeatPersona[];
}): { readonly personaId: PersonaId | null; readonly userId: UserId } {
  const anchorHuman = args.anchorOwnerId ?? args.runAsUserId;
  const voice = args.voice;
  switch (voice) {
    case "anchor": {
      // An anchor human whose seat holds no persona speaks as the anchor persona they own; with no resolved
      // anchor the frozen host's empty seat is the honest kit floor.
      const seatPersonaId = args.humanSeats.find((seat) => seat.userId === anchorHuman)?.personaId ?? null;
      return { personaId: seatPersonaId ?? (args.anchorOwnerId === null ? null : args.anchorPersonaId), userId: anchorHuman };
    }
    case "trigger":
      return {
        personaId: activePersonaIdFor({ trigger: args.trigger, anchorPersonaId: args.anchorPersonaId }),
        userId: args.trigger.kind === "human" ? args.trigger.userId : anchorHuman,
      };
    default:
      return assertNeverVoice(voice);
  }
}

function assertNeverVoice(voice: never): never {
  throw new Error(`voicePersonaFor: unhandled TurnVoice ${JSON.stringify(voice)}`);
}

/** The persona half of the FOREIGN read: one consent-gated persona read over the anchor, the trigger's persona
 *  and every seat persona, then {@link voicePersonaFor}. Every other seat's resolved persona projects into
 *  `people` in seat order, so the block moves only on a join, a leave, a swap or a re-anchor. Personas are
 *  single-owned and `setActivePersona` seats only the target's own, so no two seats hold one persona. The
 *  composition root's `resolveForeignInputs` is its one production caller. */
export function createTurnPersonaResolver(
  resolvePersonasForParticipants: ResolvePersonasForParticipants,
): (
  args: Pick<Parameters<ResolveForeignInputsOp>[0], "anchorPersonaId" | "humanSeats" | "presentHumanUserIds" | "runAsUserId" | "trigger" | "voice">,
) => Promise<ResolvedPersonas> {
  return async (args) => {
    const triggerPersonaId = args.trigger.kind === "human" ? args.trigger.personaId : null;
    const resolved = await resolvePersonasForParticipants({
      personaIds: [args.anchorPersonaId, triggerPersonaId, ...args.humanSeats.map((seat) => seat.personaId)].flatMap((id) => (id === null ? [] : [id])),
      allowedOwnerIds: args.presentHumanUserIds,
    });
    const project = (personaId: PersonaId | null): ResolvedPersonas["active"] => {
      const p = personaId === null ? undefined : resolved.get(personaId);
      return p === undefined ? null : { name: p.name, description: p.description, placement: resolvePersonaDescriptionPlacement(p.metadata) };
    };
    const anchorOwnerId = args.anchorPersonaId === null ? null : (resolved.get(args.anchorPersonaId)?.ownerId ?? null);
    const voice = voicePersonaFor({ ...args, anchorOwnerId });
    const people = args.humanSeats.flatMap((seat) => {
      const persona = seat.userId === voice.userId ? null : project(seat.personaId);
      return persona === null ? [] : [persona];
    });
    return {
      anchor: project(args.anchorPersonaId),
      active: project(voice.personaId),
      activeUserId: voice.userId,
      ...(people.length > 0 ? { people } : {}),
    };
  };
}

/** D259 — the minter re-check a signup redeem runs before its batch: the live row must be enabled, and its
 *  row-derived Principal (invariant 1) must pass the same global-admin `can()` the mint asked. */
export function createSignupMinterCheck(
  sessions: Pick<SessionsService, "loadUserById">,
  resolvePrincipal: (userId: UserId) => Promise<Principal>,
): SignupMinterCheckOp {
  return async (minterUserId) => {
    const row = await sessions.loadUserById(minterUserId);
    return row !== null && row.enabled && isAdmin(await resolvePrincipal(minterUserId));
  };
}

/** What `buildChatService` needs from the composition root — boot primitives + the already-built sibling
 *  services chat's injected ops route through (their front doors only). */
export interface ChatComposeInput {
  /** Optional — absent wires `ChatContext.tools` to null (byte-identical no-op). */
  readonly toolUse?: ToolUseService | undefined;
  readonly db: Db;
  readonly now: () => number;
  /** The one chat bus's durable-first emit, built at the composition root and injected so chat doesn't
   *  construct a second bus. The same wrapper backs persona's active-persona write. */
  readonly emitChatEvent: (event: DurableChatBusEvent) => Promise<void>;
  /** The same emit with the durable append verdict retained for resumable host-handoff completion. */
  readonly emitChatEventChecked: ChatServiceDeps["emitChecked"];
  /** The chat bus's prepared birth-event seam: statement joins room creation; callback fans after commit. */
  readonly prepareChatCreationEvent: ChatServiceDeps["prepareCreationEvent"];
  /** The same bus's LIVE-ONLY fan (no `chat_events` append). Chat's one consumer is `chatDeleted`, whose
   *  durable row cascades away with the chat it announces — see the lifecycle verbs' DELETE-FIRST header. */
  readonly emitChatEventLive: (event: LiveOnlyChatBusEvent) => void;
  /** The lock-holder tag for this replica (also used by the boot lock reclaim). */
  readonly holder: string;
  readonly sessionSecret: string | null;
  /** The frozen-host → `Principal` bridge for role-sensitive ops. */
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly can: Can;
  /** D121-E: the regex domain's four-scope resolve op (the host-tier sources a turn assembles against). */
  readonly resolveRegexSources: ResolveRegexSources;
  /** The per-FUNDER role-client binder (§8.5b): every chat-side side call — arbiter, digests, extract-quiet —
   *  spends the TRIGGER's rows; the vector writes and reads use the room HOST's (vector tasks are owner-scoped). */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<RoleClientsWithSignal>;
  readonly connection: Pick<ConnectionService, "resolve" | "availability">;
  /** The post-generation credential STRIKE-OUT (#1373) — the credentials domain's verb, wired DIRECT. */
  readonly maybeRevokeOnAuthFailed: ChatContext["maybeRevokeOnAuthFailed"];
  readonly character: CharacterService;
  readonly persona: PersonaService;
  /** The persona domain's PRINCIPAL-LESS participants op (`domain/persona/contract/ops.ts`) — the ONE room-plane
   *  persona read the FOREIGN-inputs resolver uses. Separate from `persona` because `PersonaService` is
   *  Principal-scoped by contract, and a room's assembly has no single Principal to read as (D106). */
  readonly resolvePersonasForParticipants: ResolvePersonasForParticipants;
  readonly preset: PresetService;
  readonly settings: SettingsService;
  readonly notifications: NotificationsService;
  readonly resolveHandle: (handle: Handle) => Promise<UserId | null>;
  /** D259 — the live `AUTH_MODE`: it picks whether invites may create accounts and stamps every invite. */
  readonly authMode: AuthMode;
  /** D259 — the foreign halves of the signup batch, all built at the root: the sessions account statement, the
   *  persona statement, the settings pointer statement, and the minter's standing check. */
  readonly signup: Pick<SignupInviteDeps, "signupUserStatement" | "signupPersonaStatement" | "signupPersonaPointersStatement" | "minterMayMintSignup">;

  readonly search: SearchService;
  readonly embeddings: EmbeddingsService;
  /** #250 — the memory-recall flight recorder built at the composition root; its `sink` becomes
   *  `ChatContext.recordRecall` so every `{{memory}}` recall lands in the ring `/api/_debug/memory/recalls`
   *  tails. OPTIONAL: absent ⇒ nothing records (an int test that builds chat without the recorder), and recall
   *  is byte-identical either way. */
  readonly recallRecorder?: MemoryRecallRecorder | undefined;
  /** The databank `{{databank}}`-slot GATHER op (DB6) — OPTIONAL; absent wires `ChatContext.gatherDatabank`
   *  to undefined (byte-identical no-op). Bridged from `databank.gatherRetrieval` at the composition root. */
  readonly gatherDatabank?: ChatContext["gatherDatabank"];
  /** The compose-tier executor FENCE (§7.5-1a): chat receives exactly the bound `runChatTurn`. */
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  /** The deployment's Anthropic prompt-cache depth FLOOR, read per turn off the resolved AppSettings tier
   *  (`EffectiveAppConfig.promptCacheMinDepth`, Settings › Admin › System tuning). A thunk, not a value, so an
   *  admin flip reaches the next turn without a restart. Absent ⇒ the floor 0 (byte-identical no-op). */
  readonly promptCacheMinDepth?: () => number;
  readonly assets: AssetsService;
  /** Materialize a user-pasted external carried-background URL into an owned CAS asset (side-eye F-P0-2) — the
   *  shared compose-built op the `setChatBackground` verb runs for a `kind:"external"` source. */
  readonly materializeBackground: MaterializeBackgroundOp;
  /** §6.7's inline-reply picture store, built at the keystone (it needs the boot-level per-image byte cap) —
   *  the `materializeBackground` precedent one line up. */
  readonly storeInlineReplyImage: ChatContext["storeInlineReplyImage"];
  readonly readPresence: PresenceReadOp;
  /** imagery's orchestrator → chat's `generatePicture` op (mapped to the chat-local structural result below). */
  readonly generatePicture: ImageryService["generatePicture"];
  /** The expressions post-turn classify hook (E3 — docs/plans/expressions/design.md) — OPTIONAL; absent wires
   *  `ChatContext.expressions` to null (byte-identical no-op). Bridged from `expressions.onTurnCompleted`. */
  readonly expressions?: ChatContext["expressions"];
  /** The injected rpg turn ops (docs/plans/rpg/design.md) — OPTIONAL; absent wires `ChatContext.rpg` to null
   *  (byte-identical no-op). Built at the composition root over the rpg service + its standalone gather op. */
  readonly rpg?: ChatContext["rpg"] | undefined;
  /** FOREIGN S2 teaching contributions — OPTIONAL; absent wires the
   *  registry to chat's own contribution alone (byte-identical no-op, the `rpg`/`expressions` precedent).
   *  Chat's own contributor is ALWAYS present, which is why the ctx field itself is not nullable. */
  readonly teaching?: ChatContext["teaching"] | undefined;
  /** The per-turn PLUGIN-MACRO resolve — OPTIONAL; absent wires
   *  `ChatContext.pluginMacros` to null (byte-identical no-op, the `rpg`/`expressions` precedent). Minted at the
   *  composition root as the plugin-macro registry's `resolveForTurn`, so chat and the plugin plane share ONE
   *  registry without either importing the other. */
  readonly pluginMacros?: ChatContext["pluginMacros"] | undefined;
}

/** The chat compose product: the service + the bus's durable-first emit, surfaced for other producers that
 *  publish onto the chat bus (e.g. world-info). */
export interface ChatComposeResult {
  readonly service: ChatService;
  readonly emitBusEvent: (event: DurableChatBusEvent) => Promise<void>;
  /** The generic, principal-free chat ops domain/rpg receives by injection — built over chat's own
   *  ctx here (chat never learns rpg). Wired onto `RpgContext.chat` at the rpg compose block. */
  readonly rpgChatOps: {
    readonly getMembership: GetMembership;
    readonly postNarratorMessage: PostNarratorMessage;
    readonly getPendingUserText: GetPendingUserText;
    /** The opaque pointer write — `createGame` calls it once. */
    readonly setRpgPointer: SetRpgPointer;
    /** The roster projection — the tracker view's roster ∪ sheets source. */
    readonly resolveRpgParticipants: ResolveRpgParticipants;
    /** The chat's PRESENT host userId (role='host', D19) — the human the rpg resync resolves its
     *  connection/creds under + the capability verdict keys on. Resolved by ROLE, never join order (a handoff
     *  swaps roles in place — the first-joined human is NOT the host). `null` = a hostless/stale room. */
    readonly resolveHostUserId: (chatId: ChatId) => Promise<UserId | null>;
    /** The DEEP canon-window read (crunchy-cluster §1.3) — the `resyncFromStory` host verb's story feed, sharing
     *  the engine's transcript projection (chat owns canon reads; rpg reads no chat table). */
    readonly resolveCanonWindow: ResolveCanonWindow;
    /** The BORN-STATE corpus read (the host `populateFromCharacter` round): one roster character's card prose
     *  + the room's opening line (chat owns the card + canon reads; rpg reads no table). */
    readonly resolveCardCorpus: ResolveRpgCardCorpus;
    /** The chat's ACTIVE-preset user macros (WAVE MU) — the same resolution the picks pane reads, so the GM
     *  console's shadow gloss names the exact defs a game macro would shadow (chat owns preset resolution for
     *  a chat; rpg re-deriving it would be a second home for the rule). */
    readonly resolvePromptUserMacros: (chatId: ChatId) => Promise<readonly UserMacroSpec[]>;
    /** The chat's GM-PRESET prose overrides (PROSE-1 S4) — what the two rpg HOST DOORS (`resyncFromStory`,
     *  `populateFromCharacter`) resolve their extraction prose through. Chat owns preset resolution AND the
     *  GM-voice redirect; rpg reads no preset table, and re-deriving either here would be a second home for
     *  both rules.
     *
     *  TWO ARMS, TWO INVOCATION CLASSES — that difference is why this is not a duplicate of the turn path and
     *  must not be "unified" with it. A post-commit state ROUND rides the CAPTURED view its own turn already
     *  resolved (`RpgTurnContext.prose`): it runs AFTER that turn's prompt was assembled, so a second
     *  resolution moment there could disagree with the very prompt it is extracting from — a divergence by
     *  construction, ruled out. A VERB DOOR has no first resolution to diverge from; the consenting human
     *  clicked a button and this IS the moment, exactly as `resolvePromptUserMacros` is for the picks pane. */
    readonly resolveChatPresetProse: (chatId: ChatId) => Promise<ProseOverrides>;
  };
  /** The D50 PromptTransform registrar — surfaced so automation's rule lifecycle
   *  + the plugin host `register`/`unregister` their `transform_draft` transforms onto the same list the
   *  turn pipeline applies. Zero registrants today (byte-identical no-op). */
  readonly promptTransforms: PromptTransformRegistry;
  /** The standalone (out-of-turn) runtime-variable write, bound over chat's own
   *  ctx — automation's `set_variable` chat-scope arm injects this at the composition root (chat learns
   *  nothing automation-shaped; principal-free — the author's authority was gated upstream). */
  readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[], expect?: readonly VariablePrecondition[]) => Promise<VariableWriteResult>;
  /** The room HOST's app-tier prose overrides for a chat (PROSE-1 §4.3, owner-decision 8 option (a)) —
   *  surfaced so automation's `set_chat_background` quiet pick reads the SAME host prose the room's other
   *  side generations do, instead of re-deriving the host itself. */
  readonly resolveChatProse: (chatId: ChatId) => Promise<ProseOverrides>;
  /** The NON-HUMAN turn seam — automation's `trigger_turn` arm + the
   *  Tier-2 plugin membrane's `turn.trigger` inject this at the composition root. Principal-free: the funding
   *  host is resolved from the room, and the four walls (depth/authority/budget/consent) enforce inside the verb
   *  + the engine belts. See {@link RequestTurnOp}. */
  readonly requestTurn: RequestTurnOp;
  /** Is memory ON for this host (#156)? The admission gate's read, resolved through the SAME
   *  `resolveMemoryConfig` merge the live turn and the corpus sweep use, so the gate cannot drift from the
   *  per-host skip it exists to pre-empt. */
  readonly isMemoryEnabled: (hostUserId: UserId) => Promise<boolean>;
  /** D259 — the signup-invite ops the entry signup route runs, built over chat's own ctx. */
  readonly signupInvites: SignupInviteOps;
  /** Chat's corpus sweeps, bound over the chat ctx. */
  readonly backfill: {
    readonly memory: (args: { signal: AbortSignal; ownerId?: UserId | null; funderUserId: UserId }) => ReturnType<typeof backfillMemory>;
    readonly groupCharacters: (args: { signal: AbortSignal; ownerId?: UserId | null; funderUserId: UserId }) => ReturnType<typeof backfillGroupCharacters>;
  };
}

type EmbeddingSegmentRow = Parameters<EmbeddingsService["storeSegments"]>[0][number];

function memorySegmentReceipts(rows: readonly EmbeddingSegmentRow[], results: Awaited<ReturnType<EmbeddingsService["storeSegments"]>>): MemoryStoreReceipt[] {
  const receipts: MemoryStoreReceipt[] = [];
  for (const [index, result] of results.entries()) {
    const row = rows[index];
    if (row === undefined) {
      throw new Error("embeddings.storeSegments returned more results than inputs");
    }
    if (result.generationId === undefined || result.generationEpoch === undefined) {
      throw new Error("embeddings store omitted its generation receipt");
    }
    receipts.push({ ownerId: row.ownerId, model: result.model, generationId: result.generationId, generationEpoch: result.generationEpoch });
  }
  if (receipts.length !== rows.length) {
    throw new Error("embeddings.storeSegments returned fewer results than inputs");
  }
  return receipts;
}

/**
 * Adapt {@link ToolUseService} into the `ChatToolOps` seam. Chat's opaque `ChatToolSet` IS the
 * `ResolvedToolSet` this seam minted; the exec frame's `runAsUserId` resolves to the live host
 * {@link Principal} here (the engine itself stays Principal-blind).
 *
 * D152: an in-turn tool therefore executes under the HOST Principal — there is no per-speaker authority
 * swap at this seam, so attaching a mutating tool to a non-human speak turn is zero-human host authority.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function buildChatToolOps(toolUse: ToolUseService, resolveHostPrincipal: (userId: UserId) => Promise<Principal>): ChatToolOps {
  // biome-ignore lint/suspicious/noExplicitAny: the opaque ChatToolSet round-trip (see the header note).
  const asResolvedSet = (set: ChatToolSet): ResolvedToolSet => set as any as ResolvedToolSet;
  return {
    resolveTools: (driverUserId, names) => toolUse.resolveTools(driverUserId, names),
    toToolDefinitions: (set) => toolUse.toToolDefinitions(asResolvedSet(set)),
    // The host Principal is resolved ONCE per turn, here, before the request is built — a failed lookup fails
    // the turn on every wire instead of surfacing inside an SDK-driven tool handler as text the model reads.
    prepareExecution: async (set, frame) => {
      const exec = {
        principal: await resolveHostPrincipal(frame.runAsUserId),
        triggeredBy: frame.triggeredBy,
        chatId: frame.chatId,
        membership: frame.membership,
        turnId: frame.turnId,
        ...(frame.signal !== undefined ? { signal: frame.signal } : {}),
      };
      const resolved = asResolvedSet(set);
      return (calls) => toolUse.executeToolCalls(resolved, calls, exec);
    },
  };
}

/** The runner's `ChatResult.events` → the domain stream's out-of-band chunks (D41 no-silent-degrade, the READ
 *  end). The bridge CARRIES the infra codes; it does not translate them — chat owns its bus vocabulary, so the
 *  infra→`ChatWarningCode` narrowing lives in the domain (`engine.ts` `toChatWarning`), the mirror of the
 *  IMAGE role's hop where compose hands the domain a narrowed infra code and
 *  `domain/chat/verbs/generate-image.ts` does the re-map. Deduped here because one runner can repeat a code
 *  within a single result; the pipeline dedupes again across recursion depths.
 *  Extracted so the bridge body stays under the cognitive-complexity cap.
 *
 *  TWO event kinds cross, not one. `refusal` rides as its OWN chunk kind because it is not a degrade of our
 *  settings but the model's verdict on the request; it collapses to a single chunk for the same reason the
 *  warnings dedupe (a result can carry more than one), and it crosses PAYLOAD-FREE — the provider's
 *  `category`/`explanation`/`fallbackModel` are raw strings the chat bus may not carry, and they stay on
 *  `ChatResult.events` for the wire-outcome ring.
 *
 *  WHAT DELIBERATELY DOES NOT CROSS: `rate_limit`. It is an OPERATOR signal about the account's remaining
 *  headroom, not a fact about this reply — the turn succeeded — and its payload is raw provider strings. It
 *  has a home already (the `provider.rate_limit` log line beside the emit, and the event on `ChatResult`);
 *  telling every member of a room that the host is at 80% of a rate limit mid-story is noise, not honesty.
 *  Same for `compaction`/`api_retry`/`status`/`auth_status`/`model_downgrade`/`permission_leak`: diagnostics
 *  with no user decision behind them. If one ever earns a room-public surface it needs its own bus member and
 *  its own ruling, not a quiet addition here. */
function outOfBandChunks(events: readonly ChatEvent[]): TurnStreamChunk[] {
  const seen = new Map<string, TurnStreamChunk>();
  let refused = false;
  for (const event of events) {
    if (event.kind === "refusal") {
      refused = true;
    }
    if (event.kind === "warning") {
      const { kind: _kind, at: _at, ...warning } = event;
      // KEYED ON THE WHOLE WARNING, not on the code alone (#1440): with the drop's structured half carried
      // through, two DIFFERENT dropped knobs share the `sampling_knob_dropped` code and are two distinct
      // degrades — a code-keyed dedupe would silently pick one and lie about the other. Identical repeats
      // (the same runner re-raising the same drop) still collapse to one.
      seen.set(JSON.stringify(warning), { kind: "warning", ...warning });
    }
  }
  return refused ? [...seen.values(), { kind: "refusal" }] : [...seen.values()];
}

/** The domain {@link TurnRequest} → the BACKEND-NEUTRAL {@link ChatTurnInput}. No wire branch lives here: how
 *  the history and the tools reach a backend (Agent SDK seed frames + an MCP server, or a history array + a
 *  `tools[]` declaration) is `@orb/inference`'s `toChatRequest` (D177). What
 *  stays is this seam's own concern — the deployment's cache-depth FLOOR, layered onto SHAPE's depth. */
function chatTurnInputOf(args: {
  readonly req: TurnRequest;
  readonly onDelta: (delta: ChatDeltaEvent) => void;
  readonly promptCacheMinDepth: number;
}): ChatTurnInput {
  const { req, onDelta } = args;
  return {
    // The WHOLE resolved connection rides the request (§8.4-3): provider row, credential, folded features,
    // extras and capability — the runtime picks the wire off it; nothing here re-derives a routing fact.
    connection: req.connection,
    params: req.intent,
    systemPrompt: { static: req.prompt.static, dynamic: req.prompt.dynamic },
    // Carried so the wire-capture sink keys the recorded body by chat (the debug endpoint's `chatId` filter),
    // and so the stateful backend keys its resume cache by it.
    chatId: req.chatId,
    history: req.history,
    // The cache breakpoint DEPTH (role switches from the end — `backends/kit/cache-control.ts` owns the axis).
    // SHAPE computes the turn's MINIMUM SAFE depth and returns nothing at all when the stable prefix is
    // disrupted; the admin knob is a FLOOR layered on top, so it can only push the breakpoint DEEPER (more of
    // the tail kept volatile), never shallower — a shallower breakpoint pins bytes that change every turn, which
    // is a guaranteed wasted cache write, not a preference. SHAPE's abort therefore stays absolute: no safe depth
    // ⇒ no breakpoint, whatever the knob says.
    cacheBreakpointDepth: req.cacheBreakpointFromEnd === null ? undefined : Math.max(req.cacheBreakpointFromEnd, args.promptCacheMinDepth),
    ...(req.tools !== undefined ? { tools: req.tools } : {}),
    ...(req.responseFormat !== undefined ? { responseFormat: req.responseFormat } : {}),
    ...(req.reasoningTags !== undefined ? { reasoningTags: req.reasoningTags } : {}),
    onDelta,
    signal: req.signal,
  };
}

/** The terminal `final` chunk: the infra {@link ChatResult} folded onto the domain's committed economics. */
function finalTurnChunk(req: TurnRequest, result: ChatResult): TurnStreamChunk {
  return {
    kind: "final",
    economics: {
      content: result.reply,
      reasoning: result.reasoning || null,
      model: req.connection.model,
      // ATTRIBUTION (§5.3b): the provider REGISTRY id and the connection row that generated this swipe —
      // denormalised on purpose so a read outlives an edited or deleted connection.
      provider: req.connection.provider.id,
      connectionId: req.connection.connectionId,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      reasoningTokens: result.usage.reasoningTokens,
      contextWindow: result.usage.contextWindow,
      costUsd: result.usage.costUsd,
      costProvenance: result.usage.costProvenance,
      costDetails: result.usage.costDetails,
      // The replayable reasoning blocks (A1) — stored on the variant; the assembly reads them back.
      reasoningParts: result.reasoningParts ?? null,
      maxOutputTokens: result.usage.maxOutputTokens,
      // The provider's per-turn MODEL-CALL count, renamed across the seam (`numTurns` → `modelCalls`)
      // because "turn" already means a CHAT turn on this side. It is what makes `tokensOut` (a sum
      // over the calls) legible against `maxOutputTokens` (a per-call ceiling).
      modelCalls: result.numTurns,
      // The APPLIED effort the wire reported (inference audit B1) — never `req.intent.effort`, which a transport may
      // have dropped or a mandatory clamp raised; the requested value already rides `params`.
      reasoningEffort: result.appliedEffort,
      ttftMs: result.ttftMs,
      finishReason: result.finishReason,
      stopReason: result.stopReason,
      terminalReason: result.terminalReason,
      generationId: result.generationId ?? null,
      // §5.3c class 3 — the per-provider sidecar, already NARROWED by the runtime to the closed union
      // (`backends/kit/provider-metadata.ts`). This seam carries it and decides nothing about its shape: the
      // per-vendor spelling is backend knowledge, and re-deriving it here would put provider shape above the
      // package boundary. Absent on a provider with no first-party arm.
      ...(result.providerMetadata !== undefined ? { providerMetadata: result.providerMetadata } : {}),
      ...(result.toolCalls !== undefined ? { toolCalls: result.toolCalls } : {}),
      // §6.7: the pictures a modalities-capable chat model emitted inside this completion, forwarded RAW.
      // The engine owns materialize + CAS store (the bytes must land under the room HOST, which this seam
      // does not know) and the span emission; carrying them is all this bridge may honestly do.
      ...(result.images !== undefined ? { replyImages: result.images } : {}),
      // §8.8: the depth's replayable thinking, carried across the seam so the engine's tool loop can hand it
      // back on the next leg. The wire produced them honestly (never gated on the carry knob) — WHETHER they
      // ride back is the pipeline's decision, off the one funnel answer.
      ...(result.reasoningParts !== undefined ? { reasoningParts: result.reasoningParts } : {}),
    },
  };
}

/** A PUSH→PULL adapter: the infra runner reports progress by callback (`onDelta`) and completion by promise,
 *  while the chat role consumes an AsyncIterable. The pump buffers pushed chunks and parks the consumer on a
 *  one-shot arrival promise while the buffer is empty, so no delta is dropped between two `next()` calls and a
 *  slow consumer never blocks the producer. `fail` is terminal and rethrows into the consumer AFTER the
 *  already-buffered chunks drain (a mid-stream failure must not swallow the text the user already saw). */
function createChunkPump<T>(): {
  readonly push: (...chunks: readonly T[]) => void;
  readonly close: () => void;
  readonly fail: (err: unknown) => void;
  readonly drain: () => AsyncGenerator<T>;
} {
  const queue: T[] = [];
  let done = false;
  // BOXED, not a bare `unknown`: a rejection value is compared for PRESENCE, and `null`/`undefined` are
  // legal rejection values. The box makes "a failure was recorded" a different question from "the failure
  // is truthy" — the pre-extraction inline pump answered the second and silently ended the stream instead
  // of rethrowing when a runner rejected with a nullish value.
  let failure: { readonly err: unknown } | null = null;
  let notify: (() => void) | null = null;
  const wake = (): void => {
    notify?.();
    notify = null;
  };
  const push = (...chunks: readonly T[]): void => {
    queue.push(...chunks);
    wake();
  };
  const close = (): void => {
    done = true;
    wake();
  };
  const fail = (err: unknown): void => {
    failure = { err };
    done = true;
    wake();
  };
  async function* drain(): AsyncGenerator<T> {
    for (;;) {
      if (queue.length > 0) {
        yield queue.shift() as T;
        continue;
      }
      if (done) {
        if (failure !== null) {
          throw failure.err;
        }
        return;
      }
      const arrival = Promise.withResolvers<void>();
      notify = arrival.resolve;
      await arrival.promise;
    }
  }
  return { push, close, fail, drain };
}

/** The domain→infra turn bridge: maps a domain {@link TurnRequest} to the neutral turn and through `toChatRequest`
 *  to the infra {@link ChatRequest} (the per-wire delivery of history and tools is inference's; this seam adds the
 *  admin cache-depth floor), runs it through the injected infra `runChatTurn`, and adapts its
 *  Promise+onDelta shape back onto the chat role's streaming AsyncIterable. Extracted so the four-layer
 *  fidelity harness drives THIS real mapping (injecting only the leaf infra surface), not a facsimile. */
export function createRunChatTurnBridge(deps: {
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  /** The deployment's prompt-cache depth FLOOR (`AppSettings.promptCacheMinDepth`, Settings › Admin › System
   *  tuning) — read PER TURN so an admin flip governs the next request with no restart (the D126 thunk
   *  precedent). Optional: absent reads as the born-in-DB floor 0, which is `Math.max`'s identity, so a
   *  harness that omits it produces byte-identical wire bodies. */
  readonly promptCacheMinDepth?: () => number;
}): (req: TurnRequest) => AsyncIterable<TurnStreamChunk> {
  return async function* runChatTurn(req: TurnRequest): AsyncIterable<TurnStreamChunk> {
    const pump = createChunkPump<TurnStreamChunk>();
    const onDelta = (delta: ChatDeltaEvent): void => {
      pump.push({ kind: delta.kind, text: delta.text });
    };

    // The wire SHAPE is `@orb/inference`'s to decide off the connection's own `api` (validated ∈ the provider's
    // `apis` on write and at resolve, §7.3) — including the refusal of a chat row with no chat api.
    const chatReq = toChatRequest(chatTurnInputOf({ req, onDelta, promptCacheMinDepth: deps.promptCacheMinDepth?.() ?? 0 }));

    // @orb-waive caught-failure-ownership(runChatTurn): propagated — the rejection reaches
    // `pump.fail(err)` in the `.catch` below, which the consuming `yield* pump.drain()` surfaces to the
    // caller; never swallowed. Ends if `pump.fail` stops being read by the drain.
    void deps
      .runChatTurn(chatReq)
      .then((result) => {
        // BEFORE the terminal `final` (which ends the drain): the turn's honest-degrade warnings. Without this
        // the runner's `events` died at this seam and D41 held only in the logs, never in the product.
        pump.push(...outOfBandChunks(result.events), finalTurnChunk(req, result));
        pump.close();
      })
      .catch((err: unknown) => {
        pump.fail(err);
      });

    yield* pump.drain();
  };
}

/** The two model-window FACTS memory reads off the funder's role clients (§7.5-1b): the summarize model's window
 *  sizes the digest token guard; the embed model's input cap bounds a segment. A task with no window is
 *  `NoConnectionError` — the honest refusal, never a default window.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function createTaskWindowReaders(deps: {
  readonly roleClientsFor: (funderUserId: UserId) => Promise<Pick<RoleClientsWithSignal, "resolved">>;
  readonly availability: ConnectionService["availability"];
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
}): { readonly summarize: (funderUserId: UserId) => Promise<number>; readonly embed: (funderUserId: UserId) => Promise<number> } {
  // `resolved()` reads null for every reason the task cannot run; the availability verdict names the first one,
  // so the funder is told what to fix instead of always "nothing is bound".
  const refusalFor = async (funderUserId: UserId, task: "summarize" | "embed"): Promise<NoConnectionError> => {
    const verdict = await deps.availability({ task, principal: await deps.resolveHostPrincipal(funderUserId) });
    return unavailableRefusal(task, verdict.available ? "no-connection" : verdict.cause);
  };
  return {
    summarize: async (funderUserId): Promise<number> => {
      const resolved = await (await deps.roleClientsFor(funderUserId)).resolved("summarize");
      if (resolved === null) {
        throw await refusalFor(funderUserId, "summarize");
      }
      if (resolved.capability.kind !== "generation") {
        throw unavailableRefusal("summarize", "requirement-unmet");
      }
      return resolved.capability.generation.context.window;
    },
    embed: async (funderUserId): Promise<number> => {
      const resolved = await (await deps.roleClientsFor(funderUserId)).resolved("embed");
      if (resolved === null) {
        throw await refusalFor(funderUserId, "embed");
      }
      if (resolved.capability.kind !== "embedding") {
        throw unavailableRefusal("embed", "requirement-unmet");
      }
      return resolved.capability.embedding.maxInputTokens;
    },
  };
}

/**
 * Construct the chat `ChatService` + its bus, wiring every {@link ChatContext} op + {@link ChatServiceDeps}
 * collaborator. Returns the service AND the bus emit.
 */
export function buildChatService(input: ChatComposeInput): ChatComposeResult {
  const { db, now, emitChatEvent } = input;

  // Role-irrelevant ops (getCard/persona.get/mint) use this cheap synthetic principal to avoid a per-call read.
  // @orb-waive one-principal-mint-population(Principal): synthetic role-irrelevant principal for frozen-host reads; ends when a shared factory replaces it
  const hostPrincipal = (userId: UserId): Principal => ({
    userId,
    role: "user",
    handle: castId<Handle>(userId),
    externalId: null,
    via: "fallback",
  });

  // Role-sensitive ops need the host's REAL role — a fabricated `role:"user"` would fail-closed-deny an
  // owner's own privileged turn, so this read is injected rather than faked.
  const realHostPrincipal = input.resolveHostPrincipal;

  // THE FUNDER'S connection (§8.4-3): `funderUserId` selects the WHOLE connection — provider, model, credential,
  // declared capability — through the runtime's user-binding fold. There is no per-chat routing overlay
  // (`chats.metadata.providerRouting` was deleted with `RouteChatAssignment`, §7.1: a routing preference is a
  // property of the connection you picked, never of the room).
  const resolveChatFor = async (funderUserId: UserId, signal?: AbortSignal): Promise<Resolved<"chat">> => {
    const { resolved } = await input.connection.resolve({
      task: "chat",
      principal: await realHostPrincipal(funderUserId),
      ...(signal === undefined ? {} : { signal }),
    });
    return resolved as Resolved<"chat">;
  };
  const taskWindows = createTaskWindowReaders({
    roleClientsFor: input.roleClientsFor,
    availability: input.connection.availability,
    resolveHostPrincipal: realHostPrincipal,
  });

  // The host's active preset config, given its already-loaded default preset id. A stale/unowned/missing id
  // degrades to the system default. Shared by resolveForeignInputs + resolvePromptVariables so resolution
  // can't drift; takes the id (not the whole settings read) so a caller that already loaded it doesn't double-read.
  //
  // It returns the resolved row's NAME beside its config (#1754), and the two travel together by
  // construction: the name comes off the very `PresetDetail` the config did, so nothing downstream can
  // name one preset while assembling another. `null` = the system default stood in (there is no row to name).
  const resolvePromptConfigFor = async (runAsUserId: UserId, defaultPresetId: string | null): Promise<{ config: PromptConfig; name: string | null }> => {
    if (defaultPresetId === null) {
      return { config: DEFAULT_PROMPT_CONFIG, name: null };
    }
    try {
      const detail = await input.preset.get({
        userId: runAsUserId,
        id: castId<PresetId>(defaultPresetId),
      });
      return { config: detail.config, name: detail.name };
    } catch (err) {
      // Only a genuinely stale/unowned/missing preset id degrades to the system default — a database,
      // I/O, or program failure must surface, never run the turn with the wrong prompt (#759).
      if (err instanceof PresetNotFoundError) {
        return { config: DEFAULT_PROMPT_CONFIG, name: null };
      }
      throw err;
    }
  };

  // The GM-voice preset REDIRECT (docs/plans/rpg/design.md): a present override that resolves owned/system under
  // the host wins; a stale/unowned override (or absent) degrades to the host's normal default — the lenient-id
  // rule (never a broken turn). One home with `resolvePromptConfigFor` so the fallback can't drift. Returns the
  // RESOLVED preset id alongside the config (WAVE MU user-macro source attribution) — the override id when it
  // resolved, else the host default id, else null when the system `DEFAULT_PROMPT_CONFIG` stood in.
  const resolvePromptConfigWithOverride = async (
    runAsUserId: UserId,
    presetOverride: PresetId | undefined,
    defaultPresetId: string | null,
  ): Promise<{ config: PromptConfig; presetId: PresetId | null; presetName: string | null }> => {
    if (presetOverride !== undefined) {
      // @orb-waive caught-failure-ownership(err): narrow rethrow — documented below: only a
      // genuinely stale/unowned/missing override falls through to the host's default (the lenient-id rule,
      // #759); a database/I/O/program failure rethrows below unhandled. Ends if #759's ruling changes.
      try {
        const detail = await input.preset.get({ userId: runAsUserId, id: presetOverride });
        return { config: detail.config, presetId: presetOverride, presetName: detail.name };
      } catch (err) {
        // Only a genuinely stale/unowned/missing override falls through to the host's normal default (the
        // lenient-id rule) — a database, I/O, or program failure must surface (#759).
        if (!(err instanceof PresetNotFoundError)) {
          throw err;
        }
      }
    }
    const { config, name } = await resolvePromptConfigFor(runAsUserId, defaultPresetId);
    // The effective id is the host default only when it actually resolved a preset (not the DEFAULT fallback).
    return { config, presetId: config === DEFAULT_PROMPT_CONFIG ? null : (defaultPresetId as PresetId | null), presetName: name };
  };

  // The chat's PRESENT host (role='host', leftSeq NULL) — the room authority whose settings/library the
  // room draws from (D19; every roster character is host-owned). `null` ⇒ a hostless/stale room.
  const resolveChatHostUserId = async (chatId: ChatId): Promise<UserId | null> => {
    const hostRows = await db
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
      .limit(1);
    return hostRows.at(0)?.userId ?? null;
  };

  // The host's EMBED model tag — the space a chat's digests/segments are written into (§7.5/§10). No binding
  // is the honest `NoConnectionError`: memory's vector build needs a space, and a default would silently write
  // into a space nobody reads.
  const resolveMemoryEmbedSpace = async (hostUserId: UserId): Promise<MemoryEmbedSpace> => {
    const generation = await input.embeddings.resolveGeneration(hostUserId, "embed");
    if (generation === null) {
      throw new NoConnectionError("no embed connection is bound for this user — bind one in Connections");
    }
    return { ownerId: hostUserId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch };
  };

  // The chat's active preset's ChoiceBlock variables, resolved under the chat's host. Hostless/stale room
  // ⇒ no declared variables.
  const resolvePromptVariables = async (chatId: ChatId): Promise<readonly ChoiceBlockSpec[]> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return [];
    }
    const us = await input.settings.loadUserSettings(hostUserId);
    const { config } = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
    return config.variables;
  };

  // The chat's active preset's authored USER MACROS (#24) — the picks pane's declaration half, resolved
  // under the chat's host exactly like `resolvePromptVariables` (its ChoiceBlock sibling). A feature preset
  // OVERRIDE is deliberately not applied: it is a per-turn redirect (the rpg GM voice) no pane read can
  // anticipate. Hostless/stale room ⇒ no declared macros.
  const resolvePromptUserMacros = async (chatId: ChatId): Promise<readonly UserMacroSpec[]> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return [];
    }
    const us = await input.settings.loadUserSettings(hostUserId);
    const { config } = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
    return config.userMacros;
  };

  // The side-gen sampling ladder's MIDDLE rung for chat-scoped side-gen (quiet-generate/compaction + arbiter):
  // the chat HOST's active-preset generation params. One home with `resolvePromptVariables` (same host + config
  // resolution — a hostless/stale room degrades to the system-default params, never a throw).
  const resolveChatPresetParams = async (chatId: ChatId): Promise<UserIntent> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return DEFAULT_PROMPT_CONFIG.params;
    }
    const us = await input.settings.loadUserSettings(hostUserId);
    const { config } = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
    return config.params;
  };

  // The chat's app-tier PROSE overrides, resolved under the chat's HOST (PROSE-1 owner-decision 8, option
  // (a) — the room's side generations read one stable voice, not the speaker-of-the-moment's). One home with
  // `resolvePromptVariables`/`resolveChatPresetParams`: same host resolution, same hostless degrade — an
  // empty record, which resolves every slot to its shipped default (byte-identical to pre-PROSE-1).
  const resolveChatProse = async (chatId: ChatId): Promise<ProseOverrides> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return {};
    }
    return (await input.settings.loadUserSettings(hostUserId)).prose;
  };

  // The chat's PRESET-tier prose (PROSE-1 S4) — the rpg host doors' own resolution moment (see the field's
  // doc on `ChatComposeResult.rpgChatOps`). It walks the SAME ladder a game TURN walks, in the same order:
  // the GM-voice preset REDIRECT first (`input.rpg.resolvePresetOverride`, the early hop `buildTurnContext`
  // runs before its foreign read), then `resolvePromptConfigWithOverride`'s lenient resolve, then
  // `composeProse` by home. That sameness IS the inherited-preview rule: a host who edits a plane teach on
  // the table's GM preset sees the SAME bytes on a resync/populate that they see on a turn. Diverging here —
  // e.g. reading the host's default preset — is precisely the defect the `resolvePreviewInputs` GM redirect
  // was landed to fix, in a different jacket.
  const resolveChatPresetProse = async (chatId: ChatId): Promise<ProseOverrides> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return {};
    }
    const presetOverride = (await input.rpg?.resolvePresetOverride(chatId)) ?? null;
    const us = await input.settings.loadUserSettings(hostUserId);
    const { config } = await resolvePromptConfigWithOverride(hostUserId, presetOverride ?? undefined, us.seeds.defaultPresetId);
    return composeProse({ preset: config.prose });
  };

  // The one memory-config merge: the admin-set defaults, forced to `mode:"off"` when the host disabled
  // memory. Kept pure so both the live turn path and the sweep resolver funnel through it without
  // re-reading settings — the opt-out can't be honored on the turn and dropped on the sweep.
  const withMemoryOptOut = (disabled: boolean, defaults: MemoryConfig): MemoryConfig => (disabled ? { ...defaults, mode: "off" } : defaults);

  const resolveMemoryConfig = async (hostUserId: UserId): Promise<MemoryConfig> => {
    const us = await input.settings.loadUserSettings(hostUserId);
    const defaults = input.settings.getEffectiveConfig().memoryDefaults;
    return withMemoryOptOut(us.memory.enabled === false, defaults);
  };

  // The D50 PromptTransform registrar — one per deploy. Zero registrants today
  // (automation A7 + the plugin host register onto it later); its `apply` is the `ChatContext.promptTransforms`
  // op, so a chat with no transforms assembles + streams byte-identically.
  // Item 2: the per-transform deadline is a live admin knob (promptTransformDeadlineMs) — read per apply.
  const promptTransformRegistry = createPromptTransformRegistry(emitChatEvent, () => input.settings.getEffectiveConfig().promptTransformDeadlineMs);

  const chatCtx: ChatContext = {
    db,
    now,
    can: input.can,
    newChatId: minter(ID_PREFIX.chat),
    newMessageId: minter(ID_PREFIX.message),
    newMessageVariantId: minter(ID_PREFIX.messageVariant),
    newMessageAssetId: minter(ID_PREFIX.messageAsset),
    newMessageReactionId: minter(ID_PREFIX.messageReaction),
    newParticipantId: minter(ID_PREFIX.chatParticipant),
    newInjectionId: minter(ID_PREFIX.chatInjection),
    newEventId: minter(ID_PREFIX.chatEvent),
    newStreamEventId: minter(ID_PREFIX.chatStreamEvent),
    newStreamGenerationId: minter(ID_PREFIX.chatStreamGeneration),
    newInviteId: minter(ID_PREFIX.chatInvite),
    newPendingTurnId: minter(ID_PREFIX.pendingTurn),
    newChatTurnId: minter(ID_PREFIX.chatTurn),
    hashToken: createTokenHasher(input.sessionSecret),
    signupInvites: { mode: input.authMode, mintable: SIGNUP_INVITES_MINTABLE[input.authMode] },
    audit: input.audit,
    auditStatement: (entry, at) => buildAuditStatement(db, entry, at),
    // Fans chatsChanged to every present human member's channel; the engine passes a bare chatId
    // (principal-blind) — this composition-root helper enumerates membership.
    emitChatChanged: createChatChangedEmitter(db),
    applyRegexReplace: createRegexApplyReplace(),
    testRegexKey: createRegexTest(),
    // D121-E: the four-scope junction dereference (global/preset/cast/room). Chat owns the UNION
    // (`substrate/regex-tier`), the regex domain owns the STORAGE — one seam, no blob copies.
    resolveRegexSources: input.resolveRegexSources,
    tools: input.toolUse === undefined ? null : buildChatToolOps(input.toolUse, input.resolveHostPrincipal),
    // Bridges the chat role's streaming AsyncIterable onto the runtime's Promise+onDelta shape — the extracted
    // domain→runtime turn bridge (createRunChatTurnBridge), injecting the leaf `runChatTurn` (the §7.5-1a fence).
    runChatTurn: createRunChatTurnBridge({
      runChatTurn: input.runChatTurn,
      ...(input.promptCacheMinDepth === undefined ? {} : { promptCacheMinDepth: input.promptCacheMinDepth }),
    }),
    resolveChatPresetParams,
    resolveChatProse,
    resolveChat: (params) => resolveChatFor(params.funderUserId, params.signal),
    // THE POST-GENERATION CREDENTIAL STRIKE-OUT (#1373) — a DIRECT wire, deliberately not an adapter. The
    // adapter that used to sit here was the whole defect: it re-derived the classification from the HTTP
    // status (`401 → "unauthorized"`, `403 → "forbidden"`) against a verb that gates on `auth_failed`, so the
    // two vocabularies could never meet, and it RE-RESOLVED the credential after the failure — which under a
    // rotate/set-active race revokes the user's replacement key instead of the rejected one. The engine now
    // carries the provider's own `ProviderErrorKind` plus the credentialId the generation authenticated with,
    // which is exactly `MaybeRevokeParams`; anything else this seam could do would be re-deriving a fact it
    // was handed. A shape drift on either side is now a `tsc` error rather than a silent no-op.
    maybeRevokeOnAuthFailed: input.maybeRevokeOnAuthFailed,
    getCard: ({ ownerId, characterId }) => input.character.getCard({ principal: hostPrincipal(ownerId), characterId }),
    // ── HOST-HANDOFF COPY (stickler 2026-08-03 §5; the regex arm is #1739) — the four OWNING-domain write
    // factories the accepted property offer executes. Each lives in the domain that owns its tables and is
    // injected here, so chat never writes a `characters`, `world_books`, `regex_scripts` or `chat_digests`
    // row (`own-tables-only`). All four are unreachable without a stored offer, so an offer-less handoff
    // never calls any of them.
    copyHandoffCards: createCopyHandoffCards({
      db: input.db,
      bumpStatsCanonVersion,
      now: input.now,
      newCharacterId: minter(ID_PREFIX.character),
      // The picture RE-OWN, avatar AND carried background (#1426): `assets` is per-owner with an
      // `(owner_id, hash)` dedup (D21), so the copy cannot carry a source asset id verbatim — that would be a
      // pointer into a library the nominee cannot read AND a GC root holding the departed host's blob alive.
      // Content-addressing makes this cheap and idempotent (`created:false` when the recipient already has
      // those bytes). Ownership is PROVEN here: an asset that is not the departing host's yields `null` and
      // the copy lands without that picture rather than borrowing a stranger's blob. `kind` comes from the
      // CALLER because the CAS index is per-kind and the two carried pictures are genuinely different kinds.
      copyAsset: async ({ fromOwnerId, toOwnerId, assetId, kind }) => {
        const ref = await input.assets.assetCasRefById(assetId);
        if (ref === undefined || ref.ownerId !== fromOwnerId) {
          return null;
        }
        const bytes = await input.assets.loadAssetBytes(assetId);
        if (bytes === null) {
          return null;
        }
        const stored = await input.assets.store({
          principal: await input.resolveHostPrincipal(toOwnerId),
          bytes,
          kind,
          mime: ref.mime,
        });
        return stored.assetId;
      },
    }),
    copyHandoffBooks: createCopyHandoffBooks({
      db: input.db,
      now: input.now,
      newBookId: minter(ID_PREFIX.worldBook),
      newEntryId: minter(ID_PREFIX.worldEntry),
    }),
    copyHandoffRegexScripts: createCopyHandoffRegexScripts({
      db: input.db,
      now: input.now,
      newScriptId: minter(ID_PREFIX.regexScript),
    }),
    // …and their NOMINATE-side disclosure twins (#1762), each from the SAME domain file as its copy so the
    // number the nominee is shown comes out of the plan the accept executes. `db` only: these run before
    // the nominee has consented to anything, so they are structurally unable to mint (no clock, no minter).
    countHandoffBooks: createCountHandoffBooks(input.db),
    countHandoffRegexScripts: createCountHandoffRegexScripts(input.db),
    restampHandoffDigests: createHandoffRestampStatements({ db: input.db }),
    // D22 member card — the character's ACCEPTED tag NAMES under the host's ownership (chip display). Resolved
    // through the character domain (chat stays character-table-blind, the getCard precedent); a gone card
    // fail-closes to [] rather than throwing into the member-card read.
    resolveCharacterTags: async ({ ownerId, characterId }) => {
      // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — documented above: a gone card fail-closes to `[]` rather than throwing into the member-card read. Ends if a gone card needs to surface distinctly from an infra failure.
      try {
        const detail = await input.character.get({ principal: hostPrincipal(ownerId), characterId });
        return detail.tags.map((t) => t.name);
      } catch {
        return [];
      }
    },
    // ONE character read → the whole per-seat decoration (render policy layered over the deployment floor,
    // the raw theme + background override columns, and the card name/avatar). A human/agent seat, no host,
    // or an unreadable card resolves to the bare global floor + a null card (fail-closed, never a throw into
    // roster assembly). Collapses what were four separate reads of the same `characters` row per participant.
    // The tier combine is the ONE contracts resolver (`resolveRenderPolicy`) — external media is
    // TIGHTEN-ONLY there, so a card's `forbidExternalMedia: false` can never widen past a blocking
    // deployment (which the app-document CSP enforces independently), and the ladder's top rung needs the
    // `allowInteractiveCards` ceiling as well as the card's own opt-in (#111 leg 3).
    resolveSeatDeco: async ({ ownerId, characterId }) => {
      const cfg = input.settings.getEffectiveConfig();
      const floor = { trustHtml: cfg.trustHtml, forbidExternalMedia: cfg.forbidExternalMedia, allowInteractiveCards: cfg.allowInteractiveCards };
      // The deployment floor AS A RESOLVED policy — what a seat with no readable card gets. Produced by the
      // SAME resolver with no override rather than hand-built, so the no-card arm can never spell a step
      // the resolver would not (#111: the html-trust ladder is folded in exactly one place).
      const resolvedFloor = resolveRenderPolicy(floor, null);
      if (characterId === null || ownerId === null) {
        return { renderPolicy: resolvedFloor, themeOverride: null, backgroundOverride: null, card: null };
      }
      // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — the comment block above states
      // the contract: a no-host/unreadable-card seat resolves to the bare global floor + a null card, never
      // a throw into roster assembly. Ends if an unreadable card needs to surface distinctly from absence.
      try {
        const detail = await input.character.get({ principal: hostPrincipal(ownerId), characterId });
        return {
          renderPolicy: resolveRenderPolicy(floor, detail),
          themeOverride: detail.themeOverride,
          backgroundOverride: detail.backgroundOverride,
          card: { name: detail.name, avatarAssetId: detail.avatarAssetId },
        };
      } catch {
        return { renderPolicy: resolvedFloor, themeOverride: null, backgroundOverride: null, card: null };
      }
    },
    mintSyntheticGroupCharacter: (params) => input.character.mintSyntheticGroupCharacter(params),
    findSyntheticGroupCharacter: (params) => input.character.findSyntheticGroupCharacter(params),
    resolveUserPublics: async (userId, personaId) => {
      const rows = await db.select({ handle: users.handle }).from(users).where(eq(users.id, userId)).limit(1);
      const handle = rows[0]?.handle ?? null;

      let avatarAssetId: AssetId | null = null;
      let displayName: string | null = handle;

      if (personaId !== null) {
        const p = (
          await db
            .select({ name: personas.name, avatarAssetId: personas.avatarAssetId })
            .from(personas)
            .where(and(eq(personas.id, personaId), eq(personas.ownerId, userId)))
            .limit(1)
        )[0];

        if (p) {
          displayName = p.name;
          avatarAssetId = p.avatarAssetId;
        }
      }

      if (avatarAssetId === null) {
        // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — a persona/handle
        // display fact was already resolved above; this is the LAST-resort avatar enrichment, and a failed
        // read just leaves `avatarAssetId` at its already-established `null`. Ends if this read becomes the
        // only source of `displayName`/`handle`.
        try {
          const userSettings = await input.settings.loadUserSettings(userId);
          const raw = userSettings.profile.avatarAssetId ?? null;
          avatarAssetId = raw === null ? null : castId<AssetId>(raw);
        } catch {
          // ignore
        }
      }

      return {
        displayName,
        handle,
        avatarAssetId,
      };
    },
    // The gate reader answers "is this asset's owner a present member of the referencing chat?" — a
    // scoped chat_participants read.
    resolveImageUrl: (params) =>
      resolveImageRefToUrl(
        input.assets,
        async (userId, forChatId) => {
          const rows = await db
            .select({ id: chatParticipants.id })
            .from(chatParticipants)
            .where(and(eq(chatParticipants.userId, userId), eq(chatParticipants.chatId, forChatId), isNull(chatParticipants.leftSeq)))
            .limit(1);
          return rows.length > 0;
        },
        input.settings.getEffectiveConfig().forbidExternalMedia,
        params,
      ),
    // A hash is not a secret; the owner-gate lives on the blob route's byte read, not here.
    resolveAssetHash: async (assetId) => {
      if (assetId === null) {
        return null;
      }
      const ref = await input.assets.assetCasRefById(assetId);
      return ref?.hash ?? null;
    },
    // Owner-scoped: a foreign/gone id is simply absent from the result.
    filterOwnedAssetIds: async (userId, assetIds) => (await input.assets.resolveOwnedAssetRefs(userId, assetIds)).map((r) => r.assetId),
    materializeBackground: input.materializeBackground,
    storeInlineReplyImage: input.storeInlineReplyImage,
    // The chat op type erases the batch to `unknown`; this wrapper restores the concrete type.
    applyStatsDelta: (batch, opDb, delta) => {
      applyStatsDelta(batch as BatchStmt[], opDb, delta);
    },
    bumpStatsCanonVersion: (batch, opDb, ownerId) => {
      bumpStatsCanonVersion(batch as BatchStmt[], opDb, ownerId);
    },
    // Every summarize call names its FUNDER (§8.5b): the arbiter and extract-quiet spend the round's trigger,
    // the digests the trigger under `allowBackground` — never a box owner's bundle.
    summarize: async (funderUserId, ...args) => (await input.roleClientsFor(funderUserId)).summarize(...args),
    summarizerContextTokens: taskWindows.summarize,
    summarizeAvailability: async (funderUserId) => await input.connection.availability({ task: "summarize", principal: await realHostPrincipal(funderUserId) }),
    // The embed model's input cap off the resolved EMBEDDING capability (was the vLLM launch window) — the
    // SAME fact the transport's belt clamp reads, so the segment build's skip boundary and the wire's
    // last-resort cut can't disagree.
    embedContextTokens: taskWindows.embed,
    memorySummarizer: input.settings.getEffectiveConfig().memorySummarizer,
    // record INSERTs the row (assigning seq) THEN the persisted view is published onto the live bus —
    // a dead bus path never loses an event (subscriptions replay from the table by seq).
    resolveHandle: (handle) => input.resolveHandle(handle),
    // The disabled-account containment gate (owner-ruled 2026-08-15): read fresh per call (no caching), the
    // SAME raw-read discipline `resolveUserPublics` above already uses — a gone userId (should never happen,
    // FK-enforced) fails closed to `false` rather than throwing into roster assembly.
    resolveUserEnabled: async (userId) => {
      const rows = await db.select({ enabled: users.enabled }).from(users).where(eq(users.id, userId)).limit(1);
      return rows[0]?.enabled ?? false;
    },

    // A solo-character founding with exactly ONE character_personas connection auto-anchors that persona;
    // 0 or 2+ connections (ambiguity) or a group founding falls through to the default seed.
    resolveConnectedPersona: async (userId, characterIds) => {
      const [characterId] = characterIds;
      if (characterId === undefined || characterIds.length !== 1) {
        return null;
      }
      const rows = await db
        .select({ personaId: characterPersonas.personaId })
        .from(characterPersonas)
        .innerJoin(personas, eq(personas.id, characterPersonas.personaId))
        .where(and(eq(characterPersonas.characterId, characterId), eq(personas.ownerId, userId)))
        .limit(2);
      const [only] = rows;
      return rows.length === 1 && only !== undefined ? only.personaId : null;
    },
    resolveDefaultPersona: async (userId) => {
      const us = await input.settings.loadUserSettings(userId);
      const raw = us.seeds.defaultPersonaId;
      if (raw === null) {
        return null;
      }
      try {
        const persona = await input.persona.get({
          principal: hostPrincipal(userId),
          personaId: castId<PersonaId>(raw),
        });
        return persona.id;
      } catch (err) {
        // Only a genuinely stale/deleted persona id is optional — a database, I/O, or program failure
        // must surface, never silently seat the room with no active persona (#760).
        if (err instanceof PersonaNotFoundError) {
          return null;
        }
        throw err;
      }
    },
    resolveCurrentPersona: async (userId) => {
      const us = await input.settings.loadUserSettings(userId);
      const raw = us.seeds.currentPersonaId;
      if (raw === null) {
        return null;
      }
      try {
        const persona = await input.persona.get({
          principal: hostPrincipal(userId),
          personaId: castId<PersonaId>(raw),
        });
        return persona.id;
      } catch (err) {
        // Only a genuinely stale/deleted persona id is optional — a database, I/O, or program failure
        // must surface, never silently seat the room with no active persona (#760).
        if (err instanceof PersonaNotFoundError) {
          return null;
        }
        throw err;
      }
    },
    // Absent/foreign ⇒ false (leak-free).
    verifyPersonaOwned: async ({ ownerId, personaId }) => {
      const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(1);
      return rows[0]?.ownerId === ownerId;
    },
    emitNotification: async (event, coStatements) => {
      const view = await input.notifications.record({
        event,
        ...(coStatements !== undefined ? { coStatements } : {}),
      });
      publishNotification(view);
    },
    // Server-derived — never a client-asserted (spoofable) heartbeat.
    readPresence: input.readPresence,
    // Maps imagery's GeneratedPicture → chat's chat-local structural result (chat can't import
    // domain/imagery's types).
    generatePicture: async (p) => {
      const picture = await input.generatePicture({
        caller: p.caller,
        chatId: p.chatId,
        mode: p.mode,
        ...(p.prompt !== undefined ? { prompt: p.prompt } : {}),
        ...(p.n !== undefined ? { n: p.n } : {}),
      });
      return {
        images: picture.images.map((img) => ({ assetId: img.assetId })),
        warnings: picture.warnings.map((w) => ({ code: w.code, detail: w.detail })),
      };
    },
    // A chat's digest/segment SPACE is its HOST's (`chatParticipants` role='host' — vector tasks are owner-scoped,
    // §7.5; D18 chats have no owner column, so the host is resolved per write). A hostless/stale room has no
    // space to write into, so the builder skips it before reaching this owner-coherence guard.
    resolveMemoryEmbedSpace,
    embeddingsStore: async (params) => {
      const hostUserId = await resolveChatHostUserId(params.key.chatId);
      if (hostUserId !== params.ownerId) {
        throw new Error(`memory digest owner changed during sweep for chat ${params.key.chatId}`);
      }
      const result = await input.embeddings.store({
        kind: "chat-block",
        lens: "digest",
        ownerId: params.ownerId,
        chatId: params.key.chatId,
        scopedCharacterId: params.key.scopedCharacterId,
        isGroup: params.isGroup,
        tier: params.key.tier,
        blockIdx: params.key.blockIdx,
        text: params.text,
        topicAnchor: params.topicAnchor,
        keywords: params.keywords,
        speakerCharacterIds: params.speakerCharacterIds,
        contentHash: params.contentHash,
        model: params.model,
        dim: EMBED_SPACE_DIMS,
        signal: params.signal,
      });
      if (result.generationId === undefined || result.generationEpoch === undefined) {
        throw new Error("embeddings store omitted its generation receipt");
      }
      return { ownerId: params.ownerId, model: result.model, generationId: result.generationId, generationEpoch: result.generationEpoch };
    },
    // The SEGMENT half is a BATCH op (#172): memory hands over every pending chunk — one chat's on the live
    // path, the whole corpus's on the sweep — and embeddings submits them to the engine as ONE flood. The
    // space tag (`model`/`dim`) is stamped here, the same single home the digest arm above reads.
    embeddingsStoreSegments: async (params, signal) => {
      // One host + one space per chat in the flood (the corpus sweep hands over many chats at once).
      const rows: EmbeddingSegmentRow[] = [];
      for (const p of params) {
        const hostUserId = await resolveChatHostUserId(p.chatId);
        if (hostUserId !== p.ownerId) {
          throw new Error(`memory segment owner changed during sweep for chat ${p.chatId}`);
        }
        rows.push({
          kind: "chat-block" as const,
          lens: "segment" as const,
          ownerId: p.ownerId,
          chatId: p.chatId,
          blockIdx: p.blockIdx,
          chunkIdx: p.chunkIdx,
          seqStart: p.seqStart,
          seqEnd: p.seqEnd,
          text: p.text,
          contentHash: p.contentHash,
          model: p.model,
          dim: EMBED_SPACE_DIMS,
        });
      }
      const results = rows.length === 0 ? [] : await input.embeddings.storeSegments(rows, signal);
      return memorySegmentReceipts(rows, results);
    },
    // The SHRINK half of the same seam: memory stores every block that exists, then reclaims the ones that
    // stopped existing. Straight pass-through of the two lens arms — the DELETE itself lives in embeddings
    // (the one vector write path, D20), and chat never touches `chat_digests`/`chat_segments` directly.
    embeddingsPruneBlocks: async (params) => {
      if (params.lens === "digest") {
        await input.embeddings.pruneMemoryBlocks({
          lens: "digest",
          chatId: params.chatId,
          scopedCharacterId: params.scopedCharacterId,
          keepPerTier: params.keepPerTier,
        });
        return;
      }
      // #1395 — the KNOWN-stale invalidation arm (a proven-stale row whose replacement came back empty).
      if (params.lens === "digest-stale") {
        await input.embeddings.pruneMemoryBlocks({
          lens: "digest-stale",
          chatId: params.chatId,
          scopedCharacterId: params.scopedCharacterId,
          keys: params.keys,
        });
        return;
      }
      await input.embeddings.pruneMemoryBlocks({
        lens: "segment",
        chatId: params.chatId,
        keepBlockCount: params.keepBlockCount,
        chunkCounts: params.chunkCounts,
      });
    },
    // DB6: absent ⇒ the field stays unset ⇒ GATHER skips the databank branch (byte-identical no-op).
    ...(input.gatherDatabank !== undefined ? { gatherDatabank: input.gatherDatabank } : {}),
    // The scored projection: identity + BOTH ranking numbers, and deliberately NOT the hit's `text` (memory
    // resolves its own digest bodies from the pool it already loaded — the seam carries what recall must
    // EXPLAIN, never a second copy of the content).
    // The digest SPACE is the host's (their `embed`/`rerank` bindings wrote it — vector tasks are owner-scoped,
    // inference program §7.5); `MemoryQueryOptions` carries no owner by D20, so the host is resolved from the
    // chat FK here, exactly as `searchCorpus` below does. Hostless room ⇒ nothing to recall (leak-free).
    // The SPACE refusals degrade here rather than faulting the turn (#2510 — `retrieval-degrade.ts` states
    // the whole boundary): a mid-move or unbound vector space is an ordinary owner state, and the user hears
    // about it through the episode this reports into. Every other search failure still propagates.
    searchDigests: async (query, events) => {
      const hostUserId = await resolveChatHostUserId(query.scope.chat);
      if (hostUserId === null) {
        return [];
      }
      const onRerankUnavailable = events?.onRerankUnavailable;
      const hits = await withRetrievalDegrade(
        async () => await input.search.digests({ ...query, ownerId: hostUserId }, onRerankUnavailable === undefined ? undefined : { onRerankUnavailable }),
        { empty: [], onIndexUnavailable: events?.onIndexUnavailable },
      );
      return hits.map((h) => ({ blockKey: h.blockKey, score: h.score, relevance: h.relevance }));
    },
    // The owner-wide corpus lens. MemoryQueryOptions deliberately carries no owner, so the owner is
    // resolved FROM CONTEXT here: the chat's present host (D19 — the room authority; every roster character
    // is host-owned, so the host's corpus IS this room's corpus). Hostless/stale room ⇒ empty
    // (leak-free unknown-owner, the resolvePromptVariables posture); an empty queryText propagates the
    // corpus verb's own SEARCH_EMPTY_QUERY refusal (flag-don't-fake).
    searchCorpus: async (query) => {
      const hostUserId = await resolveChatHostUserId(query.scope.chat);
      if (hostUserId === null) {
        return [];
      }
      const hits = await input.search.corpus({
        ownerId: hostUserId,
        queryText: query.queryText ?? "",
        mode: query.mode,
        minScore: query.minScore,
      });
      return hits.map((h) => h.blockKey);
    },
    log: (entry) => recordMemoryLog(entry),
    // #250 — absent recorder ⇒ the field stays unset ⇒ recall's `ctx.recordRecall?.()` is a no-op.
    ...(input.recallRecorder !== undefined ? { recordRecall: input.recallRecorder.sink } : {}),
    // #313 — the header brain-icon's live feed: recall (`recall/recall.ts`) BUILDS the `memoryRecall` event
    // (the domain owns its bus literal, the `turnStarted` precedent); this only fans it on the LIVE-ONLY lane
    // (ephemeral per-turn state, never persisted). The room-public payload carries only the count — the digest
    // detail stays host-only (the popover reads the assembly preview for it).
    emitRecallPhase: input.emitChatEventLive,
    getGroupConfig: (rawMetadata) => getGroupConfig(rawMetadata),
    getRoomOverrides: (rawMetadata) => getRoomOverrides(rawMetadata),
    // ⑧(a) — the caller's temporary-chat reap TTL (hours), from the settings domain via the FOREIGN op.
    resolveTempChatTtlHours: async (userId) => (await input.settings.loadUserSettings(userId)).chat.tempChatTtlHours,
    // B7 — the VERB-TIME half of the reaction-posture resolve (the reaction verbs gate on the PRESENT
    // host's per-user defaults; the turn path reads the same two fields off `chatBehavior` below). The
    // same settings FOREIGN op as its TTL neighbour — chat never imports settings.
    readReactionDefaults: async (userId) => {
      const us = await input.settings.loadUserSettings(userId);
      return { charactersCanReact: us.chat.charactersCanReact, reactionsEnabled: us.chat.reactionsEnabled };
    },
    resolvePromptVariables,
    resolvePromptUserMacros,
    // Null ⇒ expressions not wired (byte-identical no-op — the `tools` precedent). The classify hook fires
    // fire-and-forget after a variant commits.
    expressions: input.expressions ?? null,
    // Null ⇒ rpg not wired (byte-identical no-op — the `expressions`/`tools` precedent). The 5 injected rpg
    // turn ops fire at GATHER / preset-resolve / send-commit / turn-end.
    rpg: input.rpg ?? null,
    // The S2 teaching registry: chat's OWN contribution (the rpg-gather
    // projection, order 0) plus whatever later rows wire in (C1's automation guidance is the next one).
    // Absent input ⇒ chat's alone ⇒ byte-identical, and the registry is never null so a game turn's state
    // block can never be silently dropped by a forgotten wiring.
    teaching: [...createChatTeachingContributions({ db }), ...(input.teaching ?? [])],
    // The D50 PromptTransform apply op — the registry's `apply`. Zero registrants ⇒ byte-identical.
    promptTransforms: promptTransformRegistry.apply,
    // The per-turn plugin-macro resolve (U6). Null ⇒ no plugin host wired (byte-identical no-op).
    pluginMacros: input.pluginMacros ?? null,
  };

  const resolveTurnPersonas = createTurnPersonaResolver(input.resolvePersonasForParticipants);
  const chatDeps: ChatServiceDeps = {
    emit: emitChatEvent,
    emitChecked: input.emitChatEventChecked,
    prepareCreationEvent: input.prepareChatCreationEvent,
    emitLive: input.emitChatEventLive,
    activeTurns: createActiveTurns(),
    prng: () => Math.random(),
    delay: sleep,
    // THE TURN'S OWN RESOLVE and the #54 pre-send gate, both keyed on the FUNDER (§8.4-3): the composer says
    // AVAILABLE against the member's own connection and the turn spends that same connection — a host-keyed
    // gate here was exactly the failure verify8 H1 named.
    resolveConnection: ({ funderUserId }) => resolveChatFor(funderUserId),
    checkSendAvailability: async ({ funderUserId }) => input.connection.availability({ task: "chat", principal: await realHostPrincipal(funderUserId) }),
    resolveForeignInputs: async ({ runAsUserId, anchorPersonaId, presentHumanUserIds, humanSeats, trigger, voice, presetOverride }) => {
      const us = await input.settings.loadUserSettings(runAsUserId);

      // A feature-supplied GM-voice preset REDIRECT (docs/plans/rpg/design.md) wins over the host's default when it
      // resolves owned-or-system under the host; a stale/unowned override degrades to the host's normal default
      // (the lenient-id rule — never a broken turn). Absent ⇒ the host default (byte-identical to today).
      const { config: promptConfig, presetId, presetName } = await resolvePromptConfigWithOverride(runAsUserId, presetOverride, us.seeds.defaultPresetId);

      // THE ROOM-PLANE PERSONA READ (the multi-human widening). NOT `persona.get` under a host Principal:
      // that owner-scoped keyhole silently nulled every NON-HOST member's persona, so a member's own turn
      // rendered `{{user}}` as the kit floor "User" and a host-pinned member-owned anchor was a dead pin —
      // both violating FINAL-Persona §A.1 in exactly the multi-human room the D16/D18 spine exists for. The
      // persona domain's principal-less roster op resolves the room's ids in ONE gated read; chat supplies
      // the consent set (its PRESENT humans), so a departed member's persona resolves to nothing.
      const turnPersonas = await resolveTurnPersonas({ runAsUserId, anchorPersonaId, presentHumanUserIds, humanSeats, trigger, voice });

      const memoryConfig = withMemoryOptOut(us.memory.enabled === false, input.settings.getEffectiveConfig().memoryDefaults);

      return {
        promptConfig,
        // WAVE MU — the resolved preset id for user-macro source attribution (override id / host default / null).
        presetId,
        // #1754 — the SAME resolution's NAME, so the room's Regex section can say WHICH preset it is showing
        // (the GM redirect's on a game chat) instead of falling back to the viewer's own active preset.
        presetName,
        personas: turnPersonas,
        // FLAG[timezone-per-request]: {{time}}/{{date}} use the caller's per-request browser zone; the
        // macro engine falls back to server-local until the turn request carries it.
        scanDepth: us.worldInfo.scanDepth,
        injectionTokenBudget: us.worldInfo.tokenBudget,
        memoryConfig,
        // The host's turn-behavior arm the engine honors (custom stops + auto-continue/auto-swipe).
        chatBehavior: {
          autoContinue: us.chat.autoContinue,
          autoContinueRounds: us.chat.autoContinueRounds,
          autoSwipe: us.chat.autoSwipe,
          customStoppingStrings: us.chat.customStoppingStrings,
          // B1 — the host's per-user offer-choices DEFAULT; the room's own `chatMetadata.offerChoices`
          // overrides it at `resolveTeachingKnobs`. Under the frozen host (D19), like every other field here.
          offerChoices: us.chat.offerChoices,
          // B7 — the two reaction defaults, the same seam + meeting point (their room halves override at
          // `resolveTeachingKnobs`; the verb-time gates read them via `readReactionDefaults` above).
          charactersCanReact: us.chat.charactersCanReact,
          reactionsEnabled: us.chat.reactionsEnabled,
        },
        // DB6: the host's databank retrieval params (k/minScore/rerank) the gather passes to search.documents,
        // plus the {{databank}} slot budget — the FOREIGN-inputs seam (settings read chat delegates).
        databankRetrieval: us.databank.retrieval,
        databankSlotTokenBudget: us.databank.slotTokenBudget,
      };
    },
    holder: input.holder,
    lockTtlMs: CHAT_LOCK_TTL_MS,
    signup: {
      ...input.signup,
      // The `changes()`-guarded audit insert: it lands only when the seat before it landed (D259).
      auditStatementAfterWrite: (entry, at) => buildAuditStatementIfPrecedingWrote(db, entry, at),
    },
  };

  const chatBundle = createChatService(chatCtx, chatDeps);
  // B7 — the `react` tool: chat's standalone write op closed into the ONE tool-use registry (the
  // definition is compose-homed, `./chat-tools.ts` — a domain-side file would close a `no-circular` loop
  // through tool-use's teaching contribution). Registered only when tool-use is wired, matching
  // `ChatContext.tools`'s null arm — an unwired deploy is byte-identical.
  if (input.toolUse !== undefined) {
    input.toolUse.register(createReactToolDefinition({ reactAsCharacter: createReactAsCharacter(chatCtx, { emit: emitChatEvent }) }));
  }
  return {
    service: chatBundle.service,
    emitBusEvent: emitChatEvent,
    rpgChatOps: {
      getMembership: createGetMembership(chatCtx),
      // The narrator op is built OUTSIDE createChatService (an injected rpg op, not a routed verb), so it gets
      // its own claim chokepoint from the same factory — one behavior, two construction sites.
      postNarratorMessage: createPostNarratorMessage(chatCtx, { emit: emitChatEvent, claimChat: createClaimChat(chatCtx) }),
      getPendingUserText: createGetPendingUserText(chatCtx),
      setRpgPointer: createSetRpgPointer(chatCtx),
      resolveRpgParticipants: createResolveRpgParticipants(chatCtx),
      resolveHostUserId: resolveChatHostUserId,
      resolveCanonWindow: createResolveCanonWindow(chatCtx),
      resolveCardCorpus: createResolveRpgCardCorpus(chatCtx),
      resolvePromptUserMacros,
      resolveChatPresetProse,
    },
    promptTransforms: promptTransformRegistry,
    applyVariableOps: (chatId, ops, expect) => applyStandaloneVariableOps(chatCtx, chatId, ops, expect),
    resolveChatProse,
    requestTurn: chatBundle.requestTurn,
    signupInvites: chatBundle.signupInvites,
    isMemoryEnabled: async (hostUserId): Promise<boolean> => (await resolveMemoryConfig(hostUserId)).mode !== "off",
    backfill: {
      memory: (args) => backfillMemory(chatCtx, args, resolveMemoryConfig),
      groupCharacters: (args) => backfillGroupCharacters(chatCtx, args),
    },
  };
}
