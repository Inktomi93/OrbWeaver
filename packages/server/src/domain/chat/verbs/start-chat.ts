// domain/chat/verbs/start-chat — `startChat`: the lazy chat+roster creation + founding opening. The ONE
// entry that mints a room: the caller becomes the `host` participant, the founding `characterIds` join as
// server-forced `member`s, and the room opens per its resolved `OpeningPolicy`. The whole chat+roster
// (+ any verbatim greeting) creation commits in ONE atomic `db.batch` (all-or-nothing).
//
// The roster references live `characters` rows by id, never copied cards; greeting text is read from the
// live card only to seed the opening assistant message.
//
// Opening policies: `none` seeds nothing; `first-message` seeds the primary character's greeting verbatim
// at seq 1; `greet-all` seeds every founding character's greeting verbatim (seq 1..N, skipping empties);
// `generate` delegates to the turn engine as a single `kind:"opening"` runTurn. Absent policy resolves by
// roster size (1 ⇒ first-message, >1 ⇒ greet-all, 0 ⇒ none).
//
// FLAG[greeting-macro]: the verbatim greeting is seeded raw at seed time. Identity macros
// (`{{char}}`/`{{user}}`/`{{persona}}`) stay raw/per-view, resolved at read against the character +
// the chat anchor persona (never the reader's active persona), identically on server and client.
// Volatile macros freeze at the first user turn (`freezeGreetingVolatiles`, verbs/turn.ts) — a greeting
// is malleable/swipeable until then.
//
// FLAG[chatOpened]: `startChat` emits only `chatCreated`. `chatOpened` is NOT a domain emit — it is
// synthesized per-subscription at the participant stream-attach (transport/trpc/routers/chat.ts's
// `chatEventStream`, PD-134): a local per-viewer yield, never published on the bus, never logged to
// `chat_events`. This verb deliberately stays silent on it (the marker guarding against a stray emit here).

import type {
  ChatBusEvent,
  ChatMacroNameProducer,
  GroupConfigInput,
  OpeningPolicy,
  ParticipantView,
  PersonaAvatarEntry,
  RoomOverrides,
} from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES, groupConfigSchema, roomOverridesSchema } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import { chatInjections, chatParticipants, chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context";
import { ChatNotFoundError } from "../contract/errors";
import type { ResolveForeignInputsOp } from "../contract/foreign";
import type { GuidedSteer, StartChatParams } from "../contract/params";
import type { StartChatResult, TurnEngine, TurnOutcome } from "../contract/results";
import type { ChatService } from "../contract/service";
import type { ChatDetail } from "../contract/views";
import { buildCommittedMessageView, insertCanonMessageStatements } from "../persistence/canon-write";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import { loadChatRow } from "../persistence/queries";
import { buildInitialRosterRows, characterSeatedInAnotherChat } from "../persistence/roster";
import { loadPersonaAvatarProducer } from "../persistence/roster-avatars";
import { gatherAssembleContext } from "../substrate/assemble-gather";
import { resolveGuidedActionText } from "../substrate/assembly-access";
import { canonMessageDelta, chatCreatedDelta, newCharacterDelta } from "../substrate/stats-delta";

/** The collaborators not on `ChatContext`. `emit` is the chat bus; `loadParticipantViews` resolves the
 *  returned `ChatDetail` roster; the engine + the two assemble resolvers back the `generate` opening only. */
interface StartChatDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
  readonly engine: TurnEngine;
  readonly resolveConnection: (args: { readonly runAsUserId: UserId; readonly chatId: ChatId }) => Promise<ResolvedConnection>;
  /** The foreign half of the assemble ctx (preset/persona/settings) for the `generate` opening only. */
  readonly resolveForeignInputs: ResolveForeignInputsOp;
}

type StartChatVerbs = Pick<ChatService, "startChat">;

/** The committed `MessageView` for a seeded greeting. */
type MessageViewSeed = ReturnType<typeof buildCommittedMessageView>;

type LoadedChatRow = NonNullable<Awaited<ReturnType<typeof loadChatRow>>>;

/** Map a loaded chat row + its resolved roster + macro name producer → `ChatDetail`. The same projection
 *  `fork.ts`/`invites.ts`/`read.ts` use (one shape, no drift). */
interface ToChatDetailInput {
  readonly chat: LoadedChatRow;
  readonly participants: readonly ParticipantView[];
  readonly macroNames: ChatMacroNameProducer;
  readonly personaAvatars: readonly PersonaAvatarEntry[];
  readonly viewerUserId: UserId;
}

function toChatDetail({ chat, participants, macroNames, personaAvatars, viewerUserId }: ToChatDetailInput): ChatDetail {
  const viewer = participants.find((p) => p.userId === viewerUserId);
  return {
    id: chat.id,
    title: chat.title,
    star: chat.star,
    archived: chat.archived,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    participants,
    viewerActivePersonaId: viewer?.activePersonaId ?? null,
    viewerIsHost: viewer?.role === "host",
    viewerUserId,
    pendingHostUserId: chat.pendingHostUserId,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    opening: chat.metadata.opening ?? null,
    compactSummary: chat.compactSummary,
    compactedAtSeq: chat.compactedAtSeq,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    macroNames,
    personaAvatars,
  };
}

/** Resolve the effective opening policy: the explicit param, else by roster size. */
function resolveOpeningPolicy(opening: OpeningPolicy | undefined, charCount: number): OpeningPolicy {
  if (opening !== undefined) {
    return opening;
  }
  if (charCount === 0) {
    return "none";
  }
  return charCount === 1 ? "first-message" : "greet-all";
}

/** Compose the creation `metadata` blob from the pre-send draft config. Group config + room overrides
 *  route through the same schemas the `setGroupConfig`/`setRoomOverrides` verbs use, so a draft-carried
 *  config is byte-identical to what those verbs would persist. All-absent ⇒ `null`. */
function buildCreationMetadata(args: {
  readonly opening: OpeningPolicy | undefined;
  readonly groupConfig: GroupConfigInput | undefined;
  readonly roomOverrides: RoomOverrides | undefined;
}): (typeof chats.$inferInsert)["metadata"] {
  const { opening, groupConfig, roomOverrides } = args;
  if (opening === undefined && groupConfig === undefined && roomOverrides === undefined) {
    return null;
  }
  return {
    ...(opening === undefined ? {} : { opening }),
    ...(groupConfig === undefined ? {} : { group: groupConfigSchema.parse(groupConfig) }),
    ...(roomOverrides === undefined ? {} : { roomOverrides: roomOverridesSchema.parse(roomOverrides) }),
  };
}

/** The founding characters whose greeting is seeded verbatim for `policy`. */
function greetTargets(policy: OpeningPolicy, characterIds: readonly CharacterId[]): readonly CharacterId[] {
  if (policy === "first-message") {
    return characterIds.slice(0, 1);
  }
  if (policy === "greet-all") {
    return characterIds;
  }
  return [];
}

/** Validate every founding character is a host-readable (owner-scoped) card before any roster row exists.
 *  A foreign/unknown id is a not-found (owner-scoped read makes foreign == missing, leak-free). */
async function requireFoundingCast(ctx: ChatContext, hostUserId: UserId, characterIds: readonly CharacterId[]): Promise<void> {
  const cards = await Promise.all(
    characterIds.map(async (characterId) => ({
      characterId,
      card: await ctx.getCard({ ownerId: hostUserId, characterId }),
    })),
  );
  const missing = cards.find((c) => c.card === null);
  if (missing !== undefined) {
    throw new DomainNotFoundError("character", missing.characterId);
  }
}

/** Resolve the founding cards' greetings (`greetings[0]`) under the host's ownership. Characters whose
 *  card has no greeting carry an empty string (skipped at seed time). */
async function loadGreetings(
  ctx: ChatContext,
  hostUserId: UserId,
  characterIds: readonly CharacterId[],
  seedGreetings: Readonly<Record<CharacterId, string>> | undefined,
): Promise<{ characterId: CharacterId; text: string }[]> {
  const cards = await Promise.all(characterIds.map((characterId) => ctx.getCard({ ownerId: hostUserId, characterId })));
  return characterIds.map((characterId, i) => ({
    characterId,
    // The draft's swiped/edited opening wins; else the card's primary greeting.
    text: seedGreetings?.[characterId] ?? cards[i]?.greetings[0] ?? "",
  }));
}

/** Build the verbatim greeting canon statements (+ their committed views), oldest-first at seq 1..N. A
 *  character with an empty greeting is skipped. */
function buildGreetingSeed(
  ctx: ChatContext,
  args: {
    readonly chatId: ChatId;
    readonly now: number;
    readonly greetings: readonly { readonly characterId: CharacterId; readonly text: string }[];
  },
): { stmts: BatchStmt[]; views: MessageViewSeed[] } {
  const stmts: BatchStmt[] = [];
  const views: MessageViewSeed[] = [];
  let seq = 0;
  for (const g of args.greetings) {
    // A cleared draft greeting seeds NO row.
    if (g.text.trim().length === 0) {
      continue;
    }
    seq += 1;
    const params = {
      messageId: ctx.newMessageId(),
      variantId: ctx.newMessageVariantId(),
      chatId: args.chatId,
      seq,
      role: "assistant" as const,
      characterId: g.characterId,
      now: args.now,
      variant: { content: g.text },
    };
    stmts.push(...insertCanonMessageStatements(ctx.db, params));
    views.push(buildCommittedMessageView(params));
  }
  return { stmts, views };
}

/** The creation-batch stats push: the chat-created counters (+ first-chat character bumps) and each
 *  verbatim greeting's contribution, all riding the same atomic creation batch. A `generate` opening's
 *  delta is the engine's own persist arm. */
function pushCreationStatsDeltas(
  ctx: ChatContext,
  stmts: BatchStmt[],
  args: {
    readonly hostUserId: UserId;
    readonly characterIds: readonly CharacterId[];
    readonly firstChat: readonly boolean[];
    readonly greetings: readonly MessageViewSeed[];
    readonly now: number;
  },
): void {
  const { hostUserId, now } = args;
  ctx.applyStatsDelta(
    stmts,
    ctx.db,
    chatCreatedDelta({
      ownerId: hostUserId,
      characterId: args.characterIds[0] ?? null,
      forked: false,
      newCharacter: args.firstChat[0] === true,
      now,
    }),
  );
  for (const isFirst of args.firstChat.slice(1)) {
    if (isFirst) {
      ctx.applyStatsDelta(stmts, ctx.db, newCharacterDelta({ ownerId: hostUserId, now }));
    }
  }
  for (const g of args.greetings) {
    ctx.applyStatsDelta(
      stmts,
      ctx.db,
      canonMessageDelta({
        ownerId: hostUserId,
        row: {
          characterId: g.characterId,
          role: "assistant",
          createdAt: now,
          content: g.content,
          tokensIn: null,
          tokensOut: null,
          costUsd: null,
          cacheReadTokens: null,
          cacheWriteTokens: null,
          contextWindow: null,
          genStartedAt: null,
          genFinishedAt: null,
          model: null,
          provider: null,
          reasoning: null,
          metadata: null,
          selectedIdx: 0,
          variantCount: 1,
        },
        sign: 1,
        now,
      }),
    );
  }
}

/** The `generate` opening — delegate a single `kind:"opening"` turn to the engine. Builds the assemble
 *  ctx through the substrate bridge, then runs the primary character's opening turn (no user row; the
 *  opening instruction rides `appendUserTurn`). */
async function runGeneratedOpening(
  ctx: ChatContext,
  deps: StartChatDeps,
  args: {
    readonly chatId: ChatId;
    readonly hostUserId: UserId;
    readonly characterIds: readonly CharacterId[];
    readonly anchorPersonaId: PersonaId | null;
    /** The composer wand's "Guide the opening" steer — its `input` fills the `opening` action's `{{input}}`. */
    readonly guided?: GuidedSteer | undefined;
  },
): Promise<TurnOutcome> {
  const { chatId, hostUserId } = args;
  const connection = await deps.resolveConnection({ runAsUserId: hostUserId, chatId });
  const personaIds = args.anchorPersonaId !== null ? [args.anchorPersonaId] : [];
  const foreign = await deps.resolveForeignInputs({
    chatId,
    runAsUserId: hostUserId,
    model: connection.model,
    anchorPersonaId: args.anchorPersonaId,
    personaIds,
  });
  const assembleContext = await gatherAssembleContext(
    ctx,
    {
      chatId,
      runAsUserId: hostUserId,
      model: connection.model,
      castCharacterIds: args.characterIds,
      personaIds,
    },
    foreign,
  );
  // The opening action's resolved template IS the turn prompt, delivered on `appendUserTurn`.
  const openingPrompt = resolveGuidedActionText(assembleContext, {
    action: "opening",
    input: args.guided?.input ?? "",
    model: connection.model,
    chatId,
  });
  return await deps.engine.runTurn({
    chatId,
    assembleContext,
    connection,
    triggeredBy: hostUserId,
    runAsUserId: hostUserId,
    kind: "opening",
    intent: {},
    // PD-146: a generated opening honors the host's custom stop strings too (all-off ⇒ byte-identical).
    extraStopSequences: foreign.chatBehavior?.customStoppingStrings,
    memoryConfig: foreign.memoryConfig,
    speakerCharacterId: args.characterIds[0] ?? null,
    appendUserTurn: openingPrompt,
  });
}

/** `startChat` — mint the room: the caller as `host`, the founding characters as members, then open per
 *  the resolved `OpeningPolicy`. The chat row + roster (+ verbatim greeting canon) commit in one atomic
 *  batch; a `generate` opening runs the engine after the room exists (it needs the committed roster). */
function createStartChatVerb(ctx: ChatContext, deps: StartChatDeps): ChatService["startChat"] {
  return async ({
    principal,
    characterIds,
    anchorPersonaId,
    title,
    opening,
    seedGreetings,
    rosterOverrides,
    groupConfig,
    roomOverrides,
    injections,
    temporary,
    guided,
  }: StartChatParams): Promise<StartChatResult> => {
    const now = ctx.now();
    const chatId = ctx.newChatId();
    const hostUserId = principal.userId;
    // Anchor seed chain: explicit anchor > the connected persona (solo-character founding with exactly
    // one connection) > the starter's current persona > the starter's default persona.
    const anchor =
      anchorPersonaId ??
      (await ctx.resolveConnectedPersona(hostUserId, characterIds)) ??
      (await ctx.resolveCurrentPersona(hostUserId)) ??
      (await ctx.resolveDefaultPersona(hostUserId));
    const policy = resolveOpeningPolicy(opening, characterIds.length);

    await requireFoundingCast(ctx, hostUserId, characterIds);

    // First-chat probe, per founding character, before the roster rows commit: a character seated in no
    // other chat makes this its first chat → the newCharacter bump rides the creation batch below.
    const firstChat = await Promise.all(characterIds.map(async (characterId) => !(await characterSeatedInAnotherChat(ctx.db, characterId, chatId))));

    const rosterRows = buildInitialRosterRows({
      chatId,
      joinSeq: 0,
      now,
      host: { participantId: ctx.newParticipantId(), userId: hostUserId, activePersonaId: anchor },
      // Pre-send roster tuning applied to the founding rows — deviating fields only.
      characters: characterIds.map((characterId) => {
        const ov = rosterOverrides?.[characterId];
        return {
          participantId: ctx.newParticipantId(),
          characterId,
          ...(ov?.disabled === undefined ? {} : { disabled: ov.disabled }),
          ...(ov?.talkativeness === undefined ? {} : { talkativeness: ov.talkativeness }),
        };
      }),
    });

    const targets = greetTargets(policy, characterIds);
    const greetings = targets.length > 0 ? await loadGreetings(ctx, hostUserId, targets, seedGreetings) : [];
    const seed = buildGreetingSeed(ctx, { chatId, now, greetings });

    // One atomic creation batch: the chat row, the roster, and any verbatim greeting canon — all or none.
    const stmts: BatchStmt[] = [
      batchStmt(
        ctx.db.insert(chats).values({
          id: chatId,
          title: title ?? null,
          anchorPersonaId: anchor,
          // Born ephemeral — hidden from listChats, reap-eligible past the TTL.
          temporary: temporary === true,
          metadata: buildCreationMetadata({ opening, groupConfig, roomOverrides }),
          createdAt: now,
          updatedAt: now,
        }),
      ),
      batchStmt(ctx.db.insert(chatParticipants).values(rosterRows)),
      ...seed.stmts,
      // Pre-send authored injections seeded as founding `chat_injections` rows in the same atomic batch.
      ...(injections ?? []).map((inj) =>
        batchStmt(
          ctx.db.insert(chatInjections).values({
            id: ctx.newInjectionId(),
            chatId,
            position: inj.position,
            depth: inj.depth,
            role: inj.role,
            content: inj.content,
            order: inj.order ?? null,
            createdAt: now,
          }),
        ),
      ),
    ];
    pushCreationStatsDeltas(ctx, stmts, {
      hostUserId,
      characterIds,
      firstChat,
      greetings: seed.views,
      now,
    });
    await ctx.db.batch(batchMany(stmts));

    await deps.emit({ type: "chatCreated", chatId });
    // Fan `chatsChanged` to the new room's present human members so each device refetches its list.
    await ctx.emitChatChanged(chatId, { detail: true });
    for (const view of seed.views) {
      // biome-ignore lint/performance/noAwaitInLoops: the durable chat-bus ring assigns a monotonic seq per emit — the seeded greetings must log in canon (seq 1..N) order, so the writes are intentionally sequential.
      await deps.emit({ type: "messageCommitted", chatId, messageId: view.id, view });
    }

    const openingOutcome =
      policy === "generate"
        ? await runGeneratedOpening(ctx, deps, {
            chatId,
            hostUserId,
            characterIds,
            anchorPersonaId: anchor,
            guided,
          })
        : seedOutcome(seed.views);

    const chatRow = await loadChatRow(ctx.db, chatId);
    if (chatRow === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    const participants = await deps.loadParticipantViews(chatId);
    const macroNames = await loadChatMacroNameProducer(ctx.db, { participants });
    const personaAvatars = await loadPersonaAvatarProducer(ctx.db, { participants });
    return {
      chat: toChatDetail({
        chat: chatRow,
        participants,
        macroNames,
        personaAvatars,
        viewerUserId: hostUserId,
      }),
      opening: openingOutcome,
    };
  };
}

/** Wrap the verbatim seed → a `TurnOutcome` (or null when nothing was seeded). */
function seedOutcome(views: readonly MessageViewSeed[]): TurnOutcome | null {
  return views.length > 0 ? { messages: views, aborted: false } : null;
}

/** The start-chat verb bundle. `deps` carries the chat bus `emit` + the `loadParticipantViews` roster
 *  resolver (always) and the engine + assemble resolvers (the `generate` opening only). */
export function createStartChat(ctx: ChatContext, deps: StartChatDeps): StartChatVerbs {
  return {
    startChat: createStartChatVerb(ctx, deps),
  };
}
