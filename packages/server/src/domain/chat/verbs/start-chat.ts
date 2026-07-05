// domain/chat/verbs/start-chat — `startChat` (the lazy chat+roster
// creation + the founding opening). The ONE entry that mints a room: the CALLER becomes the `host` participant
// (D18 — the host is the ONE authority + funding source; there is no `chats.ownerId`), the founding `characterIds`
// join the roster as server-forced `member`s, and the room opens per its resolved `OpeningPolicy`. The whole
// chat+roster (+ any VERBATIM greeting) creation commits in ONE atomic `db.batch` (all-or-nothing).
//
// D28 LIVE-IDENTITY ROSTER: the roster references the live `characters` rows by id (`chat_participants.characterId`)
// — NOT copied cards. The greeting text is read from the live card via `ctx.getCard` (the host's ownership) only to
// SEED the opening assistant message; the roster never snapshots the card.
//
// THE OPENING (the `opening` turn kind; the chunk-11 flag homes
// `generateOpening` HERE, internal — it is NOT a `ChatService` verb):
//   • `none`          — seed nothing (`opening: null`).
//   • `first-message` — the SOLO degenerate: the PRIMARY character's greeting seeded VERBATIM as an assistant
//                       message at seq 1 (no generation).
//   • `greet-all`     — the group default: EVERY founding character's greeting seeded VERBATIM (seq 1..N), in
//                       roster order (a character with no greeting is skipped).
//   • `generate`      — the model writes a cast-aware opening: delegated to the turn engine as a single
//                       `kind:"opening"` `runTurn` (the opening instruction rides `appendUserTurn`).
// The absent policy resolves by roster size: a roster of 1 character ⇒ `first-message`, of >1 ⇒ `greet-all`,
// of 0 ⇒ `none` (no cast to greet).
//
// FLAG[greeting-macro]: the VERBATIM greeting is still seeded RAW — and this is correct, NOT an unbuilt seam.
// The SEND USER_INPUT regex (D53 step 2) applies to COMPOSER text (a typed user turn); a seeded greeting takes
// NO composer input, so USER_INPUT regex never applies there. Resolving macros at seed time would ALSO bake in
// the anchor persona (breaking the per-view `{{user}}` the render-once/author-side-macro law requires — Part II
// §2/§3). The `generate` opening DOES run through the engine→pipeline, so its generated text gets the RECEIVE
// AI_OUTPUT/REASONING regex + post-process — the host-tier scripts are the union the GATHER computes onto its ctx.
//
// FLAG[chatOpened]: `startChat` emits ONLY `chatCreated`. `chatOpened` is SUBSCRIPTION-synthesized at the
// participant stream-attach (per-viewer, never a domain emit, never logged — the contract's `ChatBusEvent`
// note); the domain does not emit it.

import type { ChatBusEvent, OpeningPolicy, ParticipantView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import { chatParticipants, chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context";
import { ChatNotFoundError } from "../contract/errors";
import type { ResolveForeignInputsOp } from "../contract/foreign";
import type { GuidedSteer, StartChatParams } from "../contract/params";
import type { StartChatResult, TurnEngine, TurnOutcome } from "../contract/results";
import type { ChatService } from "../contract/service";
import type { ChatDetail } from "../contract/views";
import {
  buildCommittedMessageView,
  insertCanonMessageStatements,
} from "../persistence/canon-write";
import { loadChatRow } from "../persistence/queries";
import { buildInitialRosterRows, characterSeatedInAnotherChat } from "../persistence/roster";
import { gatherAssembleContext } from "../substrate/assemble-gather";
import { resolveGuidedActionText } from "../substrate/assembly-access";
import { canonMessageDelta, chatCreatedDelta, newCharacterDelta } from "../substrate/stats-delta";

/** The collaborators not on `ChatContext` (the second factory arg — the `fork.ts`/`turn.ts` precedent). `emit`
 *  is the chat bus; `loadParticipantViews` resolves the returned `ChatDetail` roster (the root resolves `users`
 *  publics OUTSIDE the `no-direct-users-read` domain scope); the engine + the two assemble resolvers back the
 *  `generate` opening ONLY (the verbatim paths never touch them). */
interface StartChatDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
  readonly engine: TurnEngine;
  readonly resolveConnection: (args: {
    readonly runAsUserId: UserId;
    readonly chatId: ChatId;
  }) => Promise<ResolvedConnection>;
  /** The FOREIGN half of the assemble ctx (preset/persona/settings) for the `generate` opening (contract/
   *  foreign.ts; the verbatim paths never touch it). */
  readonly resolveForeignInputs: ResolveForeignInputsOp;
}

type StartChatVerbs = Pick<ChatService, "startChat">;

/** The committed `MessageView` for a seeded greeting (the `buildCommittedMessageView` return — derive). */
type MessageViewSeed = ReturnType<typeof buildCommittedMessageView>;

/** A loaded chat row (the inferred `loadChatRow` return) — named locally (the `fork.ts` precedent). */
type LoadedChatRow = NonNullable<Awaited<ReturnType<typeof loadChatRow>>>;

// The `generate` opening's turn prompt is the RESOLVED guided `opening` action template
// (`opening` is the action whose resolved template IS the turn prompt, riding `appendUserTurn`; PD-63 routed).
// The per-action config comes from the preset (`promptConfig.guidedActions.opening`, contract default
// fallback); `{{input}}` is empty — startChat carries no composer steer (a steer param can ride later).

/** Map a loaded chat row + its resolved roster → `ChatDetail` (metadata sub-blobs applied to defaults). The
 *  same projection `fork.ts` uses (one shape, no drift). */
function toChatDetail(chat: LoadedChatRow, participants: readonly ParticipantView[]): ChatDetail {
  return {
    id: chat.id,
    title: chat.title,
    star: chat.star,
    archived: chat.archived,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    participants,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    opening: chat.metadata.opening ?? null,
    compactSummary: chat.compactSummary,
    compactedAtSeq: chat.compactedAtSeq,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

/** Resolve the effective opening policy: the explicit param, else by roster size (1 char ⇒ first-message,
 *  \>1 ⇒ greet-all, 0 ⇒ none — no cast to greet). */
function resolveOpeningPolicy(
  opening: OpeningPolicy | undefined,
  charCount: number,
): OpeningPolicy {
  if (opening !== undefined) {
    return opening;
  }
  if (charCount === 0) {
    return "none";
  }
  return charCount === 1 ? "first-message" : "greet-all";
}

/** The founding characters whose greeting is seeded VERBATIM for `policy` (`first-message` = the primary only;
 *  `greet-all` = every founding character; the generate/none paths seed none). */
function greetTargets(
  policy: OpeningPolicy,
  characterIds: readonly CharacterId[],
): readonly CharacterId[] {
  if (policy === "first-message") {
    return characterIds.slice(0, 1);
  }
  if (policy === "greet-all") {
    return characterIds;
  }
  return [];
}

/** Validate EVERY founding character is a host-readable (owner-scoped) card BEFORE any roster row exists
 *  (D28 live read; the PD-21 single-owner invariant — a roster character is always the HOST's, which is
 *  what keeps the stats rebuild's `characters.ownerId` attribution ≡ the live deltas' D19 host). A
 *  foreign/unknown id is a not-found (the owner-scoped read makes foreign == missing — leak-free). */
async function requireFoundingCast(
  ctx: ChatContext,
  hostUserId: UserId,
  characterIds: readonly CharacterId[],
): Promise<void> {
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

/** Resolve the founding cards' greetings (`greetings[0]`) under the host's ownership (D28 live read).
 *  Characters whose card has no greeting carry an empty string (skipped at seed time). */
async function loadGreetings(
  ctx: ChatContext,
  hostUserId: UserId,
  characterIds: readonly CharacterId[],
): Promise<{ characterId: CharacterId; text: string }[]> {
  const cards = await Promise.all(
    characterIds.map((characterId) => ctx.getCard({ ownerId: hostUserId, characterId })),
  );
  return characterIds.map((characterId, i) => ({
    characterId,
    text: cards[i]?.greetings[0] ?? "",
  }));
}

/** Build the VERBATIM greeting canon statements (+ their committed views), oldest-first at seq 1..N. A
 *  character with an empty greeting is skipped (never an empty seeded row). PURE given the loaded greetings +
 *  the ctx minters/clock. */
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
    if (g.text.length === 0) {
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

/** The creation-batch stats push: the chat-created counters (+ the PD-96 first-chat character bumps) and
 *  each verbatim greeting's contribution, all riding the SAME atomic creation batch. The primary's
 *  first-chat flag rides the created delta; every ADDITIONAL first-chat founding character gets its own
 *  owner-grain `newCharacterDelta` (the contract's `newCharacter` bumps by 1 per delta). Owner = the
 *  creator (the room host, D19). A `generate` opening's delta is the engine's — its turn pushes per its
 *  own persist arm. */
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

/** The `generate` opening — delegate a single `kind:"opening"` turn to the engine.
 *  The creator IS the host of a brand-new room, so the D19 triple collapses (`triggeredBy` =
 *  `runAsUserId` = the caller). Builds the ONE immutable assemble ctx through the substrate bridge, then runs
 *  the primary character's opening turn (no user row; the opening instruction rides `appendUserTurn`). */
async function runGeneratedOpening(
  ctx: ChatContext,
  deps: StartChatDeps,
  args: {
    readonly chatId: ChatId;
    readonly hostUserId: UserId;
    readonly characterIds: readonly CharacterId[];
    readonly anchorPersonaId: PersonaId | null;
    /** The composer wand's degenerate "Guide the opening" steer (`StartChatParams.guided`) — its
     *  `input` fills the `opening` action's `{{input}}`; only relevant here (the ONE call site that
     *  resolves the `opening` action — the verbatim seed paths never call `resolveGuidedActionText`). */
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
  // The opening action's resolved template IS the turn prompt — resolved against the built
  // assemble ctx ({{char}}/{{user}}/… live), delivered on `appendUserTurn` (never a placement).
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
    speakerCharacterId: args.characterIds[0] ?? null,
    appendUserTurn: openingPrompt,
  });
}

/** `startChat` — mint the room: the caller as `host`, the founding characters as members, then open per the
 *  resolved `OpeningPolicy`. The chat row + roster (+ verbatim greeting canon) commit in ONE atomic batch;
 *  `chatCreated` + a `messageCommitted` per seeded greeting are emitted after commit. A `generate` opening runs
 *  the engine AFTER the room exists (it needs the committed roster). */
function createStartChatVerb(ctx: ChatContext, deps: StartChatDeps): ChatService["startChat"] {
  return async ({
    principal,
    characterIds,
    anchorPersonaId,
    title,
    opening,
    temporary,
    guided,
  }: StartChatParams): Promise<StartChatResult> => {
    const now = ctx.now();
    const chatId = ctx.newChatId();
    const hostUserId = principal.userId;
    // The anchor default-seed (decided): no explicit anchor => the STARTER's user-level
    // active persona (`seeds.defaultPersonaId`, root-validated -- stale/unowned collapses to null). The
    // card {{user}} POV is the starter's from message one; an explicit anchor always wins.
    const anchor = anchorPersonaId ?? (await ctx.resolveDefaultPersona(hostUserId));
    const policy = resolveOpeningPolicy(opening, characterIds.length);

    // PD-21: every founding character must be the HOST's (owner-scoped read) — no foreign ghost seats.
    await requireFoundingCast(ctx, hostUserId, characterIds);

    // PD-96 first-chat probe, per founding character, BEFORE the roster rows commit (so "another chat"
    // cannot see this one): a character seated in NO other chat makes this its first chat → the live
    // `owner_stats.characters` bump (`newCharacter`) rides the creation batch below.
    const firstChat = await Promise.all(
      characterIds.map(
        async (characterId) => !(await characterSeatedInAnotherChat(ctx.db, characterId, chatId)),
      ),
    );

    // The roster (D28 live identity): the caller as host, the founding characters as server-forced members.
    const rosterRows = buildInitialRosterRows({
      chatId,
      joinSeq: 0,
      now,
      host: { participantId: ctx.newParticipantId(), userId: hostUserId, activePersonaId: anchor },
      characters: characterIds.map((characterId) => ({
        participantId: ctx.newParticipantId(),
        characterId,
      })),
    });

    // The VERBATIM opening seed (first-message = the primary only; greet-all = every founding character).
    const targets = greetTargets(policy, characterIds);
    const greetings = targets.length > 0 ? await loadGreetings(ctx, hostUserId, targets) : [];
    const seed = buildGreetingSeed(ctx, { chatId, now, greetings });

    // ONE atomic creation batch: the chat row, the roster, and any verbatim greeting canon — all or none.
    const stmts: BatchStmt[] = [
      batchStmt(
        ctx.db.insert(chats).values({
          id: chatId,
          title: title ?? null,
          anchorPersonaId: anchor,
          // ST "Temporary Chat" (PD-65): born ephemeral — hidden from listChats, reap-eligible past the TTL.
          temporary: temporary === true,
          // Persist the opening policy ONLY when the caller set it explicitly (the default stays derived from
          // roster size — the room already opened; a persisted policy is the re-open directive).
          metadata: opening !== undefined ? { opening } : null,
          createdAt: now,
          updatedAt: now,
        }),
      ),
      batchStmt(ctx.db.insert(chatParticipants).values(rosterRows)),
      ...seed.stmts,
    ];
    // The canon-mutator stats push (see the helper) — the created counters, the PD-96 first-chat bumps,
    // and each verbatim greeting's contribution ride the SAME atomic creation batch.
    pushCreationStatsDeltas(ctx, stmts, {
      hostUserId,
      characterIds,
      firstChat,
      greetings: seed.views,
      now,
    });
    await ctx.db.batch(batchMany(stmts));

    await deps.emit({ type: "chatCreated", chatId });
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
    return { chat: toChatDetail(chatRow, participants), opening: openingOutcome };
  };
}

/** Wrap the verbatim seed → a `TurnOutcome` (or null when nothing was seeded — `none`/an empty greeting;
 *  `StartChatResult.opening` is null then, per the result contract). */
function seedOutcome(views: readonly MessageViewSeed[]): TurnOutcome | null {
  return views.length > 0 ? { messages: views, aborted: false } : null;
}

/**
 * The start-chat verb BUNDLE (the grouped-file `create<File>` convention — `verb-naming` gate). The root
 * spreads it into the full service. `deps` carries the chat bus `emit` + the `loadParticipantViews` roster
 * resolver (always) and the engine + assemble resolvers (the `generate` opening only).
 */
export function createStartChat(ctx: ChatContext, deps: StartChatDeps): StartChatVerbs {
  return {
    startChat: createStartChatVerb(ctx, deps),
  };
}
