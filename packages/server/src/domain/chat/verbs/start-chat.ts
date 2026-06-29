// domain/chat/verbs/start-chat — `startChat` (chat.md Part I 8-slot `verbs/start-chat.ts`; the lazy chat+roster
// creation + the founding opening). The ONE entry that mints a room: the CALLER becomes the `host` participant
// (D18 — the host is the ONE authority + funding source; there is no `chats.ownerId`), the founding `characterIds`
// join the roster as server-forced `member`s, and the room opens per its resolved `OpeningPolicy`. The whole
// chat+roster (+ any VERBATIM greeting) creation commits in ONE atomic `db.batch` (all-or-nothing).
//
// D28 LIVE-IDENTITY ROSTER: the roster references the live `characters` rows by id (`chat_participants.characterId`)
// — NOT copied cards. The greeting text is read from the live card via `ctx.getCard` (the host's ownership) only to
// SEED the opening assistant message; the roster never snapshots the card.
//
// THE OPENING (chat.md §"What this domain owns" line 22 — the `opening` turn kind; the chunk-11 flag homes
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
// FLAG[greeting-macro]: the greeting is seeded VERBATIM (raw) — the SEND-context macro/regex pass that would
// resolve its `{{char}}`/`{{user}}` is the SAME unbuilt seam `verbs/turn.ts` flagged (FLAG[send-regex]): the
// per-chat active-script resolution + the write-context macro pipeline are a later chunk. "Verbatim seeding" is
// the literal contract; resolving at seed time would ALSO bake in the anchor persona (breaking the per-view
// `{{user}}` the render-once/author-side-macro law requires — Part II §2/§3). Consistent with how `turn.ts`
// persists a user message raw today.
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
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context";
import { ChatNotFoundError } from "../contract/errors";
import type { StartChatParams } from "../contract/params";
import type { StartChatResult, TurnEngine, TurnOutcome } from "../contract/results";
import type { ChatService } from "../contract/service";
import type { ChatDetail } from "../contract/views";
import {
  buildCommittedMessageView,
  insertCanonMessageStatements,
} from "../persistence/canon-write";
import { loadChatRow } from "../persistence/queries";
import { buildInitialRosterRows } from "../persistence/roster";
import { buildAssembleContext } from "../substrate/assembly-access";

/** The CROSS-DOMAIN half of the assemble ctx the root resolves for the `generate` opening (the same seam
 *  `verbs/turn.ts` uses — preset/persona/memory/WI/recent/injections/vars/budget are not ops on `ChatContext`). */
type AssembleCrossInputs = Pick<
  Parameters<typeof buildAssembleContext>[1],
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
  readonly resolveAssembleInputs: (args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly model: string;
  }) => Promise<AssembleCrossInputs>;
}

type StartChatVerbs = Pick<ChatService, "startChat">;

/** The committed `MessageView` for a seeded greeting (the `buildCommittedMessageView` return — derive). */
type MessageViewSeed = ReturnType<typeof buildCommittedMessageView>;

/** A loaded chat row (the inferred `loadChatRow` return) — named locally (the `fork.ts` precedent). */
type LoadedChatRow = NonNullable<Awaited<ReturnType<typeof loadChatRow>>>;

/** The neutral opening instruction the `generate` path rides on `appendUserTurn` (chat.md §6 — `opening` is
 *  the action whose resolved template IS the turn prompt). FLAG[guided-placement]: the rich guided `opening`
 *  template is the guided-steering chunk's seam — a neutral nudge stands in (mirrors `turn.ts`'s nudges). */
const OPENING_NUDGE = "[Open the scene: write the first message to begin the conversation.]";

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
 *  >1 ⇒ greet-all, 0 ⇒ none — no cast to greet). */
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

/** Resolve the founding cards' greetings (`greetings[0]`) under the host's ownership (D28 live read).
 *  Characters whose card is gone / has no greeting carry an empty string (skipped at seed time). */
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

/** The `generate` opening — delegate a single `kind:"opening"` turn to the engine (chat.md §"the per-turn
 *  driver"). The creator IS the host of a brand-new room, so the D19 triple collapses (`triggeredBy` =
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
  },
): Promise<TurnOutcome> {
  const { chatId, hostUserId } = args;
  const connection = await deps.resolveConnection({ runAsUserId: hostUserId, chatId });
  const cross = await deps.resolveAssembleInputs({
    chatId,
    runAsUserId: hostUserId,
    model: connection.model,
  });
  const assembleContext = await buildAssembleContext(ctx, {
    ...cross,
    chatId,
    ownerId: hostUserId,
    castCharacterIds: args.characterIds,
    personaIds: args.anchorPersonaId !== null ? [args.anchorPersonaId] : [],
    model: connection.model,
    generationType: "normal",
    nowMs: ctx.now(),
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
    appendUserTurn: OPENING_NUDGE,
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
  }: StartChatParams): Promise<StartChatResult> => {
    const now = ctx.now();
    const chatId = ctx.newChatId();
    const hostUserId = principal.userId;
    const anchor = anchorPersonaId ?? null;
    const policy = resolveOpeningPolicy(opening, characterIds.length);

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
