// domain/chat/verbs/turn — the turn-running FRONT DOORS (chat.md Part I 8-slot `verbs/{send,regen}.ts`; the
// turn lifecycle line ~22 + Part III §5/§6/§7). Each verb wires the DONE pieces into the lifecycle:
//   gate (`ctx.can` via guard) → resolve the D19 identity TRIPLE → resolve the connection → build the ONE
//   immutable assemble ctx → arbitrate the speaker(s) → drive the round (per-turn-locked) → return the outcome.
// Group-ness is DATA (roster size + arbitration), never a branch — solo is a roster-of-1 through the SAME path
// (`no-if(isGroup)`, D16). The triple is NEVER `callerUserId` (D19 — the `no-caller-user-id` gate): the caller
// is `principal.userId`, `runAsUserId` is the host (read from the roster), `triggeredBy` is the responsible
// human (the caller for a direct send; the chain-starter for an auto-mode turn).
//
// THE BUNDLE (the `verb-naming` gate — ONE `createTurn(ctx, deps)` factory; `deps` is the second arg): this
// chunk ships the verbs the DONE single-speaker engine (`engine.runTurn` — locked, NEW-assistant-slot persist)
// genuinely supports: `send` (+ the group round + auto-mode chain), `simpleSend` (the byte-identical solo
// path), `forceCharacterTurn` (host-only), and `abort` (the active-turns registry). The remaining turn verbs
// need engine MODES the DONE engine does not expose — they are FLAGGED, not stubbed (see the file footer).
//
// DEPS NOT ON `ChatContext` (the second factory arg — the `invites.ts`/`roster.ts` precedent; FLAG
// [turn-deps-not-on-ctx], all SHOULD be wired at the composition root):
//   • engine             — the built `TurnEngine` (`engine/createTurnEngine` at the root; locked per turn).
//   • activeTurns        — the in-memory controller registry (`active-turns.ts`; one instance per replica).
//   • emit               — the chat bus (chat's own collaborator; NOT a ctx field — see bus.ts).
//   • prng               — the SEEDED PRNG (`() => number`, D46) the arbitration consumes (never `Math.random`).
//   • delay              — the auto-mode inter-turn delay (D46; tests pass a no-op, prod a real timer).
//   • resolveConnection  — `connection.resolveChat` + the `RoutableChat` derivation from the chat row (the root
//                          binds it; `ctx.resolveChat` needs a `RoutableChat` the chat-row→routable mapping
//                          builds — FLAG[routable-derivation]).
//   • resolveAssembleInputs — the CROSS-DOMAIN half of the assemble ctx (preset `promptConfig`, the resolved
//                          personas, `{{memory}}`, the WI toggle, the recent window, the user `chat_injections`,
//                          the variable flush, the budget) — assembly/context.ts's FLAG[cross-domain-inputs]
//                          PRESCRIBES these as engine/verb-resolved parameters (no preset/persona/memory op
//                          exists on `ChatContext`). The chat-OWNED half (cast/personas-ids/pending text) the
//                          verb fills from its own roster read.

import type { ChatBusEvent, GroupConfig, MessageView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ActiveTurns } from "../contract/active-turns";
import type { ArbiterCandidate, AutoModeResult, CastName } from "../contract/arbitration";
import type { ChatContext } from "../contract/context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type {
  AbortParams,
  ForceCharacterTurnParams,
  SendParams,
  SimpleSendParams,
} from "../contract/params";
import type { TurnEngine, TurnOutcome } from "../contract/results";
import type { ChatService } from "../contract/service";
import { requireHost, requireParticipant } from "../guard";
import {
  buildCommittedMessageView,
  insertCanonMessageStatements,
} from "../persistence/canon-write";
import { loadCanonHistory, loadMaxMessageSeq } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { buildAssembleContext } from "../substrate/assembly-access";
import {
  driveRoundVia,
  resolveMentionsVia,
  resolveTurnIdentityVia,
  runAutoModeVia,
  selectSpeakersVia,
  smartArbitrateVia,
} from "../substrate/turn-access";

/** The full BUILD input (the substrate bridge's param type — derive, don't re-spell). */
type AssembleInput = Parameters<typeof buildAssembleContext>[1];

/** The CROSS-DOMAIN half of the assemble ctx the root resolves (see the file header FLAG). The chat-owned half
 *  (`chatId`/`ownerId`/`castCharacterIds`/`personaIds`/`model`/pending text) the verb fills itself. */
type AssembleCrossInputs = Pick<
  AssembleInput,
  | "promptConfig"
  | "personas"
  | "roomOverrides"
  | "worldInfoEnabled"
  | "recentMessages"
  | "lastMessage"
  | "lastUserMessage"
  | "lastCharMessage"
  | "userInjections"
  | "memory"
  | "compactSummary"
  | "variableValues"
  | "injectionTokenBudget"
  | "timezone"
>;

/** The shared per-round identity + ctx the driver reuses by reference (the bridge's `base` shape — derived). */
type RoundBase = Parameters<typeof driveRoundVia>[0]["base"];

/** The collaborators not on `ChatContext` (the second factory arg — file header FLAG[turn-deps-not-on-ctx]). */
interface TurnDeps {
  readonly engine: TurnEngine;
  readonly activeTurns: ActiveTurns;
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly prng: () => number;
  readonly delay: (ms: number) => Promise<void>;
  readonly resolveConnection: (args: {
    readonly runAsUserId: UserId;
    readonly chatId: ChatId;
  }) => Promise<ResolvedConnection>;
  readonly resolveAssembleInputs: (args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly model: string;
  }) => Promise<AssembleCrossInputs>;
}

/** The turn-running slice of `ChatService` this grouped file owns (the bundle the root spreads in). */
type TurnVerbs = Pick<ChatService, "send" | "simpleSend" | "forceCharacterTurn" | "abort">;

/** How many trailing canon rows feed the `smart` arbiter's transcript. */
const RECENT_TRANSCRIPT = 10;

/** The roster-derived turn substrate: the host (the D19 funding id), the character candidates (arbitration),
 *  their display names (@mention + name-stamp), the full present cast (WI cards), and the present personas. */
interface Room {
  readonly hostUserId: UserId;
  readonly candidates: readonly ArbiterCandidate[];
  readonly castNames: readonly CastName[];
  readonly castCharacterIds: readonly CharacterId[];
  readonly personaIds: readonly PersonaId[];
}

/** Load the present roster → the {@link Room}. The host is `role='host'` (D18 — the ONE authority + funding
 *  source); a hostless room is unusable (a leak-free NOT_FOUND). Cards read under the host's ownership (D28). */
async function loadRoom(ctx: ChatContext, chatId: ChatId): Promise<Room> {
  const roster = await loadRoster(ctx.db, chatId);
  const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
  if (hostUserId === null) {
    throw new ChatNotFoundError(chatId);
  }
  const charRows = roster.flatMap((r) =>
    r.kind === "character" && r.characterId !== null ? [{ ...r, characterId: r.characterId }] : [],
  );
  const cards = await Promise.all(
    charRows.map((r) => ctx.getCard({ ownerId: hostUserId, characterId: r.characterId })),
  );
  return {
    hostUserId,
    candidates: charRows.map((r) => ({
      characterId: r.characterId,
      talkativeness: r.talkativeness,
      disabled: r.disabled,
      leftSeq: r.leftSeq,
    })),
    castNames: charRows.map((r, i) => ({ characterId: r.characterId, name: cards[i]?.name ?? "" })),
    castCharacterIds: charRows.map((r) => r.characterId),
    personaIds: roster.flatMap((r) =>
      r.kind === "human" && r.activePersonaId !== null ? [r.activePersonaId] : [],
    ),
  };
}

/** The joined present-cast name (narrator `{{char}}`-as-cast — collapses to the single name at cast=1). */
function joinedCastName(castNames: readonly CastName[]): string {
  return castNames
    .map((c) => c.name)
    .filter((n) => n.length > 0)
    .join(", ");
}

/** The last-assistant speaker (ban-last seed) + a recent transcript (the `smart` arbiter reads it). */
async function canonFacts(
  ctx: ChatContext,
  chatId: ChatId,
): Promise<{ lastSpeakerId: CharacterId | null; recentHistory: string }> {
  const canon = await loadCanonHistory(ctx.db, chatId);
  return {
    lastSpeakerId: canon.findLast((m) => m.role === "assistant")?.characterId ?? null,
    recentHistory: canon
      .slice(-RECENT_TRANSCRIPT)
      .map((m) => m.content)
      .join("\n"),
  };
}

/** Build the ONE immutable assemble ctx for the round (RESOLVE+GATHER+BUILD via the substrate bridge). The
 *  cross-domain half is injected (FLAG[cross-domain-inputs]); the chat-owned half the verb supplies. */
async function buildTurnContext(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly model: string;
    readonly castCharacterIds: readonly CharacterId[];
    readonly personaIds: readonly PersonaId[];
    readonly pendingUserText?: string | undefined;
  },
): ReturnType<typeof buildAssembleContext> {
  const cross = await deps.resolveAssembleInputs({
    chatId: args.chatId,
    runAsUserId: args.runAsUserId,
    model: args.model,
  });
  return await buildAssembleContext(ctx, {
    ...cross,
    chatId: args.chatId,
    ownerId: args.runAsUserId,
    castCharacterIds: args.castCharacterIds,
    personaIds: args.personaIds,
    model: args.model,
    generationType: "normal",
    nowMs: ctx.now(),
    ...(args.pendingUserText !== undefined
      ? { pendingUserText: args.pendingUserText, currentInput: args.pendingUserText }
      : {}),
  });
}

/** Persist a user message (a fresh slot + its one variant — D26) and emit `messageCommitted`. FLAG[send-regex]:
 *  the SEND-context USER_INPUT regex pass (chat.md §2) is NOT applied — the regex engine is `@orb/kit/regex`
 *  but the per-chat active-script resolution + the SEND pipeline are unbuilt; the raw `content` is persisted. */
async function persistUserMessage(
  ctx: ChatContext,
  emit: TurnDeps["emit"],
  args: {
    readonly chatId: ChatId;
    readonly seq: number;
    readonly content: string;
    readonly authorUserId: UserId;
    readonly personaId: PersonaId | null;
  },
): Promise<MessageView> {
  const params = {
    messageId: ctx.newMessageId(),
    variantId: ctx.newMessageVariantId(),
    chatId: args.chatId,
    seq: args.seq,
    role: "user" as const,
    authorUserId: args.authorUserId,
    personaId: args.personaId,
    now: ctx.now(),
    variant: { content: args.content },
  };
  await ctx.db.batch(batchMany(insertCanonMessageStatements(ctx.db, params)));
  const view = buildCommittedMessageView(params);
  await emit({ type: "messageCommitted", chatId: args.chatId, messageId: view.id, view });
  return view;
}

/** Arbitrate WHO speaks (7a sync / 7b smart side-LLM). An @mention/forced target HARD-overrides any policy
 *  (routed to the sync path, which honors forced first — §6); `smart` (no forced) runs the side-LLM. Maps the
 *  resolved ids back to their cast names (the SHAPE name-stamp + the round driver consume `CastName`). */
async function arbitrate(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly group: GroupConfig;
    readonly candidates: readonly ArbiterCandidate[];
    readonly castNames: readonly CastName[];
    readonly forcedIds?: readonly CharacterId[] | undefined;
    readonly lastSpeakerId: CharacterId | null;
    readonly recentHistory: string;
    readonly maxSpeakers?: number | undefined;
  },
): Promise<CastName[]> {
  const forced = args.forcedIds ?? [];
  let ids: readonly CharacterId[];
  if (args.group.policy === "smart" && forced.length === 0) {
    ids = await smartArbitrateVia({
      summarize: ctx.summarize,
      candidates: args.candidates,
      castNames: args.castNames,
      recentHistory: args.recentHistory,
      lastSpeakerId: args.lastSpeakerId,
      rng: deps.prng,
    });
  } else {
    ids = selectSpeakersVia({
      candidates: args.candidates,
      policy: args.group.policy,
      lastSpeakerId: args.lastSpeakerId,
      forcedIds: forced,
      rng: deps.prng,
      maxSpeakers: args.maxSpeakers,
    });
  }
  const byId = new Map(args.castNames.map((c) => [c.characterId, c] as const));
  return ids.flatMap((id) => {
    const c = byId.get(id);
    return c !== undefined ? [c] : [];
  });
}

/** Coerce a room config to `per-speaker` for a single forced character (force targets ONE character, never the
 *  narrator cast collapse — so a narrator room still forces a per-speaker turn for the named character). */
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

/** Run the auto-mode AI→AI chain after a human-triggered round (chat.md Part III §6): re-arbitrate ONE speaker
 *  per iteration (ban-last unless `allowSelfResponses`), drive a single-speaker round, repeat to the dual bound
 *  / interrupt / no-eligible / lock. Every chained turn is `triggeredBy` the chain-starter (the `base` carries
 *  it — D19); the abort signal stops it at the next checkpoint (FLAG[abort-into-engine] — engine turns aren't
 *  yet interruptible mid-generation). */
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
    readonly initialLastSpeakerId: CharacterId | null;
  },
): Promise<AutoModeResult> {
  return await runAutoModeVia({
    maxTurns: args.group.autoModeMaxTurns,
    delayMs: args.group.autoModeDelayMs,
    delay: deps.delay,
    signal: args.signal,
    initialLastSpeakerId: args.initialLastSpeakerId,
    nextSpeaker: async (last) => {
      const facts = await canonFacts(ctx, args.base.chatId);
      const speakers = await arbitrate(ctx, deps, {
        group: args.group,
        candidates: args.room.candidates,
        castNames: args.room.castNames,
        lastSpeakerId: args.group.allowSelfResponses ? null : last,
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

// ── send (the human turn → arbitration → round → optional auto-mode chain) ──────────────────────────────────
/** `send` — persist the user message, build the ONE immutable assemble ctx, arbitrate the responders, drive the
 *  round, then (if `autoMode`) chain AI→AI. Member-gated (anyone present posts); the AI turns run as the host. */
function createSend(ctx: ChatContext, deps: TurnDeps): ChatService["send"] {
  return async ({
    principal,
    chatId,
    content,
    personaId,
    intent,
  }: SendParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
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

    // The ONE immutable assemble ctx — built with the pending user text in the WI haystack (two-phase, §3.4)
    // BEFORE the user row commits; the engine reloads canon (incl. the committed row) for the wire history.
    const assembleContext = await buildTurnContext(ctx, deps, {
      chatId,
      runAsUserId: identity.runAsUserId,
      model: connection.model,
      castCharacterIds: room.castCharacterIds,
      personaIds: room.personaIds,
      pendingUserText: content,
    });

    const seq = await loadMaxMessageSeq(ctx.db, chatId);
    const userView = await persistUserMessage(ctx, deps.emit, {
      chatId,
      seq: seq + 1,
      content,
      authorUserId: principal.userId,
      personaId: personaId ?? null,
    });

    const facts = await canonFacts(ctx, chatId);
    const speakers = await arbitrate(ctx, deps, {
      group,
      candidates: room.candidates,
      castNames: room.castNames,
      // Only HUMAN trigger text drives @mention (§12 inv 6) — `content` is the human post.
      forcedIds: resolveMentionsVia(content, room.castNames),
      lastSpeakerId: facts.lastSpeakerId,
      recentHistory: facts.recentHistory,
    });

    const groupCharacterId =
      group.output === "narrator"
        ? (await ctx.mintSyntheticGroupCharacter({ ownerId: identity.runAsUserId, chatId }))
            .characterId
        : null;
    const castName = joinedCastName(room.castNames);
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "send",
      intent: intent ?? {},
    };

    const handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    try {
      const round = await driveRoundVia({
        engine: deps.engine,
        base,
        group,
        speakers,
        groupCharacterId,
        castName,
      });
      const committed: MessageView[] = [userView, ...round.messages];
      if (group.autoMode) {
        const auto = await runChain(ctx, deps, {
          base,
          group,
          room,
          groupCharacterId,
          castName,
          signal: handle.signal,
          initialLastSpeakerId:
            round.messages.findLast((m) => m.role === "assistant")?.characterId ?? null,
        });
        committed.push(...auto.messages);
      }
      return { messages: committed, aborted: false };
    } finally {
      handle.release();
    }
  };
}

// ── simpleSend (the byte-identical solo path — no group machinery) ───────────────────────────────────────────
/** `simpleSend` — persist the user message then run ONE turn for the primary character (a roster-of-1 path; no
 *  arbitration / narrator). Byte-identical to a solo `send` (the engine's pinned per-speaker/merged default). */
function createSimpleSend(ctx: ChatContext, deps: TurnDeps): ChatService["simpleSend"] {
  return async ({
    principal,
    chatId,
    content,
    personaId,
    intent,
  }: SimpleSendParams): Promise<TurnOutcome> => {
    await requireParticipant(ctx, principal, chatId);
    const room = await loadRoom(ctx, chatId);
    const identity = resolveTurnIdentityVia({
      principalUserId: principal.userId,
      hostUserId: room.hostUserId,
    });
    const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
    const assembleContext = await buildTurnContext(ctx, deps, {
      chatId,
      runAsUserId: identity.runAsUserId,
      model: connection.model,
      castCharacterIds: room.castCharacterIds,
      personaIds: room.personaIds,
      pendingUserText: content,
    });
    const seq = await loadMaxMessageSeq(ctx.db, chatId);
    const userView = await persistUserMessage(ctx, deps.emit, {
      chatId,
      seq: seq + 1,
      content,
      authorUserId: principal.userId,
      personaId: personaId ?? null,
    });
    const handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    try {
      const outcome = await deps.engine.runTurn({
        chatId,
        assembleContext,
        connection,
        triggeredBy: identity.triggeredBy,
        runAsUserId: identity.runAsUserId,
        kind: "simple-send",
        intent: intent ?? {},
        speakerCharacterId: room.castNames[0]?.characterId ?? null,
      });
      return {
        messages: [userView, ...outcome.messages],
        aborted: outcome.aborted,
        ...(outcome.abortReason !== undefined ? { abortReason: outcome.abortReason } : {}),
      };
    } finally {
      handle.release();
    }
  };
}

// ── forceCharacterTurn (host-only — force a specific roster character to speak) ──────────────────────────────
/** `forceCharacterTurn` — host-only. Force a present, eligible roster character to speak next (per-speaker; no
 *  user row). A non-member / muted / absent target is a leak-free NOT_FOUND. */
function createForceCharacterTurn(
  ctx: ChatContext,
  deps: TurnDeps,
): ChatService["forceCharacterTurn"] {
  return async ({
    principal,
    chatId,
    characterId,
    intent,
  }: ForceCharacterTurnParams): Promise<TurnOutcome> => {
    const membership = await requireHost(ctx, principal, chatId);
    const room = await loadRoom(ctx, chatId);
    const identity = resolveTurnIdentityVia({
      principalUserId: principal.userId,
      hostUserId: room.hostUserId,
    });
    const target = room.castNames.find((c) => c.characterId === characterId);
    const eligible = room.candidates.some(
      (c) => c.characterId === characterId && c.leftSeq === null && !c.disabled,
    );
    if (target === undefined || !eligible) {
      throw new ChatNotFoundError(chatId);
    }
    const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
    const group = asPerSpeaker(membership.chat.metadata.group ?? DEFAULT_GROUP_CONFIG);
    const assembleContext = await buildTurnContext(ctx, deps, {
      chatId,
      runAsUserId: identity.runAsUserId,
      model: connection.model,
      castCharacterIds: room.castCharacterIds,
      personaIds: room.personaIds,
    });
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "force",
      intent: intent ?? {},
    };
    const handle = deps.activeTurns.register(chatId, identity.triggeredBy);
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

// ── abort (lock-free; turn-owner only — the rollback-theft defense) ─────────────────────────────────────────
/** `abort` — cancel the caller's in-flight turn(s) for the chat (the active-turns registry). Owner-only: a
 *  member-gated caller who owns NONE while another user's turn is in flight is refused `not_turn_owner` (a host
 *  cannot abort a member's turn). A no-in-flight abort is an idempotent no-op. */
function createAbort(ctx: ChatContext, deps: TurnDeps): ChatService["abort"] {
  return async ({ principal, chatId }: AbortParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    const { aborted, foreignInFlight } = deps.activeTurns.abort(chatId, principal.userId);
    if (aborted === 0 && foreignInFlight) {
      throw new ChatOperationError(
        CHAT_OP_CODES.notTurnOwner,
        `chat ${chatId}: cannot abort a turn you do not own`,
      );
    }
  };
}

/**
 * The turn-running verb BUNDLE (the grouped-file `create<File>` convention — `verb-naming` gate). The root
 * spreads it into the full service. Ships the verbs the DONE engine supports; see the file footer for the
 * FLAGGED verbs that need engine modes the single-speaker core does not yet expose.
 *
 * FLAG[engine-modes-missing] — `swipe`/`continueTurn`/`undoContinue`/`revertContinue`/`generate`/`impersonate`
 * are NOT shipped here (deliberately un-stubbed). The DONE `engine.runTurn` only commits a NEW assistant slot
 * under the per-chat lock; each of these needs a turn MODE the engine does not expose:
 *   • swipe / regen     → APPEND a variant to an EXISTING slot (`appendVariantStatements` exists in
 *                         persistence, but the engine's persist step is hard-wired to `insertCanonMessageStatements`).
 *   • continueTurn      → EXTEND the tail variant in place + the per-variant continue snapshot.
 *   • impersonate       → persist a USER-role generation (the engine hard-codes `role:"assistant"`).
 *   • generate          → LOCK-FREE execution (the engine's `runTurn` unconditionally acquires the per-chat
 *                         lock, so a "lock-free generate concurrent with a locked send" is impossible via it).
 * All four require an engine extension (a parametrized persist step + a lock-free entry + a `TurnPrep.signal`)
 * — out of this chunk's disjoint set (engine/ is DONE/off-limits). Wiring them is the engine-extension chunk's.
 * `opening`/`generateOpening` is INTERNAL (injected into `startChat`, not on `ChatService`) — its home is the
 * `start-chat.ts` chunk; the engine path for it is a `kind:"opening"` `runTurn` with the opening instruction on
 * `appendUserTurn`.
 */
export function createTurn(ctx: ChatContext, deps: TurnDeps): TurnVerbs {
  return {
    send: createSend(ctx, deps),
    simpleSend: createSimpleSend(ctx, deps),
    forceCharacterTurn: createForceCharacterTurn(ctx, deps),
    abort: createAbort(ctx, deps),
  };
}
