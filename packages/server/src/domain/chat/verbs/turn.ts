// Turn-running front doors: gate → resolve the identity triple → resolve the connection → build the one
// immutable assemble ctx → arbitrate the speaker(s) → drive the round (per-turn-locked) → return the outcome.
// Group-ness is data (roster size + arbitration), never a branch — solo is a roster-of-1 through the same path.
// The triple is never callerUserId: caller is principal.userId, runAsUserId is the host, triggeredBy is the
// responsible human (the caller for a direct send; the chain-starter for an auto-mode turn).
//
// One createTurn(ctx, deps) factory bundles: round-driving/control verbs send/forceCharacterTurn/abort, plus
// the auxiliary single-speaker turns swipe/continueTurn(+undo/revert)/impersonate/generate. Every generating
// verb threads the active-turns abort signal into the engine and its `guided` steer into GATHER→BUILD.

import type { AssembleContext, ChatBusEvent, GroupConfig, MessageView, SpeakerRef } from "@orb/contracts/chat";
import { AUTOMATION_DEPTH_HARD_CAP, DEFAULT_GROUP_CONFIG, isAiDriven, speakerKey } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { GenerationType } from "@orb/contracts/preset";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
import type { AssetId, CharacterId, ChatId, MessageId, PendingTurnId, PersonaId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context";
import type { ActiveTurns } from "../contract/active-turns";
import type { ArbiterCandidate, AutoModeResult, CastName } from "../contract/arbitration";

import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type { ChatBehaviorInputs, ResolveForeignInputsOp } from "../contract/foreign";
import { DEFAULT_CHAT_BEHAVIOR } from "../contract/foreign";
import type { MemoryConfig, MemoryRecallInputs } from "../contract/memory";
import type {
  AbortParams,
  ContinueTurnParams,
  ForceCharacterTurnParams,
  GenerateParams,
  GuidedSteer,
  ImpersonateParams,
  RequestTurnParams,
  RevertContinueParams,
  SendParams,
  SwipeParams,
  UndoContinueParams,
} from "../contract/params";
import type { DrainDeferredTurnsScope, DrainReport, RequestTurnOp, TurnEngine, TurnKind, TurnOutcome, TurnPrep } from "../contract/results";
import type { ChatService } from "../contract/service";
import { requireHost, requireParticipant } from "../guard";
import {
  buildCommittedMessageView,
  combineReasoning,
  insertCanonMessageStatements,
  insertMessageAssetStatements,
  setVariantContentStatement,
} from "../persistence/canon-write";
import { claimPendingTurn, insertPendingTurn, loadPendingTurnsForHost, loadPendingTurnsForReclaim } from "../persistence/invites";

import {
  loadCanonHistory,
  loadChatRow,
  loadContinueSnapshot,
  loadIsReplyToLatestUserMessage,
  loadMaxMessageSeq,
  loadMessageView,
  loadSlotTarget,
} from "../persistence/queries";
import { loadPresentRole, loadRoster } from "../persistence/roster";
import { gatherAssembleContext } from "../substrate/assemble-gather";
import { freezeVolatileMacros } from "../substrate/assembly-access";
import { userMessageDelta } from "../substrate/stats-delta";
import { driveRoundVia, resolveMentionsVia, resolveTurnIdentityVia, runAutoModeVia, selectSpeakersVia, smartArbitrateVia } from "../substrate/turn-access";

/** SEND USER_INPUT regex out-param sink: `buildAssembleContext` writes the post-regex user text here so the
 *  verb persists that (the haystack and the stored row never diverge). Also receives the round-level recall
 *  inputs (`memoryRecall`) `gatherMemory` stages for the engine's per-speaker witnessed re-run (D6). */
interface SendRegexSink {
  sendUserText?: string;
  memoryRecall?: MemoryRecallInputs | null;
}

/** The shared per-round identity + ctx the driver reuses by reference. */
type RoundBase = Parameters<typeof driveRoundVia>[0]["base"];

/** Collaborators not on `ChatContext` (the second factory arg). */
interface TurnDeps {
  readonly engine: TurnEngine;
  readonly activeTurns: ActiveTurns;
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly prng: () => number;
  readonly delay: (ms: number) => Promise<void>;
  readonly resolveConnection: (args: { readonly runAsUserId: UserId; readonly chatId: ChatId }) => Promise<ResolvedConnection>;
  /** The foreign half of the assemble ctx (preset/persona/settings), resolved at the composition root. The
   *  chat-internal half is gathered by `gatherAssembleContext`. */
  readonly resolveForeignInputs: ResolveForeignInputsOp;
}

/** The turn-running slice of `ChatService` this grouped file owns. */
type TurnVerbs = Pick<
  ChatService,
  "send" | "forceCharacterTurn" | "abort" | "swipe" | "continueTurn" | "impersonate" | "generate" | "undoContinue" | "revertContinue" | "drainDeferredTurns"
>;

/** How many trailing canon rows feed the `smart` arbiter's transcript. */
const RECENT_TRANSCRIPT = 10;

const ATTACHMENT_ALT = "attachment";

/** Composes the persisted body from the (post-regex) user text + one `![](asset:<id>)` ref per attached
 *  asset. Empty text + attachments yields an image-only body; no attachments returns the text unchanged. */
function composeBodyWithAttachments(text: string, attachmentAssetIds: readonly AssetId[]): string {
  if (attachmentAssetIds.length === 0) {
    return text;
  }
  const refs = attachmentAssetIds.map((id) => `![${ATTACHMENT_ALT}](asset:${id})`).join("\n");
  const trimmed = text.trim();
  return trimmed.length > 0 ? `${text}\n\n${refs}` : refs;
}

/** Synthetic trailing-user nudges: the unsteered continue/impersonate baseline, riding `appendUserTurn`. A
 *  `guided` steer composes with these. */
const CONTINUE_NUDGE = "[Continue the previous message from exactly where it left off, without repeating it.]";
const IMPERSONATE_NUDGE = "[Write the next message as the user, in the user's own voice.]";

/** The roster-derived turn substrate: the host, the AI-driven candidates (character + agent — arbitration),
 *  their display names, the character cast ids (WI/memory), and the present personas. */
interface Room {
  readonly hostUserId: UserId;
  readonly candidates: readonly ArbiterCandidate[];
  readonly castNames: readonly CastName[];
  readonly castCharacterIds: readonly CharacterId[];
  /** The `speakerKey`s of the present MUTED seats (character + agent) — the `castNotMuted` producer, keyed on
   *  the same seat `disabled` axis arbitration reads. Empty ⇒ nothing muted. */
  readonly mutedSpeakerKeys: ReadonlySet<string>;
  readonly personaIds: readonly PersonaId[];
}

/** Loads the present roster → the {@link Room}. Hostless is unusable (leak-free NOT_FOUND). Cards read under
 *  the host's ownership. */
async function loadRoom(ctx: ChatContext, chatId: ChatId): Promise<Room> {
  const roster = await loadRoster(ctx.db, chatId);
  const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
  if (hostUserId === null) {
    throw new ChatNotFoundError(chatId);
  }
  const aiRows = roster.filter((r) => isAiDriven(r.kind));
  const charRows = aiRows.flatMap((r) => (r.kind === "character" && r.characterId !== null ? [{ ...r, characterId: r.characterId }] : []));
  const cards = await Promise.all(charRows.map((r) => ctx.getCard({ ownerId: hostUserId, characterId: r.characterId })));

  // An offline human's persona drops from the present-cast set for this round, since presence gates
  // which persona-book world-info joins the pool (a server-derived signal, never client-asserted).
  const humanPersonas = roster.flatMap((r) =>
    r.kind === "human" && r.userId !== null && r.activePersonaId !== null ? [{ userId: r.userId, personaId: r.activePersonaId }] : [],
  );
  const online = await Promise.all(humanPersonas.map((h) => ctx.readPresence(h.userId).then((p) => p.online)));
  const personaIds = humanPersonas.filter((_h, i) => online[i] === true).map((h) => h.personaId);

  const charCandidates: ArbiterCandidate[] = charRows.map((r) => ({
    ref: { kind: "character", characterId: r.characterId },
    talkativeness: r.talkativeness,
    disabled: r.disabled,
    leftSeq: r.leftSeq,
  }));

  const charCastNames: CastName[] = charRows.map((r, i) => ({ ref: { kind: "character", characterId: r.characterId }, name: cards[i]?.name ?? "" }));
  const candidates: ArbiterCandidate[] = [...charCandidates];
  return {
    hostUserId,
    candidates,
    castNames: [...charCastNames],
    castCharacterIds: charRows.map((r) => r.characterId),
    mutedSpeakerKeys: new Set(candidates.filter((c) => c.disabled).map((c) => speakerKey(c.ref))),
    personaIds,
  };
}

/** The primary character id (roster's first cast seat), the solo/single-speaker default. Null only for an
 *  empty cast. */
function primaryCharacterId(room: Room): CharacterId | null {
  const first = room.castNames[0]?.ref;
  return first !== undefined ? first.characterId : null;
}

/** The joined present-cast name (narrator `{{char}}`-as-cast); collapses to the single name at cast=1. */
function joinedCastName(castNames: readonly CastName[]): string {
  return castNames
    .map((c) => c.name)
    .filter((n) => n.length > 0)
    .join(", ");
}

/** The last-assistant speaker (ban-last seed) + a recent transcript the `smart` arbiter reads. */
async function canonFacts(ctx: ChatContext, chatId: ChatId): Promise<{ lastSpeaker: SpeakerRef | null; recentHistory: string }> {
  const canon = await loadCanonHistory(ctx.db, chatId);
  return {
    lastSpeaker: lastSpeakerRef(canon.findLast((m) => m.role === "assistant")),
    recentHistory: canon
      .slice(-RECENT_TRANSCRIPT)
      .map((m) => m.content)
      .join("\n"),
  };
}

/** The ban-last speaker ref for the last assistant row: its characterId or its authorUserId; null when there
 *  is no prior assistant turn. */
function lastSpeakerRef(row: { readonly characterId: CharacterId | null; readonly authorUserId: UserId | null } | undefined): SpeakerRef | null {
  if (row === undefined) {
    return null;
  }
  if (row.characterId !== null) {
    return { kind: "character", characterId: row.characterId };
  }
  return null;
}

/** The built turn context + the resolved host memory config threaded onto every `TurnPrep` — one source of
 *  truth, the same value recall reads. */
interface BuiltTurnContext {
  readonly assembleContext: AssembleContext;
  readonly memoryConfig: MemoryConfig | null | undefined;
  /** The round-level recall inputs staged for the engine's per-speaker witnessed re-run (D6); `null` when
   *  there is no character to key on (memory off / empty cast) ⇒ the engine keeps round-level `memory`. */
  readonly memoryRecall: MemoryRecallInputs | null;
  /** The host's resolved turn-behavior arm (PD-146) — the custom stops the prep threads onto the request
   *  + the auto-continue/auto-swipe knobs the send post-round hook gates on. Defaulted to all-off. */
  readonly chatBehavior: ChatBehaviorInputs;
  /** The tool names a game turn's GATHER contributed (rpg-design/05 §1) — threaded onto the round base →
   *  `TurnPrep.attachedToolNames` (the pipeline resolves them against the tool-use registry). Empty for a
   *  non-game turn (byte-identical); empty until the rpg tool registry lands (R4 #2/#3) even for a game. */
  readonly attachedToolNames: readonly string[];
  /** rpg-design/05 §6 slot-adjacency (threaded onto `TurnPrep` → the engine marks the turn dice-eligible after
   *  minting `turnId`). False for a non-game / ineligible turn (byte-identical). */
  readonly respondsToLatestUserTurn: boolean;
}

/** The turn's driving {@link TurnKind} → the `injection_trigger` {@link GenerationType} gate. Exhaustive
 *  Record — a new TurnKind fails tsc here rather than silently defaulting. */
const GENERATION_TYPE_FOR_KIND: Record<TurnKind, GenerationType> = {
  send: "normal",
  generate: "normal",
  force: "normal",
  auto: "normal",
  opening: "normal",
  swipe: "swipe",
  continue: "continue",
  impersonate: "impersonate",
};

/** Builds the one immutable assemble ctx for the round: resolves the foreign half from chat-supplied keys,
 *  then gathers the chat-internal half + builds the pure ctx. Returns the built ctx plus the resolved memory
 *  config so the caller threads the same resolution recall uses. */
async function buildTurnContext(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly model: string;
    readonly kind: TurnKind;
    readonly castCharacterIds: readonly CharacterId[];
    /** The soul-resolved seated agents (D60) — appended to the assemble cast so an agent speaker rides the
     *  one turn path. Empty ⇒ byte-identical to a character-only room. */

    /** The muted-seat `speakerKey`s (character + agent) — threaded to `castNotMuted` for `{{groupNotMuted}}`. */
    readonly mutedSpeakerKeys: ReadonlySet<string>;
    readonly personaIds: readonly PersonaId[];
    readonly anchorPersonaId: PersonaId | null;
    /** The triggering human's active persona — binds prompt-config `{{user}}` to the speaker, not
     *  `personaIds[0]` (the presence-order-arbitrary first human). */
    readonly triggerPersonaId?: PersonaId | null | undefined;
    readonly pendingUserText?: string | undefined;
    /** rpg-design/05 §6 slot-adjacency: is this turn (re)generating the assistant slot that DIRECTLY responds
     *  to the latest user message (send / deferred-drain / swipe-of-that-slot)? Drives the rpg dice feed-forward
     *  flag + eligibility so a later GM/auto round never re-feeds a stale die. Absent ⇒ false (ineligible). */
    readonly respondsToLatestUserTurn?: boolean | undefined;
    readonly guided?: GuidedSteer | undefined;
  },
  /** SEND sink — when present and host-tier scripts resolve, writes the post-regex user text for the verb to persist. */
  out?: SendRegexSink,
): Promise<BuiltTurnContext> {
  // The GM-voice preset REDIRECT early hop (rpg-design/02 §1.1 #1) — resolved BEFORE the foreign preset read so
  // a game turn assembles the game's gmPresetId instead of the host default. Null op / non-game ⇒ null ⇒ absent
  // ⇒ the host default (byte-identical). It rides the FOREIGN-inputs args (the established turn-knob seam).
  const presetOverride = ctx.rpg !== null ? await ctx.rpg.resolvePresetOverride(args.chatId) : null;
  const foreign = await deps.resolveForeignInputs({
    chatId: args.chatId,
    runAsUserId: args.runAsUserId,
    model: args.model,
    anchorPersonaId: args.anchorPersonaId,
    personaIds: args.personaIds,
    triggerPersonaId: args.triggerPersonaId,
    ...(presetOverride !== null ? { presetOverride } : {}),
  });
  // A game turn's GATHER (rpg-design/05 §1): the 8 rpg macros + the depth-0 reminder injection + the tool
  // names to attach. Null op / non-game ⇒ null ⇒ a byte-identical non-game turn (no macros, no injection, no tools).
  const rpg = ctx.rpg !== null ? await ctx.rpg.gatherTurnContext(args.chatId, args.pendingUserText, args.respondsToLatestUserTurn ?? false) : null;
  // The chat-crew director's GATHER (chat-crew-design/04 §1): the current guidance as ONE injection. Null op /
  // director off / no pass ⇒ null ⇒ a byte-identical non-crew turn (the byte-identity contract test pins it).
  const crew = ctx.crew !== null ? await ctx.crew.gatherTurnContext(args.chatId) : null;
  // The gather sink: the caller's SEND sink when present (so `sendUserText` still surfaces), else a private
  // one — either way `gatherMemory` stages `memoryRecall` here for the engine's per-speaker witnessed re-run.
  const sink: SendRegexSink = out ?? {};
  const assembleContext = await gatherAssembleContext(
    ctx,
    {
      chatId: args.chatId,
      runAsUserId: args.runAsUserId,
      model: args.model,
      castCharacterIds: args.castCharacterIds,

      mutedSpeakerKeys: args.mutedSpeakerKeys,
      personaIds: args.personaIds,
      generationType: GENERATION_TYPE_FOR_KIND[args.kind],
      prng: deps.prng,
      ...(args.pendingUserText !== undefined ? { pendingUserText: args.pendingUserText } : {}),
      ...(args.guided !== undefined ? { guided: args.guided } : {}),
      ...(rpg !== null ? { rpgMacros: rpg.macros, rpgInjections: rpg.injections } : {}),
      ...(crew !== null ? { crewInjections: crew.injections } : {}),
    },
    foreign,
    sink,
  );
  return {
    assembleContext,
    memoryConfig: foreign.memoryConfig,
    memoryRecall: sink.memoryRecall ?? null,
    chatBehavior: foreign.chatBehavior ?? DEFAULT_CHAT_BEHAVIOR,
    attachedToolNames: rpg?.tools ?? [],
    respondsToLatestUserTurn: args.respondsToLatestUserTurn ?? false,
  };
}

/** Persists a user message (a fresh slot + its one variant) and emits `messageCommitted`. Persists exactly
 *  the content it's handed — the caller resolves the post-regex text.
 *
 *  Seq TOCTOU: the user-row seq is allocated outside the engine's per-chat lock (acquired later, for the AI
 *  turn). Two concurrent same-chat sends can read the same head and collide on the `messages (chatId, seq)`
 *  unique. This retries once on that violation: the loser re-derives the now-higher head and re-mints ids.
 *  The failed batch rolls back atomically before any emit, so the retry never double-commits. */
async function persistUserMessage(
  ctx: ChatContext,
  emit: TurnDeps["emit"],
  args: {
    readonly chatId: ChatId;
    readonly content: string;
    readonly authorUserId: UserId;
    readonly personaId: PersonaId | null;
    readonly hostUserId: UserId;
    /** Ownership-verified attachment ids (the caller ran the trust boundary). Empty ⇒ a plain message. */
    readonly attachmentAssetIds: readonly AssetId[];
  },
): Promise<MessageView> {
  const now = ctx.now();
  const attempt = async (): Promise<MessageView> => {
    const params = {
      messageId: ctx.newMessageId(),
      variantId: ctx.newMessageVariantId(),
      chatId: args.chatId,
      seq: (await loadMaxMessageSeq(ctx.db, args.chatId)) + 1,
      role: "user" as const,
      authorUserId: args.authorUserId,
      personaId: args.personaId,
      now,
      variant: { content: args.content },
    };
    const statements = insertCanonMessageStatements(ctx.db, params);
    // Attachment rows ride the same atomic batch, keyed on this attempt's messageId so a retry re-links correctly.
    statements.push(
      ...insertMessageAssetStatements(ctx.db, {
        rows: args.attachmentAssetIds.map((assetId) => ({
          id: ctx.newMessageAssetId(),
          messageId: params.messageId,
          assetId,
        })),
        now,
      }),
    );
    // characterId null — the stats rebuild's per-char grain is assistant-only.
    ctx.applyStatsDelta(statements, ctx.db, userMessageDelta({ ownerId: args.hostUserId, characterId: null, content: args.content, now }));
    await ctx.db.batch(batchMany(statements));
    return buildCommittedMessageView(params);
  };
  const view = await attempt().catch((err: unknown) => {
    if (isConstraintViolation(err)?.kind === "unique") {
      return attempt();
    }
    throw err;
  });
  await emit({ type: "messageCommitted", chatId: args.chatId, messageId: view.id, view });
  void ctx.emitChatChanged(args.chatId);
  return view;
}

/** Arbitrates who speaks. An `@mention`/forced target hard-overrides any policy; `smart` (no forced) runs
 *  the side-LLM. Maps resolved ids back to their cast names. */
async function arbitrate(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly group: GroupConfig;
    readonly candidates: readonly ArbiterCandidate[];
    readonly castNames: readonly CastName[];
    readonly forcedIds?: readonly CharacterId[] | undefined;
    readonly lastSpeaker: SpeakerRef | null;
    readonly recentHistory: string;
    readonly maxSpeakers?: number | undefined;
  },
): Promise<CastName[]> {
  const forced = args.forcedIds ?? [];
  let refs: readonly SpeakerRef[];
  if (args.group.policy === "smart" && forced.length === 0) {
    refs = await smartArbitrateVia({
      summarize: ctx.summarize,
      candidates: args.candidates,
      castNames: args.castNames,
      recentHistory: args.recentHistory,
      lastSpeaker: args.lastSpeaker,
      rng: deps.prng,
    });
  } else {
    refs = selectSpeakersVia({
      candidates: args.candidates,
      policy: args.group.policy,
      lastSpeaker: args.lastSpeaker,
      forcedIds: forced,
      rng: deps.prng,
      maxSpeakers: args.maxSpeakers,
    });
  }
  const byKey = new Map(args.castNames.map((c) => [speakerKey(c.ref), c] as const));
  return refs.flatMap((ref) => {
    const c = byKey.get(speakerKey(ref));
    return c !== undefined ? [c] : [];
  });
}

/** Coerces a room config to `per-speaker` for a single forced character, so a narrator room still forces a
 *  per-speaker turn for the named character. */
function asPerSpeaker(group: GroupConfig): GroupConfig {
  if (group.output === "per-speaker") {
    return group;
  }
  return {
    output: "per-speaker",
    policy: group.policy,
    cardScope: "merged",
    speakerTags: group.speakerTags,
    groupNudge: group.groupNudge,
    autoMode: group.autoMode,
    autoModeMaxTurns: group.autoModeMaxTurns,
    autoModeDelayMs: group.autoModeDelayMs,
    allowSelfResponses: group.allowSelfResponses,
    memberCardVisibility: group.memberCardVisibility,
  };
}

/** Runs the auto-mode AI→AI chain after a human-triggered round: re-arbitrates one speaker per iteration
 *  (ban-last unless `allowSelfResponses`), drives a single-speaker round, repeats to the bound/interrupt/
 *  no-eligible/lock. Every chained turn is `triggeredBy` the chain-starter. */
async function runChain(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly base: RoundBase;
    readonly group: GroupConfig;
    readonly room: Room;
    readonly groupCharacterId: CharacterId | null;
    readonly castName: string;
    readonly signal: AbortSignal;
    readonly initialLastSpeaker: SpeakerRef | null;
  },
): Promise<AutoModeResult> {
  return await runAutoModeVia({
    maxTurns: args.group.autoModeMaxTurns,
    delayMs: args.group.autoModeDelayMs,
    delay: deps.delay,
    signal: args.signal,
    initialLastSpeaker: args.initialLastSpeaker,
    nextSpeaker: async (last) => {
      const facts = await canonFacts(ctx, args.base.chatId);
      const speakers = await arbitrate(ctx, deps, {
        group: args.group,
        candidates: args.room.candidates,
        castNames: args.room.castNames,
        lastSpeaker: args.group.allowSelfResponses ? null : last,
        recentHistory: facts.recentHistory,
        maxSpeakers: 1,
      });
      return speakers[0] ?? null;
    },
    runTurn: async (speaker) =>
      await driveRoundVia({
        engine: deps.engine,
        base: { ...args.base, kind: "auto" },
        group: args.group,
        speakers: [speaker],
        groupCharacterId: args.groupCharacterId,
        castName: args.castName,
      }),
  });
}

/** The shared AI-response body of a human `send` AND a drained deferred turn: arbitrate the responder(s) off
 *  the committed canon, mint the narrator group-character when needed, drive the round, then (if autoMode)
 *  chain AI→AI. Returns the round OUTCOME — the committed rows PLUS whether it aborted mid-round (so `send`
 *  propagates the truth instead of hardcoding `aborted:false`). A mid-round abort STOPS before the auto-mode
 *  chain: the caller cancelled, so we do not start an AI→AI chain on top of the cancelled round. Both callers
 *  owe the same "who speaks next" response — the only difference is the caller persists a user line first
 *  (send) or not (drain). */
async function runAiRound(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly base: RoundBase;
    readonly group: GroupConfig;
    readonly room: Room;
    readonly signal: AbortSignal;
    /** Human `@mention` hard-override (send only). A drained turn re-arbitrates naturally — the pending row
     *  carries no message text to parse. */
    readonly forcedIds?: readonly CharacterId[] | undefined;
    /** Whether to run the auto-mode AI→AI chain after the human-triggered round. Absent/true for a human send
     *  or drain (the host's autoMode setting governs). A non-human `requestTurn` passes `false` — an autonomous
     *  trigger is ONE injected beat, never a chain (bounded spend; the room's autoMode is a human affordance). */
    readonly chain?: boolean | undefined;
  },
): Promise<TurnOutcome> {
  const facts = await canonFacts(ctx, args.base.chatId);
  const speakers = await arbitrate(ctx, deps, {
    group: args.group,
    candidates: args.room.candidates,
    castNames: args.room.castNames,
    forcedIds: args.forcedIds,
    lastSpeaker: facts.lastSpeaker,
    recentHistory: facts.recentHistory,
  });
  const groupCharacterId =
    args.group.output === "narrator"
      ? (
          await ctx.mintSyntheticGroupCharacter({
            ownerId: args.base.runAsUserId,
            chatId: args.base.chatId,
          })
        ).characterId
      : null;
  const castName = joinedCastName(args.room.castNames);
  const round = await driveRoundVia({
    engine: deps.engine,
    base: args.base,
    group: args.group,
    speakers,
    groupCharacterId,
    castName,
  });
  const committed: MessageView[] = [...round.messages];
  if (round.aborted && round.abortReason !== undefined) {
    return { messages: committed, aborted: true, abortReason: round.abortReason };
  }
  if (args.group.autoMode && (args.chain ?? true)) {
    const auto = await runChain(ctx, deps, {
      base: args.base,
      group: args.group,
      room: args.room,
      groupCharacterId,
      castName,
      signal: args.signal,
      initialLastSpeaker: lastSpeakerRef(round.messages.findLast((m) => m.role === "assistant")),
    });
    committed.push(...auto.messages);
  }
  return { messages: committed, aborted: false, abortReason: undefined };
}

/** Host-offline defer decision (Part III §5): a NON-host member's send while the funding host is dark queues
 *  the owed AI turn as a durable, NOT-lock-held `pending_turns` row (the frozen identity triple) instead of
 *  running it — the 5-min turn-lock would stale-takeover into a double-run. A host's OWN send never defers
 *  (they are present by definition, making the request). Returns true iff the turn was deferred. */
async function deferIfHostOffline(
  ctx: ChatContext,
  args: {
    readonly principalUserId: UserId;
    readonly triggeredBy: UserId;
    readonly runAsUserId: UserId;
    readonly chatId: ChatId;
  },
): Promise<boolean> {
  if (args.principalUserId === args.runAsUserId || (await ctx.readPresence(args.runAsUserId)).online) {
    return false;
  }
  await insertPendingTurn(ctx.db, {
    id: ctx.newPendingTurnId(),
    chatId: args.chatId,
    triggeredBy: args.triggeredBy,
    runAsUserId: args.runAsUserId,
    createdAt: ctx.now(),
  });
  return true;
}

/**
 * The greeting first-user-turn volatile freeze. When the first user message locks the conversation in, bakes
 * each greeting's nondeterministic macros against the turn's pinned clock + seeded PRNG so they stop shipping
 * the literal `{{roll}}` forever. Identity macros stay raw/per-view so the anchor can still re-resolve.
 *
 * Freezes the selected variant of each pre-first-turn greeting row; idempotent (a frozen row emits no write
 * on a repeat pass), so it's also safe under the concurrent-send retry. A later swipe to an unfrozen
 * alternate is not re-frozen — there is no subsequent "first turn" to catch it.
 */
async function freezeGreetingVolatiles(ctx: ChatContext, deps: TurnDeps, assembleContext: AssembleContext, priorCanon: readonly MessageView[]): Promise<void> {
  const stmts = priorCanon.flatMap((m) => {
    if (m.role !== "assistant") {
      return [];
    }
    const frozen = freezeVolatileMacros(m.content, assembleContext, { random: deps.prng });
    return frozen === m.content ? [] : [setVariantContentStatement(ctx.db, m.selectedVariantId, frozen, m.reasoning)];
  });
  if (stmts.length > 0) {
    await ctx.db.batch(batchMany(stmts));
  }
}

/** Trust boundary: every claimed attachment id must be owned by the actor. A foreign/gone id is absent from
 *  the owned subset → a leak-free `attachment_not_owned` refusal. No-op for an attachment-free send. */
async function assertAttachmentsOwned(ctx: ChatContext, principalUserId: UserId, chatId: ChatId, attachments: readonly AssetId[]): Promise<void> {
  if (attachments.length === 0) {
    return;
  }
  const owned = new Set(await ctx.filterOwnedAssetIds(principalUserId, attachments));
  const foreign = attachments.find((id) => !owned.has(id));
  if (foreign !== undefined) {
    throw new ChatOperationError(CHAT_OP_CODES.attachmentNotOwned, `chat ${chatId}: attachment ${foreign} is not owned by the sender`);
  }
}

// ── PD-146 post-round auto-behaviors (server home for the schema-real UserSettings.chat auto-* knobs) ──
// neo honors these CLIENT-side (use-chat-verbs) by re-issuing continue/swipe after the send resolves; orb is
// server-authoritative, so the send verb runs them in-band and joins the follow-up rows onto its outcome.
// continueOnSend has NO arm here — it is a purely CLIENT behavior (the composer calls chat.continueTurn on an
// empty send; verified against neo, whose continueOnSend lives only in use-pref-sections/the composer). Its
// server-read field stays inert BY DESIGN.

/** The bound on each auto-behavior — ONE follow-up, never a loop (neo parity: a model that keeps hitting the
 *  length cap needs a bigger `maxOutputTokens`, and one that keeps producing rejects needs a different prompt
 *  — not an unbounded spend). Written as a bounded re-check so the shape stays extensible. */
const AUTO_CONTINUE_MAX = 1;
const AUTO_SWIPE_MAX = 1;

/** The auxiliary verbs the send's post-round auto-behaviors re-enter (built once at {@link createTurn}). Each
 *  re-runs the full member gate under the SAME principal + registers its OWN abort handle, so a user abort
 *  during a follow-up is caught through the normal `abort(chatId, userId)` path. */
interface AutoBehaviorDeps {
  readonly swipe: ChatService["swipe"];
  readonly continueTurn: ChatService["continueTurn"];
}

/** The tail assistant reply of a committed set — the row the auto-behaviors inspect (neo reads `.at(-1)`). */
function tailAssistant(messages: readonly MessageView[]): MessageView | undefined {
  return messages.findLast((m) => m.role === "assistant");
}

/** The auto-swipe rejection predicate (neo parity): the reply is too short (fewer than `minLength` chars) OR
 *  contains a blacklisted phrase (case-insensitive substring; empty phrases ignored). */
function isAutoSwipeRejected(content: string, cfg: ChatBehaviorInputs["autoSwipe"]): boolean {
  const tooShort = content.length < cfg.minLength;
  const blacklisted = cfg.blacklist.some((phrase) => phrase.length > 0 && content.toLowerCase().includes(phrase.toLowerCase()));
  return tooShort || blacklisted;
}

/** Runs ONE auto-behavior follow-up (swipe/continue) and returns its committed tip, or null on any failure —
 *  non-fatal, mirroring neo: the already-committed reply stands and the loop stops. */
async function runAutoFollowUp(run: () => Promise<TurnOutcome>): Promise<MessageView | null> {
  try {
    const outcome = await run();
    return outcome.messages.at(-1) ?? null;
  } catch {
    return null;
  }
}

/** The resolved auto-behavior frame: the acting principal + chat + the abort signal that short-circuits a
 *  follow-up loop, shared by the swipe/continue loops. */
interface AutoFrame {
  readonly principal: SendParams["principal"];
  readonly chatId: ChatId;
  readonly signal: AbortSignal;
}

/** The bounded auto-swipe loop: regenerate the rejected reply, re-checking each fresh variant, up to the
 *  bound. `tip` enters rejected (the caller's precedence gate proved it); stops when a variant passes, the
 *  bound is hit, a swipe fails, or abort fires. */
async function runAutoSwipe(auto: AutoBehaviorDeps, frame: AutoFrame, tip: MessageView, cfg: ChatBehaviorInputs["autoSwipe"]): Promise<MessageView[]> {
  const rows: MessageView[] = [];
  let current = tip;
  for (let i = 0; i < AUTO_SWIPE_MAX && !frame.signal.aborted; i += 1) {
    const target = current;
    // biome-ignore lint/performance/noAwaitInLoops: each swipe re-checks the prior variant + takes the per-chat lock — inherently sequential (bound 1).
    const next = await runAutoFollowUp(() => auto.swipe({ principal: frame.principal, chatId: frame.chatId, messageId: target.id }));
    if (next === null) {
      break;
    }
    rows.push(next);
    current = next;
    if (!isAutoSwipeRejected(next.content, cfg)) {
      break;
    }
  }
  return rows;
}

/** The bounded auto-continue loop: extend a length-capped reply via one continue, up to the bound. Stops
 *  when the tip no longer finished at the length cap, the bound is hit, a continue fails, or abort fires. */
async function runAutoContinue(auto: AutoBehaviorDeps, frame: AutoFrame, tip: MessageView): Promise<MessageView[]> {
  const rows: MessageView[] = [];
  let current = tip;
  for (let i = 0; i < AUTO_CONTINUE_MAX && !frame.signal.aborted; i += 1) {
    if (current.role !== "assistant" || current.finishReason !== "length") {
      break;
    }
    const target = current;
    // biome-ignore lint/performance/noAwaitInLoops: each continue extends the prior tip + takes the per-chat lock — inherently sequential (bound 1).
    const next = await runAutoFollowUp(() => auto.continueTurn({ principal: frame.principal, chatId: frame.chatId, messageId: target.id }));
    if (next === null) {
      break;
    }
    rows.push(next);
    current = next;
  }
  return rows;
}

/**
 * The PD-146 post-round auto-behaviors, run at the verb level AFTER the engine released its per-chat lock
 * (each follow-up re-acquires it fresh): auto-swipe takes PRECEDENCE over auto-continue — they are mutually
 * exclusive (a too-short reply isn't a length-capped one). Returns the committed follow-up rows oldest-first,
 * so the send joins them onto its outcome. Gated on the host's settings — all-off ⇒ [] ⇒ byte-identical.
 */
async function runAutoBehaviors(
  auto: AutoBehaviorDeps,
  args: {
    readonly principal: SendParams["principal"];
    readonly chatId: ChatId;
    readonly committed: readonly MessageView[];
    readonly behavior: ChatBehaviorInputs;
    readonly signal: AbortSignal;
  },
): Promise<MessageView[]> {
  const tip = tailAssistant(args.committed);
  if (tip === undefined || args.signal.aborted) {
    return [];
  }
  const frame: AutoFrame = { principal: args.principal, chatId: args.chatId, signal: args.signal };
  if (args.behavior.autoSwipe.enabled && isAutoSwipeRejected(tip.content, args.behavior.autoSwipe)) {
    return await runAutoSwipe(auto, frame, tip, args.behavior.autoSwipe);
  }
  if (args.behavior.autoContinue) {
    return await runAutoContinue(auto, frame, tip);
  }
  return [];
}

/** Joins the AI round's outcome to the just-committed user row into the send's `TurnOutcome`. A round that
 *  aborted mid-flight (caller cancel / lock-stale) returns the aborted truth with the rows that landed before
 *  it — NO PD-146 follow-up on a cancelled round (`runAutoBehaviors` short-circuits on the aborted signal
 *  anyway; this makes the intent explicit and carries the abort reason). Otherwise runs the host's post-round
 *  auto-behaviors and joins their rows. */
async function assembleSendResult(
  auto: AutoBehaviorDeps,
  args: {
    readonly principal: SendParams["principal"];
    readonly chatId: ChatId;
    readonly userView: MessageView;
    readonly round: TurnOutcome;
    readonly behavior: ChatBehaviorInputs;
    readonly signal: AbortSignal;
  },
): Promise<TurnOutcome> {
  if (args.round.aborted) {
    return {
      messages: [args.userView, ...args.round.messages],
      aborted: true,
      ...(args.round.abortReason !== undefined ? { abortReason: args.round.abortReason } : {}),
    };
  }
  // PD-146 post-round auto-behaviors: auto-swipe (too-short/blacklisted reply) takes precedence over
  // auto-continue (length-capped reply) — a reply can't be both. Gated on the host's settings (all-off ⇒ no
  // follow-up, byte-identical), bounded, abort-aware; every follow-up row joins the send's result.
  const followUps = await runAutoBehaviors(auto, {
    principal: args.principal,
    chatId: args.chatId,
    committed: args.round.messages,
    behavior: args.behavior,
    signal: args.signal,
  });
  return { messages: [args.userView, ...args.round.messages, ...followUps], aborted: false };
}

/** Fire-and-forget the rpg SEND-path COMMIT (rpg-design/05 §0): after the user row lands, lock in the prior
 *  assistant turn's snapshot the user was replying to (+ consume queued dice). Null op = non-rpg chat
 *  (byte-identical no-op); fire-and-forget so a background snapshot-commit never blocks or fails the send. */
function fireRpgUserCommit(ctx: ChatContext, chatId: ChatId, messageId: MessageId): void {
  if (ctx.rpg !== null) {
    void ctx.rpg.onUserCommit(chatId, messageId).catch(() => undefined);
  }
}

/** `send` — persist the user message, build the one immutable assemble ctx, arbitrate the responders, drive
 *  the round, then (if autoMode) chain AI→AI, then (PD-146) run the host's post-round auto-behaviors.
 *  Member-gated; AI turns run as the host. */
function createSend(ctx: ChatContext, deps: TurnDeps, auto: AutoBehaviorDeps): ChatService["send"] {
  return async ({ principal, chatId, content, personaId, attachmentAssetIds, intent, guided }: SendParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const attachments = attachmentAssetIds ?? [];
    await assertAttachmentsOwned(ctx, principal.userId, chatId, attachments);
    const room = await loadRoom(ctx, chatId);
    const identity = resolveTurnIdentityVia({
      principalUserId: principal.userId,
      hostUserId: room.hostUserId,
    });
    const connection = await deps.resolveConnection({
      runAsUserId: identity.runAsUserId,
      chatId,
    });
    const group = membership.chat.metadata.group ?? DEFAULT_GROUP_CONFIG;

    // Built with the pending user text in the WI haystack before the user row commits; the engine reloads
    // canon (including the committed row) for the wire history.
    const sendOut: SendRegexSink = {};
    const { assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames, respondsToLatestUserTurn } = await buildTurnContext(
      ctx,
      deps,
      {
        chatId,
        runAsUserId: identity.runAsUserId,
        model: connection.model,
        kind: "send",
        castCharacterIds: room.castCharacterIds,

        mutedSpeakerKeys: room.mutedSpeakerKeys,
        personaIds: room.personaIds,
        anchorPersonaId: membership.chat.anchorPersonaId,
        // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back (mirrors the row-stamp expression below).
        triggerPersonaId: personaId !== undefined ? personaId : membership.activePersonaId,
        pendingUserText: content,
        // A send's AI response directly responds to the just-committed user message (rpg-design/05 §6): the
        // player's queued d20 feeds its first skill check. Always true for a send.
        respondsToLatestUserTurn: true,
        guided,
      },
      sendOut,
    );

    // A greeting's volatile macros freeze at the first user turn; detect it before this send commits (no
    // role:"user" row exists yet), then bake the greetings after the row lands.
    const priorCanon = await loadCanonHistory(ctx.db, chatId);
    const isFirstUserTurn = !priorCanon.some((m) => m.role === "user");

    const userView = await persistUserMessage(ctx, deps.emit, {
      chatId,
      content: composeBodyWithAttachments(sendOut.sendUserText ?? content, attachments),
      authorUserId: principal.userId,
      // An omitted personaId stamps the acting participant's active persona; an explicit id (or null) wins.
      // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back.
      personaId: personaId !== undefined ? personaId : membership.activePersonaId,
      hostUserId: room.hostUserId,
      attachmentAssetIds: attachments,
    });

    if (isFirstUserTurn) {
      await freezeGreetingVolatiles(ctx, deps, assembleContext, priorCanon);
    }

    fireRpgUserCommit(ctx, chatId, userView.id);

    // Host-offline → DEFER the AI response (Part III §5): the member's message is durable canon, but the owed
    // AI turn cannot run on the host's dark box, so it queues instead of running. The user row stands alone.
    if (
      await deferIfHostOffline(ctx, {
        principalUserId: principal.userId,
        triggeredBy: identity.triggeredBy,
        runAsUserId: identity.runAsUserId,
        chatId,
      })
    ) {
      return { messages: [userView], aborted: false };
    }

    // Registered before base so the abort signal threads into every round turn + the auto-mode chain.
    const handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "send",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      respondsToLatestUserTurn,
      signal: handle.signal,
    };

    try {
      const round = await runAiRound(ctx, deps, {
        base,
        group,
        room,
        signal: handle.signal,
        forcedIds: resolveMentionsVia(content, room.castNames),
      });
      return await assembleSendResult(auto, { principal, chatId, userView, round, behavior: chatBehavior, signal: handle.signal });
    } finally {
      handle.release();
    }
  };
}

/** `forceCharacterTurn` — host-only. Force a present roster character to speak next (per-speaker; no user
 *  row). Eligibility is presence-only (`leftSeq === null`) — a muted member is still force-summonable, since
 *  mute only excludes from natural/smart auto-selection, not an explicit host override. A non-member / left /
 *  unknown target is a leak-free NOT_FOUND. */
function createForceCharacterTurn(ctx: ChatContext, deps: TurnDeps): ChatService["forceCharacterTurn"] {
  return async ({ principal, chatId, characterId, intent, guided }: ForceCharacterTurnParams): Promise<TurnOutcome> => {
    const membership = await requireHost(ctx, principal, chatId);
    const room = await loadRoom(ctx, chatId);
    const identity = resolveTurnIdentityVia({
      principalUserId: principal.userId,
      hostUserId: room.hostUserId,
    });
    const target = room.castNames.find((c) => c.ref.characterId === characterId);
    // Presence-only (leftSeq === null), not the stricter isArbiterEligible: a host can force-turn a muted member.
    const present = room.candidates.some((c) => c.ref.characterId === characterId && c.leftSeq === null);
    if (target === undefined || !present) {
      throw new ChatNotFoundError(chatId);
    }
    const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
    const group = asPerSpeaker(membership.chat.metadata.group ?? DEFAULT_GROUP_CONFIG);
    const { assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames } = await buildTurnContext(ctx, deps, {
      chatId,
      runAsUserId: identity.runAsUserId,
      model: connection.model,
      kind: "force",
      castCharacterIds: room.castCharacterIds,

      mutedSpeakerKeys: room.mutedSpeakerKeys,
      personaIds: room.personaIds,
      anchorPersonaId: membership.chat.anchorPersonaId,
      triggerPersonaId: membership.activePersonaId,
      guided,
    });
    const handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "force",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      signal: handle.signal,
    };
    try {
      const round = await driveRoundVia({
        engine: deps.engine,
        base,
        group,
        speakers: [target],
        groupCharacterId: null,
        castName: target.name,
      });
      return {
        messages: round.messages,
        aborted: round.aborted,
        ...(round.abortReason !== undefined ? { abortReason: round.abortReason } : {}),
      };
    } finally {
      handle.release();
    }
  };
}

/** `abort` — cancel the caller's in-flight turn(s) for the chat. Owner-only: a caller who owns none while
 *  another user's turn is in flight is refused `not_turn_owner`. A no-in-flight abort is an idempotent no-op. */
function createAbort(ctx: ChatContext, deps: TurnDeps): ChatService["abort"] {
  return async ({ principal, chatId }: AbortParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    const { aborted, foreignInFlight } = deps.activeTurns.abort(chatId, principal.userId);
    if (aborted === 0 && foreignInFlight) {
      throw new ChatOperationError(CHAT_OP_CODES.notTurnOwner, `chat ${chatId}: cannot abort a turn you do not own`);
    }
  };
}

// The single-speaker auxiliary turns (swipe / continue / impersonate / generate) target one slot/speaker
// (no arbitration/round) and share a preamble + a registered engine run.

/** The resolved single-turn substrate — assumes `requireParticipant`/`requireHost` already ran. */
interface TurnBase {
  readonly room: Room;
  readonly identity: { readonly triggeredBy: UserId; readonly runAsUserId: UserId };
  readonly connection: ResolvedConnection;
  readonly assembleContext: AssembleContext;
  readonly memoryConfig: MemoryConfig | null | undefined;
  /** The round-level recall inputs for the engine's per-speaker witnessed re-run (D6); threaded onto each
   *  auxiliary prep. `null` ⇒ no per-speaker recall (round-level `memory` stands). */
  readonly memoryRecall: MemoryRecallInputs | null;
  /** The host's resolved turn-behavior arm (PD-146) — the custom stops each auxiliary prep threads onto
   *  the request. Defaulted to all-off. */
  readonly chatBehavior: ChatBehaviorInputs;
  /** A game turn's gather-contributed tool names (rpg-design/05 §1) — threaded onto each auxiliary prep's
   *  `attachedToolNames`. Empty for a non-game turn / until the rpg registry lands (byte-identical). */
  readonly attachedToolNames: readonly string[];
  /** rpg-design/05 §6 slot-adjacency: does this auxiliary turn's slot directly respond to the latest user
   *  message (only `swipe` of the die-response can — the rest are false)? Threaded onto the prep. */
  readonly respondsToLatestUserTurn: boolean;
}

/** Resolves the {@link TurnBase} for an auxiliary turn. The AI runs as the host. These turns add no new user
 *  line, so there is no `pendingUserText` to fold into the WI haystack. */
async function resolveTurnBase(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly principal: SendParams["principal"];
    readonly chatId: ChatId;
    readonly kind: TurnKind;
    readonly anchorPersonaId: PersonaId | null;
    /** The triggering human's active persona — binds prompt-config `{{user}}` to the speaker, not
     *  `personaIds[0]`. */
    readonly triggerPersonaId?: PersonaId | null | undefined;
    /** rpg-design/05 §6 slot-adjacency verdict (only `swipe` of the die-response passes true). Default false. */
    readonly respondsToLatestUserTurn?: boolean | undefined;
    readonly guided?: GuidedSteer | undefined;
  },
): Promise<TurnBase> {
  const { principal, chatId } = args;
  const room = await loadRoom(ctx, chatId);
  const identity = resolveTurnIdentityVia({
    principalUserId: principal.userId,
    hostUserId: room.hostUserId,
  });
  const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
  const { assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames, respondsToLatestUserTurn } = await buildTurnContext(ctx, deps, {
    chatId,
    runAsUserId: identity.runAsUserId,
    model: connection.model,
    kind: args.kind,
    castCharacterIds: room.castCharacterIds,

    mutedSpeakerKeys: room.mutedSpeakerKeys,
    personaIds: room.personaIds,
    anchorPersonaId: args.anchorPersonaId,
    triggerPersonaId: args.triggerPersonaId,
    ...(args.respondsToLatestUserTurn !== undefined ? { respondsToLatestUserTurn: args.respondsToLatestUserTurn } : {}),
    guided: args.guided,
  });
  return { room, identity, connection, assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames, respondsToLatestUserTurn };
}

/** Runs one engine turn under an active-turns registration, threading the abort signal into the engine and
 *  releasing the handle in a `finally`. */
async function runRegistered(deps: TurnDeps, chatId: ChatId, triggeredBy: UserId, prep: Omit<TurnPrep, "signal">): Promise<TurnOutcome> {
  const handle = deps.activeTurns.register(chatId, triggeredBy);
  try {
    return await deps.engine.runTurn({ ...prep, signal: handle.signal });
  } finally {
    handle.release();
  }
}

/** The shape for an auxiliary turn voicing a known roster character. Returns undefined (⇒ ctx primary) when
 *  the name can't be resolved (a deleted character). */
function speakerShapeFor(room: Room, characterId: CharacterId | null): TurnPrep["shape"] {
  if (characterId === null) {
    return; // a non-character slot has no per-speaker character shape.
  }
  const name = room.castNames.find((c) => c.ref.characterId === characterId)?.name;
  if (name === undefined || name.length === 0) {
    return;
  }
  return {
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    speakerName: name,
    speakerRef: { kind: "character", characterId },
  };
}

/** `swipe` — reroll an assistant slot: regenerate from the context before the slot and append the result as
 *  a new selected variant. `regenerate` is swipe on the last assistant message. A non-assistant / missing
 *  target is NOT_FOUND. */
function createSwipe(ctx: ChatContext, deps: TurnDeps): ChatService["swipe"] {
  return async ({ principal, chatId, messageId, intent, guided }: SwipeParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    // Chat-scoped load: a messageId from another chat matches nothing, so a member can't swipe-append another room's canon.
    const target = await loadSlotTarget(ctx.db, chatId, messageId);
    if (target === undefined || target.role !== "assistant") {
      throw new ChatNotFoundError(chatId);
    }
    // rpg-design/05 §6: a swipe re-feeds the SAME queued d20 ONLY when it regenerates the slot that directly
    // responds to the die-bearing latest user message (no swipe-fishing for a better roll; a swipe of an older
    // slot, or after a later reply landed, is ineligible).
    const respondsToLatestUserTurn = await loadIsReplyToLatestUserMessage(ctx.db, chatId, messageId);
    const { room, identity, connection, assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames } = await resolveTurnBase(ctx, deps, {
      principal,
      chatId,
      kind: "swipe",
      anchorPersonaId: membership.chat.anchorPersonaId,
      triggerPersonaId: membership.activePersonaId,
      respondsToLatestUserTurn,
      guided,
    });
    const shape = speakerShapeFor(room, target.characterId);
    return await runRegistered(deps, chatId, identity.triggeredBy, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "swipe",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      respondsToLatestUserTurn,
      speakerCharacterId: target.characterId,
      persist: { mode: "append-variant", targetMessageId: messageId },
      ...(shape !== undefined ? { shape } : {}),
    });
  };
}

// continueTurn: extend the tail assistant message in place, snapshotting for undo.
/** `continueTurn` — extend an assistant slot's selected variant in place: the model sees the canon THROUGH the
 *  slot (+ a continue nudge) and the generated text is APPENDED to the variant, snapshotting `preContinue*` so
 *  `undoContinue` can restore it (D26). A non-assistant / missing target is a leak-free NOT_FOUND. */
function createContinueTurn(ctx: ChatContext, deps: TurnDeps): ChatService["continueTurn"] {
  return async ({ principal, chatId, messageId, intent, guided }: ContinueTurnParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    // Chat-scoped load: a messageId from another chat matches nothing, so a member can't continue-append another room's canon.
    const target = await loadSlotTarget(ctx.db, chatId, messageId);
    if (target === undefined || target.role !== "assistant") {
      throw new ChatNotFoundError(chatId);
    }
    const { room, identity, connection, assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames } = await resolveTurnBase(ctx, deps, {
      principal,
      chatId,
      kind: "continue",
      anchorPersonaId: membership.chat.anchorPersonaId,
      triggerPersonaId: membership.activePersonaId,
      guided,
    });
    const shape = speakerShapeFor(room, target.characterId);
    return await runRegistered(deps, chatId, identity.triggeredBy, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "continue",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      speakerCharacterId: target.characterId,
      appendUserTurn: CONTINUE_NUDGE,
      persist: { mode: "continue", targetMessageId: messageId },
      ...(shape !== undefined ? { shape } : {}),
    });
  };
}

/** `impersonate` — generate the user's next line in the active persona's voice and persist it as a
 *  role:"user" slot, authored by the responsible human + the chosen persona. */
function createImpersonate(ctx: ChatContext, deps: TurnDeps): ChatService["impersonate"] {
  return async ({ principal, chatId, personaId, intent, guided }: ImpersonateParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const { identity, connection, assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames } = await resolveTurnBase(ctx, deps, {
      principal,
      chatId,
      kind: "impersonate",
      anchorPersonaId: membership.chat.anchorPersonaId,
      // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back (mirrors the slot stamp below).
      triggerPersonaId: personaId !== undefined ? personaId : membership.activePersonaId,
      guided,
    });
    return await runRegistered(deps, chatId, identity.triggeredBy, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "impersonate",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      speakerCharacterId: null,
      appendUserTurn: IMPERSONATE_NUDGE,
      persist: {
        mode: "new-slot",
        role: "user",
        authorUserId: identity.triggeredBy,
        // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back.
        personaId: personaId !== undefined ? personaId : membership.activePersonaId,
      },
    });
  };
}

/** `generate` — a lock-free auxiliary assistant generation: runs concurrent with a locked `send`. Commits a
 *  new assistant slot for the named speaker (or the primary character). */
function createGenerate(ctx: ChatContext, deps: TurnDeps): ChatService["generate"] {
  return async ({ principal, chatId, speakerCharacterId, intent, guided }: GenerateParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const { room, identity, connection, assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames } = await resolveTurnBase(ctx, deps, {
      principal,
      chatId,
      kind: "generate",
      anchorPersonaId: membership.chat.anchorPersonaId,
      triggerPersonaId: membership.activePersonaId,
      guided,
    });
    const speaker = speakerCharacterId ?? primaryCharacterId(room);
    const shape = speakerShapeFor(room, speaker);
    return await runRegistered(deps, chatId, identity.triggeredBy, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "generate",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      speakerCharacterId: speaker,
      lockFree: true,
      ...(shape !== undefined ? { shape } : {}),
    });
  };
}

/** Restores an assistant slot's selected variant from its continue snapshot: undo drops the last
 *  continuation, revert re-applies it. A never-continued variant is refused `no_continuation`. */
async function restoreContinue(
  ctx: ChatContext,
  emit: TurnDeps["emit"],
  args: {
    readonly chatId: ChatId;
    readonly messageId: MessageId;
    readonly direction: "undo" | "revert";
  },
): Promise<MessageView> {
  const { chatId, messageId, direction } = args;
  // Chat-scoped load: a messageId from another chat matches nothing, so undo/revert can't mutate another room's canon.
  const snap = await loadContinueSnapshot(ctx.db, chatId, messageId);
  if (snap === undefined || snap.preContinueContent === null || snap.lastContinuationContent === null) {
    throw new ChatOperationError(CHAT_OP_CODES.noContinuation, `message ${messageId}: no continuation to ${direction}`);
  }
  const content = direction === "undo" ? snap.preContinueContent : snap.preContinueContent + snap.lastContinuationContent;
  const reasoning = direction === "undo" ? snap.preContinueReasoning : combineReasoning(snap.preContinueReasoning, snap.lastContinuationReasoning);
  await ctx.db.batch(batchMany([setVariantContentStatement(ctx.db, snap.variantId, content, reasoning)]));
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  await emit({ type: "messageCommitted", chatId, messageId: view.id, view });
  void ctx.emitChatChanged(chatId);
  return view;
}

/** `undoContinue` — revert the last continuation on a slot's variant. */
function createUndoContinue(ctx: ChatContext, deps: TurnDeps): ChatService["undoContinue"] {
  return async ({ principal, chatId, messageId }: UndoContinueParams): Promise<MessageView> => {
    await requireParticipant(ctx, principal, chatId);
    return await restoreContinue(ctx, deps.emit, { chatId, messageId, direction: "undo" });
  };
}

/** `revertContinue` — re-apply the last reverted continuation. */
function createRevertContinue(ctx: ChatContext, deps: TurnDeps): ChatService["revertContinue"] {
  return async ({ principal, chatId, messageId }: RevertContinueParams): Promise<MessageView> => {
    await requireParticipant(ctx, principal, chatId);
    return await restoreContinue(ctx, deps.emit, { chatId, messageId, direction: "revert" });
  };
}

// ── pending_turns drain — the host-offline deferred-turn reclaim (Part III §5) ──

/** A drain VERDICT drop — a PERMANENT refusal, so the claimed row stays deleted (never re-queued):
 *   • `consent_required` — the host's D17 consent belt refused a by-proxy hosted turn (an authority verdict).
 *   • `ChatNotFoundError` — the chat/host is gone (nothing left to run).
 *  Everything else RE-QUEUES: `budget_exceeded` is TEMPORAL (a spent window means "not now", not "never" — the
 *  member's owed reply waits for the next drain edge), and a transient fault (provider outage) is a retry.
 *  Drains fire only at boot + host-return edges, so a re-queued row can't hot-loop. */
function isDrainVerdictDrop(err: unknown): boolean {
  return err instanceof ChatNotFoundError || (err instanceof ChatOperationError && err.code === CHAT_OP_CODES.consentRequired);
}

/** Reconstruct + run ONE deferred AI round from a durable `pending_turns` row — no principal, no new user
 *  line: the row's frozen triple (`triggeredBy`/`runAsUserId`) funds it and the engine's in-lock belts
 *  re-validate consent + budget. Throws a coded refusal (→ the drain drops the row) or completes (→ the drain
 *  deletes it). Cards + assemble resolve under the row's frozen host; a mid-defer host-handoff funds the
 *  frozen host per D19. */
async function runDeferredRound(
  ctx: ChatContext,
  deps: TurnDeps,
  row: { readonly chatId: ChatId; readonly triggeredBy: UserId; readonly runAsUserId: UserId },
): Promise<void> {
  const chat = await loadChatRow(ctx.db, row.chatId);
  if (chat === undefined) {
    throw new ChatNotFoundError(row.chatId);
  }
  const room = await loadRoom(ctx, row.chatId); // hostless/gone → ChatNotFoundError (a drop)
  const connection = await deps.resolveConnection({
    runAsUserId: row.runAsUserId,
    chatId: row.chatId,
  });
  const group = chat.metadata.group ?? DEFAULT_GROUP_CONFIG;
  const { assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames, respondsToLatestUserTurn } = await buildTurnContext(ctx, deps, {
    chatId: row.chatId,
    runAsUserId: row.runAsUserId,
    model: connection.model,
    kind: "send",
    castCharacterIds: room.castCharacterIds,

    mutedSpeakerKeys: room.mutedSpeakerKeys,
    personaIds: room.personaIds,
    anchorPersonaId: chat.anchorPersonaId,
    // No live triggering human at drain — {{user}} binds to the chat anchor, not a presence-order human.
    triggerPersonaId: null,
    // A deferred drain is the FIRST AI response to the offline-host's committed user send (rpg-design/05 §6) —
    // it directly responds to that user message, so its queued d20 still feeds (the die wasn't lost to the defer).
    respondsToLatestUserTurn: true,
  });
  const handle = deps.activeTurns.register(row.chatId, row.triggeredBy);
  const base: RoundBase = {
    chatId: row.chatId,
    assembleContext,
    connection,
    triggeredBy: row.triggeredBy,
    runAsUserId: row.runAsUserId,
    kind: "send",
    intent: {},
    extraStopSequences: chatBehavior.customStoppingStrings,
    memoryConfig,
    ...(memoryRecall !== null ? { memoryRecall } : {}),
    attachedToolNames,
    respondsToLatestUserTurn,
    signal: handle.signal,
  };
  try {
    await runAiRound(ctx, deps, { base, group, room, signal: handle.signal });
  } finally {
    handle.release();
  }
}

/** Process ONE queued row: CLAIM it atomically (the exactly-once serializer), then RUN it · DROP it on a
 *  permanent verdict (the claim already deleted it) · or RE-QUEUE it (re-insert) on `budget_exceeded`/a
 *  transient fault. A lost claim ("skipped") means a concurrent drain owns the row. Isolated — the fault
 *  never escapes the sweep. */
async function drainOne(ctx: ChatContext, deps: TurnDeps, row: { readonly id: PendingTurnId }): Promise<"ran" | "dropped" | "requeued" | "skipped"> {
  // Atomic claim-before-run: the `DELETE … RETURNING` is the ONLY serializer (a drained turn is not
  // lock-held), so the boot reclaim ∥ host-return overlap can't double-run or double-spend a row.
  const claimed = await claimPendingTurn(ctx.db, row.id);
  if (claimed === undefined) {
    return "skipped"; // a concurrent drain already claimed this row.
  }
  try {
    await runDeferredRound(ctx, deps, claimed);
    return "ran";
  } catch (err) {
    if (isDrainVerdictDrop(err)) {
      const reason = err instanceof ChatNotFoundError ? "chat-gone" : "consent";
      await notifyDeferredTurnDropped(ctx, claimed, reason);
      getLog().info({ pendingTurnId: claimed.id, chatId: claimed.chatId, reason, dropped: true }, "chat: deferred turn DROPPED at drain (permanent verdict)");
      return "dropped";
    }
    // budget_exceeded (temporal) or a transient fault → RE-QUEUE (re-insert the claimed row, same frozen
    // triple + createdAt) to retry on the next drain edge. A crash between claim and re-insert loses the row
    // (the member can resend) — cheaper than a double-run.
    await insertPendingTurn(ctx.db, {
      id: claimed.id,
      chatId: claimed.chatId,
      triggeredBy: claimed.triggeredBy,
      runAsUserId: claimed.runAsUserId,
      createdAt: claimed.createdAt,
    });
    getLog().warn(
      { pendingTurnId: claimed.id, chatId: claimed.chatId, err, requeued: true },
      "chat: deferred turn RE-QUEUED at drain (budget window / transient fault)",
    );
    return "requeued";
  }
}

/** Notify the frozen `triggeredBy` member that their host-offline deferred reply was PERMANENTLY dropped
 *  (Part III §5) — mirrors the kick/handoff durable-inbox precedent (verbs/roster.ts). Best-effort: a
 *  cascade-gone recipient/chat can FK-fail the insert, which is logged, not fatal (the drain still consumed
 *  the row). No co-statements — the claim already deleted the row. */
async function notifyDeferredTurnDropped(
  ctx: ChatContext,
  row: { readonly chatId: ChatId; readonly triggeredBy: UserId },
  reason: "consent" | "chat-gone",
): Promise<void> {
  await ctx
    .emitNotification({
      type: "deferred-turn-dropped",
      recipientUserId: row.triggeredBy,
      chatId: row.chatId,
      reason,
    })
    .catch((err: unknown) =>
      getLog().warn({ chatId: row.chatId, triggeredBy: row.triggeredBy, reason, err }, "chat: deferred-turn-dropped notification emit failed (best-effort)"),
    );
}

/** `drainDeferredTurns` — the boot reclaim (`{all:true}`) + host-return (`{hostUserId}`) drain of the durable
 *  `pending_turns` queue. Each row runs through the engine (consent/budget re-validated in-lock) or is
 *  dropped on a re-validation refusal — both consume the row; a transient fault leaves it queued. Rows drain
 *  oldest-first + SEQUENTIALLY (each takes the per-chat lock + spends the host budget). */
function createDrainDeferredTurns(ctx: ChatContext, deps: TurnDeps): ChatService["drainDeferredTurns"] {
  return async (scope: DrainDeferredTurnsScope): Promise<DrainReport> => {
    const rows = "all" in scope ? await loadPendingTurnsForReclaim(ctx.db) : await loadPendingTurnsForHost(ctx.db, scope.hostUserId);
    let ran = 0;
    let dropped = 0;
    for (const row of rows) {
      // biome-ignore lint/performance/noAwaitInLoops: deferred turns drain SEQUENTIALLY — each acquires the per-chat lock + spends the host's count budget; a parallel sweep would race the lock + the limiter.
      const outcome = await drainOne(ctx, deps, row);
      if (outcome === "ran") {
        ran += 1;
      } else if (outcome === "dropped") {
        dropped += 1;
      }
    }
    return { ran, dropped };
  };
}

// ── requestTurn — the NON-HUMAN turn seam (automation-design/03 §4 / 05 §AC-B) ──

/**
 * `requestTurn` — run an autonomous chat turn on behalf of a NON-HUMAN initiator (an automation rule / a
 * plugin). The FOUR WALLS, none optional:
 *   1. DEPTH (loop-prevention) — refuse a stamp DEEPER than {@link AUTOMATION_DEPTH_HARD_CAP} (the write-side
 *      belt for a non-dispatch caller; automation's dispatch already bounds its own path), and thread
 *      `initiator`/`automationDepth` onto the reply slot so the reply's events resolve their cascade depth.
 *   2. AUTHORITY (cross-tenant) — the funder must be a PRESENT participant of the chat, else a leak-free
 *      NOT_FOUND (a user with no membership cannot fund a turn on it). The funding host is resolved from the
 *      ROOM, never a caller-supplied id.
 *   3. BUDGET — the engine's per-member `debitTurnBudget(triggeredBy)` runs unchanged inside the round (no free
 *      turn); automation's own §3 spend gate runs in the arm ABOVE this.
 *   4. CONSENT (D17) — the engine's `assertMaxProSubConsent` belt refuses a by-proxy hosted (`max-pro-sub`) turn
 *      without explicit owner consent (fail-closed). requestTurn re-implements NEITHER belt — it routes the
 *      triple (`triggeredBy` = funder, `runAsUserId` = host) through the engine so both fire.
 * Drives ONE round (no auto-mode AI→AI chain — an autonomous trigger is a single injected beat), forcing the
 * named speaker (coerced per-speaker) or arbitrating. A coded refusal (consent/budget/lock/depth) propagates to
 * the caller; the automation arm maps it to a typed refusal.
 */
/** The resolved substrate a `requestTurn` round runs on — produced only after WALLS 1+2 pass. */
interface RequestTurnResolved {
  readonly chat: NonNullable<Awaited<ReturnType<typeof loadChatRow>>>;
  readonly room: Room;
  readonly connection: ResolvedConnection;
  readonly identity: { readonly triggeredBy: UserId; readonly runAsUserId: UserId };
}

/** requestTurn WALLS 1+2 + room/host/connection resolution. Throws the coded refusal on any wall breach; else
 *  returns the resolved substrate. Split out so the round-driver closure stays under the complexity bar. */
async function resolveRequestTurn(ctx: ChatContext, deps: TurnDeps, params: RequestTurnParams): Promise<RequestTurnResolved> {
  const { chatId, initiator, funderUserId, automationDepth } = params;
  // WALL 1 (write side). `"human"` is never a requestTurn origin (it would forge a human turn); refuse it.
  if (initiator === "human") {
    throw new ChatOperationError(CHAT_OP_CODES.forbiddenOverride, `chat ${chatId}: requestTurn cannot stamp a 'human' initiator`);
  }
  if (automationDepth > AUTOMATION_DEPTH_HARD_CAP) {
    throw new ChatOperationError(
      CHAT_OP_CODES.cascadeDepthExceeded,
      `chat ${chatId}: turn depth ${automationDepth} exceeds the cascade cap ${AUTOMATION_DEPTH_HARD_CAP}`,
    );
  }
  const chat = await loadChatRow(ctx.db, chatId);
  if (chat === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  // Resolves the FUNDING host from canon (never a caller-supplied id); hostless is unusable (leak-free).
  const room = await loadRoom(ctx, chatId);
  // WALL 2 — the funder must be a PRESENT participant (leak-free NOT_FOUND). The upstream callers additionally
  // require HOST (automation's holdsAuthority; the membrane's canWrite); this is the defense-in-depth backstop.
  if ((await loadPresentRole(ctx.db, chatId, funderUserId)) === null) {
    throw new ChatNotFoundError(chatId);
  }
  // The identity triple: runAsUserId = the host box (funds), triggeredBy = the funder (attribution/abort/the
  // D17 by-proxy subject). WALL 3 (budget) + WALL 4 (consent) enforce on this triple inside `engine.runTurn`.
  const identity = { triggeredBy: funderUserId, runAsUserId: room.hostUserId };
  const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
  return { chat, room, connection, identity };
}

export function createRequestTurn(ctx: ChatContext, deps: TurnDeps): RequestTurnOp {
  return async (params: RequestTurnParams): Promise<TurnOutcome> => {
    const { chatId, initiator, automationDepth, speakerCharacterId, guided } = params;
    const { chat, room, connection, identity } = await resolveRequestTurn(ctx, deps, params);
    // A forced speaker coerces the round to per-speaker so a narrator room still voices the named character.
    const baseGroup = chat.metadata.group ?? DEFAULT_GROUP_CONFIG;
    const group = speakerCharacterId !== undefined ? asPerSpeaker(baseGroup) : baseGroup;
    const { assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames, respondsToLatestUserTurn } = await buildTurnContext(ctx, deps, {
      chatId,
      runAsUserId: identity.runAsUserId,
      model: connection.model,
      kind: "auto",
      castCharacterIds: room.castCharacterIds,

      mutedSpeakerKeys: room.mutedSpeakerKeys,
      personaIds: room.personaIds,
      anchorPersonaId: chat.anchorPersonaId,
      // No live triggering human — {{user}} binds to the chat anchor, not a presence-order human.
      triggerPersonaId: null,
      ...(guided !== undefined ? { guided } : {}),
    });
    const handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "auto",
      // The turn origin (03 §4) — the engine stamps both onto the new-slot reply; `getTurnOrigin` reads them
      // back for the cascade guard. NEVER a bus-event field (the D19/D50 allowlist).
      initiator,
      automationDepth,
      intent: {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      respondsToLatestUserTurn,
      signal: handle.signal,
    };
    try {
      return await runAiRound(ctx, deps, {
        base,
        group,
        room,
        signal: handle.signal,
        chain: false,
        ...(speakerCharacterId !== undefined ? { forcedIds: [speakerCharacterId] } : {}),
      });
    } finally {
      handle.release();
    }
  };
}

/** The turn-running verb bundle the root spreads into the full service. `opening`/`generateOpening` stays
 *  internal (injected into `startChat`, not on `ChatService`); the engine path is a `kind:"opening"` runTurn
 *  with the opening instruction on `appendUserTurn`. */
export function createTurn(ctx: ChatContext, deps: TurnDeps): TurnVerbs {
  // Built once so `send`'s PD-146 post-round auto-behaviors re-enter the SAME swipe/continue verbs the
  // service exposes (one home; the follow-ups clear every belt exactly like a manual swipe/continue).
  const swipe = createSwipe(ctx, deps);
  const continueTurn = createContinueTurn(ctx, deps);
  return {
    send: createSend(ctx, deps, { swipe, continueTurn }),
    forceCharacterTurn: createForceCharacterTurn(ctx, deps),
    abort: createAbort(ctx, deps),
    swipe,
    continueTurn,
    impersonate: createImpersonate(ctx, deps),
    generate: createGenerate(ctx, deps),
    undoContinue: createUndoContinue(ctx, deps),
    revertContinue: createRevertContinue(ctx, deps),
    drainDeferredTurns: createDrainDeferredTurns(ctx, deps),
  };
}
