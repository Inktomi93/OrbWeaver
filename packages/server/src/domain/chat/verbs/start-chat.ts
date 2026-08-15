// domain/chat/verbs/start-chat — `startChat`: the lazy chat+roster creation + founding opening. The ONE
// entry that mints a room: the caller becomes the `host` participant, the founding `characterIds` join as
// server-forced `member`s, and the room opens per its resolved `OpeningPolicy`. The whole chat+roster
// (+ any verbatim greeting) creation commits in ONE atomic `db.batch` (all-or-nothing).
//
// The roster references live `characters` rows by id, never copied cards; greeting text is read from the
// live card only to seed the opening assistant message.
//
// Opening policies: `none` seeds nothing; `first-message` seeds the primary character's greeting verbatim
// at seq 1; `greet-all` seeds every founding character's greeting verbatim (seq 1..N, skipping empties).
// Absent policy resolves by roster size (1 ⇒ first-message, >1 ⇒ greet-all, 0 ⇒ none). `generate` is NOT a
// creation-time arm (the wire schema excludes it, `transport/trpc/routers/chat.ts`'s `startChatSchema`) —
// "guide the opening" is an ordinary post-creation `chat.generate` action against the real room now
// (chat-creation-draft-mode-replacement.md §4.4/R2 retired the fused generated-opening +
// `openingFailure` degrade apparatus (START-1) along with the rest of the creation-time draft carry:
// R1 made every client caller create the real room before mounting, so a creation-fused generation and
// its "the room committed but the opening failed" DATA outcome were unreachable product surface).
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
//
// R0 §4.2: `startChat` mints a HUSK (`chats.startedAt IS NULL`) and never claims it — creation alone is
// never "real activity". The founding roster/greeting/injections are all part of the FOUNDING shape, not
// a claim; the first claim comes from whatever the caller does NEXT (a send, a generated opening, an
// explicit host config write — `verbs/claim-chat.ts`).

import type { DurableChatBusEvent, MessageView, OpeningPolicy, ParticipantView } from "@orb/contracts/chat";
import { chatInjections, chatParticipants, chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import { ChatNotFoundError } from "../contract/errors.ts";
import type { StartChatParams } from "../contract/params.ts";
import type { StartChatResult, TurnOutcome } from "../contract/results.ts";
import type { ChatService } from "../contract/service.ts";
import { loadChatCastProducer } from "../persistence/cast.ts";
import { loadChatRow } from "../persistence/queries.ts";
import { buildInitialRosterRows } from "../persistence/roster.ts";
import { NO_HISTORY_FLOOR } from "../substrate/auth/index.ts";
import { toChatDetail } from "../substrate/chat-detail.ts";
import { buildGreetingSeed } from "../substrate/greeting-seed.ts";

/** The collaborators not on `ChatContext`. `emit` is the chat bus; `loadParticipantViews` resolves the
 *  returned `ChatDetail` roster. */
interface StartChatDeps {
  readonly emit: (event: DurableChatBusEvent) => Promise<void>;
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
}

type StartChatVerbs = Pick<ChatService, "startChat">;

/** Resolve the effective opening policy: the explicit param, else by roster size. */
function resolveOpeningPolicy(opening: Exclude<OpeningPolicy, "generate"> | undefined, charCount: number): Exclude<OpeningPolicy, "generate"> {
  if (opening !== undefined) {
    return opening;
  }
  if (charCount === 0) {
    return "none";
  }
  return charCount === 1 ? "first-message" : "greet-all";
}

/** Compose the creation `metadata` blob — just the resolved `opening` label now (group config + room
 *  overrides are post-create-only writes; `setGroupConfig`/`setRoomOverrides` own them). Absent ⇒ `null`. */
function buildCreationMetadata(opening: OpeningPolicy | undefined): (typeof chats.$inferInsert)["metadata"] {
  return opening === undefined ? null : { opening };
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
): Promise<{ characterId: CharacterId; text: string }[]> {
  const cards = await Promise.all(characterIds.map((characterId) => ctx.getCard({ ownerId: hostUserId, characterId })));
  return characterIds.map((characterId, i) => ({ characterId, text: cards[i]?.greetings[0]?.text ?? "" }));
}

/** `startChat` — mint the room: the caller as `host`, the founding characters as members, then seed the
 *  opening per the resolved `OpeningPolicy`. The chat row + roster (+ verbatim greeting canon) commit in
 *  one atomic batch. */
function createStartChatVerb(ctx: ChatContext, deps: StartChatDeps): ChatService["startChat"] {
  return async ({
    principal,
    characterIds,
    anchorPersonaId,
    title,
    opening,
    injections,
    temporary,
    startAsGame,
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

    const rosterRows = buildInitialRosterRows({
      chatId,
      joinSeq: 0,
      now,
      host: { participantId: ctx.newParticipantId(), userId: hostUserId, activePersonaId: anchor },
      characters: characterIds.map((characterId) => ({ participantId: ctx.newParticipantId(), characterId })),
    });

    const targets = greetTargets(policy, characterIds);
    const greetings = targets.length > 0 ? await loadGreetings(ctx, hostUserId, targets) : [];
    // A founding room has no canon, so its greetings land at seq 1..N (`substrate/greeting-seed` — shared with
    // the roster verb's F6 in-window join greeting, which appends at the live canon head instead).
    const seed = buildGreetingSeed(ctx, { chatId, now, startSeq: 0, greetings });

    // One atomic creation batch: the chat row, the roster, and any verbatim greeting canon — all or none.
    const stmts: BatchStmt[] = [
      batchStmt(
        ctx.db.insert(chats).values({
          id: chatId,
          title: title ?? null,
          anchorPersonaId: anchor,
          // Born ephemeral — hidden from listChats, reap-eligible past the TTL.
          temporary: temporary === true,
          metadata: buildCreationMetadata(opening),
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
    // NO STATS HERE (R0 §4.7): the chat-created counters, the per-character first-chat bumps and the seeded
    // greetings' contributions all fire at CLAIM (`verbs/claim-chat.ts`), replayed over exactly this canon.
    // Creation-time economics would count every husk nobody ever started — and the firstness probe run here
    // would let a husk consume a character's one `newCharacter` bump, unrecoverably, even after the reap.
    await ctx.db.batch(batchMany(stmts));

    // #40 DRAFT-TIME game birth: a `startAsGame` carry mints the lite game NOW — after the chat+roster
    // committed (the caller is the just-minted host) and BEFORE any opening turn runs, so turn 1's gather
    // already sees the game (rpg steering rides the very first beat). Chat threads the intent BLIND (the
    // pointer foreign-schema precedent); a null `ctx.rpg` (rpg unwired) is the byte-identical no-op.
    if (startAsGame !== undefined && ctx.rpg !== null) {
      await ctx.rpg.startGame(chatId, startAsGame);
    }

    await deps.emit({ type: "chatCreated", chatId });
    // Fan `chatsChanged` to the new room's present human members so each device refetches its list.
    await ctx.emitChatChanged(chatId, { detail: true });
    for (const view of seed.views) {
      // biome-ignore lint/performance/noAwaitInLoops: the durable chat-bus ring assigns a monotonic seq per emit — the seeded greetings must log in canon (seq 1..N) order, so the writes are intentionally sequential.
      await deps.emit({ type: "messageCommitted", chatId, messageId: view.id, view });
    }

    const chatRow = await loadChatRow(ctx.db, chatId);
    if (chatRow === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    const participants = await deps.loadParticipantViews(chatId);
    const cast = await loadChatCastProducer(ctx.db, { participants });
    return {
      chat: toChatDetail({
        chat: chatRow,
        participants,
        cast,
        viewerUserId: hostUserId,
        // Born-here host: `joinSeq` 0, so the checkpoint clamp is inert by construction (there is no
        // pre-membership canon in a room this call just created).
        viewerHistoryFloorSeq: NO_HISTORY_FLOOR,
      }),
      opening: seedOutcome(seed.views),
    };
  };
}

/** Wrap the verbatim seed → a `TurnOutcome` (or null when nothing was seeded). */
function seedOutcome(views: readonly MessageView[]): TurnOutcome | null {
  return views.length > 0 ? { messages: views, aborted: false } : null;
}

/** The start-chat verb bundle. `deps` carries the chat bus `emit` + the `loadParticipantViews` roster
 *  resolver. */
export function createStartChat(ctx: ChatContext, deps: StartChatDeps): StartChatVerbs {
  return {
    startChat: createStartChatVerb(ctx, deps),
  };
}
