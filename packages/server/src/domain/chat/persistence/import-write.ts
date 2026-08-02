// domain/chat/persistence/import-write — the chat-owned bulk-import WRITE, the explicit named exception to
// "persistence is queries only" (like canon-write.ts/lock.ts): commits an imported chat's slots + variants +
// founding roster and resolves branch parents.
//
// LOAD-BEARING: `updatedAt` is the ST max(send_dates) carried in from import (not `now`); `importHash` is the
// per-chat dedup oracle (pre-fetched once, updated mid-loop). Each chat commits as ONE db.batch —
// db.transaction() is BANNED (the :memory: trap) — so a kill mid-import leaves zero rows, healed by dedup.

import type { BulkImportChatInput, BulkImportChatsResult } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, chatInjections, chatParticipants, chats, messageAssets, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { tokenizeContent } from "@orb/kit/content";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, CharacterId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import type { BulkImportChats, ChatImportContext } from "../contract/import";
import { parseChatMetadata } from "../contract/metadata";

/** The distinct inline `asset:<id>` refs in a message's content, across all its variants. */
function assetRefsInMessage(message: BulkImportChatInput["messages"][number]): AssetId[] {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local dedup Set for asset refs in a message
  const ids = new Set<string>();
  for (const v of message.variants) {
    for (const span of tokenizeContent(v.content, { committed: true })) {
      if (span.kind === "image" && span.ref.kind === "asset") {
        ids.add(span.ref.assetId);
      }
    }
  }
  return [...ids].map((id) => castId<AssetId>(id));
}

interface PendingParent {
  readonly chatId: ChatId;
  readonly parentRef: string;
  readonly forkedAt: number;
}

/** Ownership gate: EVERY seat (the primary + any extra roster id) must be the caller's — checked before a
 *  single row is written, so a foreign id can never be seated into a room the caller hosts. Leak-free
 *  `DomainNotFoundError`, the same refusal shape a stranger's characterId got when the op was
 *  single-character. One query for the whole set; the miss is reported by id. */
async function assertOwnedCharacters(db: Db, ownerId: UserId, characterIds: readonly CharacterId[]): Promise<void> {
  const owned = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(inArray(characters.id, [...characterIds]), eq(characters.ownerId, ownerId)));
  // @orb-gate-ignore persistence-no-in-memory-state: query-local membership Set over the row set this query just returned
  const ownedIds = new Set(owned.map((row) => row.id));
  for (const characterId of characterIds) {
    if (!ownedIds.has(characterId)) {
      throw new DomainNotFoundError("character", characterId);
    }
  }
}

/** The DISTINCT seated cast for one imported chat: the run's primary first (it is the header character —
 *  `loadExistingHashes`/`resolveBranches` scope on it), then this chat's extra roster seats in order. */
function seatedCast(primary: CharacterId, roster: readonly CharacterId[] | undefined): readonly CharacterId[] {
  return [primary, ...(roster ?? []).filter((id) => id !== primary)];
}

/** The character a slot NAMES as its speaker, or null when it names none (the optional field is absent, or
 *  explicitly null meaning "the run's primary"). One home for the absent-vs-null read. */
function namedSpeaker(m: BulkImportChatInput["messages"][number]): CharacterId | null {
  return m.characterId ?? null;
}

/** Referential gate: a slot may only be voiced by a character this chat actually SEATS. Without it a caller
 *  could stamp `messages.characterId` with an owned-but-unrostered card — a row every roster-joined read
 *  (transcript speaker names, member cards, the group arbitration feed) would then resolve to a ghost. */
function assertSeatedSpeakers(ci: BulkImportChatInput, primary: CharacterId): void {
  // @orb-gate-ignore persistence-no-in-memory-state: call-local membership Set over one input's seats (a pure precondition check, no state survives the call)
  const seated = new Set(seatedCast(primary, ci.roster));
  for (const m of ci.messages) {
    const named = namedSpeaker(m);
    if (named !== null && !seated.has(named)) {
      throw new DomainNotFoundError("chat_participant", named);
    }
  }
}

/** Pre-fetch the `importHash`es this character already has, scoped through the character-seat junction. */
async function loadExistingHashes(db: Db, characterId: CharacterId, hashes: readonly string[]): Promise<Record<string, true>> {
  const seen: Record<string, true> = {};
  if (hashes.length === 0) {
    return seen;
  }
  const rows = await db
    .select({ importHash: chats.importHash })
    .from(chats)
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
    .where(and(eq(chatParticipants.characterId, characterId), inArray(chats.importHash, [...hashes])));
  for (const r of rows) {
    if (r.importHash !== null) {
      seen[r.importHash] = true;
    }
  }
  return seen;
}

/** The founding roster for an imported chat (host human + every seated character); `joinSeq=0` (born here).
 *  A single-character `cast` is byte-identically the pre-roster two-row shape. */
function rosterRows(args: {
  readonly ctx: ChatImportContext;
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  readonly cast: readonly CharacterId[];
  readonly anchorPersonaId: BulkImportChatInput["anchorPersonaId"];
  readonly now: number;
}): (typeof chatParticipants.$inferInsert)[] {
  return [
    {
      id: args.ctx.newParticipantId(),
      chatId: args.chatId,
      kind: "human",
      userId: args.ownerId,
      role: "host",
      activePersonaId: args.anchorPersonaId,
      joinedAt: args.now,
      joinSeq: 0,
    },
    ...args.cast.map((characterId): typeof chatParticipants.$inferInsert => ({
      id: args.ctx.newParticipantId(),
      chatId: args.chatId,
      kind: "character",
      characterId,
      role: "member",
      joinedAt: args.now,
      joinSeq: 0,
    })),
  ];
}

interface MessageStatementsArgs {
  readonly ctx: ChatImportContext;
  readonly messageId: MessageId;
  readonly chatId: ChatId;
  readonly seq: number;
  readonly message: BulkImportChatInput["messages"][number];
  readonly ownerId: UserId;
  /** The run's PRIMARY character — the voice every assistant slot that names none falls back to. */
  readonly characterId: CharacterId;
  /** Asset ids confirmed to exist on the target box (pre-filtered per chat). */
  readonly existingAssetIds: readonly AssetId[];
  /** The room's minted synthetic narrator identity, or null when this chat carries no narrator slot. */
  readonly narratorCharacterId: CharacterId | null;
}

/** WHO voices this slot: the room's synthetic narrator identity (`narrator: true` — the `output:"narrator"`
 *  grammar), else the message's own `characterId` (a per-speaker group transcript names its speaker per
 *  turn), else the run's primary (the single-voice ST transcript — the pre-roster behavior, unchanged). A
 *  `user` slot is never character-attributed. A named id is already proven seated by
 *  {@link assertSeatedSpeakers}; `narratorCharacterId` is null exactly when no slot asked for it. */
function slotCharacterId(message: BulkImportChatInput["messages"][number], primary: CharacterId, narratorCharacterId: CharacterId | null): CharacterId | null {
  if (message.role !== "assistant") {
    return null;
  }
  if (message.narrator === true && narratorCharacterId !== null) {
    return narratorCharacterId;
  }
  return message.characterId ?? primary;
}

/** Does this chat carry any narrator-voiced slot? Gates the once-per-chat mint so a plain ST import never
 *  touches the synthetic-character namespace at all (byte-identical: no mint, no extra row, no query). */
function hasNarratorSlot(ci: BulkImportChatInput): boolean {
  return ci.messages.some((m) => m.role === "assistant" && m.narrator === true);
}

/** Statements for ONE imported message: slot (pointer null) → its variant pool → set the pointer. */
function messageStatements(args: MessageStatementsArgs): {
  readonly stmts: BatchStmt[];
  readonly variantCount: number;
} {
  const { ctx, messageId, chatId, seq, message } = args;
  const { db } = ctx;
  const isUser = message.role === "user";
  const stmts: BatchStmt[] = [
    batchStmt(
      db.insert(messages).values({
        id: messageId,
        chatId,
        seq,
        role: message.role,
        authorUserId: isUser ? args.ownerId : null,
        characterId: slotCharacterId(message, args.characterId, args.narratorCharacterId),
        personaId: isUser ? message.personaId : null,
        selectedVariantId: null,
        createdAt: message.createdAt,
      }),
    ),
  ];
  let selectedVariantId: (typeof messageVariants.$inferInsert)["id"] | null = null;
  for (const [i, v] of message.variants.entries()) {
    const variantId = ctx.newMessageVariantId();
    if (i === message.selectedIdx) {
      selectedVariantId = variantId;
    }
    stmts.push(
      batchStmt(
        db.insert(messageVariants).values({
          id: variantId,
          messageId,
          idx: v.idx,
          content: v.content,
          model: v.model,
          provider: v.provider,
          tokensOut: v.tokensOut,
          reasoning: v.reasoning,
          ttftMs: v.ttftMs,
          genStartedAt: v.genStartedAt,
          genFinishedAt: v.genFinishedAt,
          metadata: v.metadata,
          createdAt: message.createdAt,
        }),
      ),
    );
  }
  stmts.push(batchStmt(db.update(messages).set({ selectedVariantId }).where(eq(messages.id, messageId))));
  // Re-create the message_assets retaining row for each inline attachment that exists on the target box.
  for (const assetId of assetRefsInMessage(message)) {
    if (args.existingAssetIds.includes(assetId)) {
      stmts.push(
        batchStmt(
          db.insert(messageAssets).values({
            id: ctx.newMessageAssetId(),
            messageId,
            assetId,
            createdAt: message.createdAt,
          }),
        ),
      );
    }
  }
  return { stmts, variantCount: message.variants.length };
}

/** Commit one chat's statements as ONE atomic `db.batch`. */
function commitChatBatch(db: Db, stmts: readonly BatchStmt[]): Promise<unknown> {
  return db.batch(batchMany(stmts));
}

/** Resolve `parentRef` (a parent filename) → the parent chat's id, across all of this character's chats. */
async function resolveBranches(db: Db, characterId: CharacterId, pending: readonly PendingParent[]): Promise<number> {
  if (pending.length === 0) {
    return 0;
  }
  const all = await db
    .select({ id: chats.id, importedFrom: chats.importedFrom, createdAt: chats.createdAt })
    .from(chats)
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
    .where(eq(chatParticipants.characterId, characterId));
  // @orb-gate-ignore persistence-no-in-memory-state: query-local dedup Map for import-from linkage
  const byFile = new Map<string, ChatId>();
  const candidates = all
    .filter((c): c is { id: ChatId; importedFrom: string; createdAt: number } => c.importedFrom !== null)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const c of candidates) {
    byFile.set(c.importedFrom, c.id);
  }
  const linkStmts: BatchStmt[] = [];
  for (const p of pending) {
    const parentId = byFile.get(p.parentRef);
    if (parentId !== undefined && parentId !== p.chatId) {
      linkStmts.push(batchStmt(db.update(chats).set({ parentChatId: parentId, forkedAt: p.forkedAt }).where(eq(chats.id, p.chatId))));
    }
  }
  if (linkStmts.length > 0) {
    await db.batch(batchMany(linkStmts));
  }
  return linkStmts.length;
}

interface OneChatArgs {
  readonly ctx: ChatImportContext;
  readonly chatId: ChatId;
  readonly ci: BulkImportChatInput;
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  /** The target-box-existing subset of this chat's inline asset refs (pre-resolved once per chat). */
  readonly existingAssetIds: readonly AssetId[];
  /** The room's minted synthetic narrator identity, or null when this chat carries no narrator slot. */
  readonly narratorCharacterId: CharacterId | null;
}

/** The imported ST `note_prompt`'s landing placement — the house author's-note register: "near enough to
 *  steer, far enough not to dominate" (chat-crew-design/04), delivered as a system note. */
const IMPORTED_NOTE_DEPTH = 4;
const IMPORTED_NOTE_ROLE = "system";

/** The chat row + founding roster inserts for one imported chat. The ST `note_prompt` rides in as a
 *  `chat_injections` row — the ONE per-chat prose door (owner ruling 2026-08-01 retired the
 *  `roomOverrides.authorsNote` twin: both landed as the SAME at-depth splice). */
function chatHeaderStmts({ ctx, chatId, ci, ownerId, characterId }: OneChatArgs): BatchStmt[] {
  const { db } = ctx;
  return [
    batchStmt(
      db.insert(chats).values({
        id: chatId,
        title: ci.title,
        anchorPersonaId: ci.anchorPersonaId,
        importedFrom: ci.importedFrom,
        importHash: ci.importHash,
        // Absent ⇒ NULL, byte-identically the ST import. A supplied blob goes through the column's OWN
        // parser (the same fault-isolated read seam every consumer uses) so a caller can never land a
        // sub-blob shape the readers would heal away — one validation home, no second spelling here.
        metadata: ci.metadata === undefined ? null : parseChatMetadata(ci.metadata),
        createdAt: ci.createdAt,
        updatedAt: ci.updatedAt,
      }),
    ),
    ...(ci.authorsNote === null
      ? []
      : [
          batchStmt(
            db.insert(chatInjections).values({
              id: ctx.newChatInjectionId(),
              chatId,
              position: "in_chat",
              depth: IMPORTED_NOTE_DEPTH,
              role: IMPORTED_NOTE_ROLE,
              content: ci.authorsNote,
              createdAt: ci.createdAt,
            }),
          ),
        ]),
    ...rosterRows({
      ctx,
      chatId,
      ownerId,
      cast: seatedCast(characterId, ci.roster),
      anchorPersonaId: ci.anchorPersonaId,
      now: ci.createdAt,
    }).map((r) => batchStmt(db.insert(chatParticipants).values(r))),
  ];
}

/** All statements for ONE imported chat (header + roster + message slots/variants) + its tallies. */
function buildChatStatements(args: OneChatArgs): {
  readonly stmts: BatchStmt[];
  readonly messageCount: number;
  readonly variantCount: number;
} {
  const { ctx, chatId, ci, ownerId, characterId, existingAssetIds, narratorCharacterId } = args;
  const stmts = chatHeaderStmts(args);
  let messageCount = 0;
  let variantCount = 0;
  let seq = 0;
  for (const m of ci.messages) {
    const built = messageStatements({
      ctx,
      messageId: ctx.newMessageId(),
      chatId,
      seq,
      message: m,
      ownerId,
      characterId,
      existingAssetIds,
      narratorCharacterId,
    });
    stmts.push(...built.stmts);
    messageCount += 1;
    variantCount += built.variantCount;
    seq += 1;
  }
  return { stmts, messageCount, variantCount };
}

/** EVERY character id a run could seat or attribute: the primary, each chat's extra roster, and each slot's
 *  named speaker. Ownership-gated in one pass before any write, so a foreign id anywhere refuses the whole
 *  run rather than landing a partially-correct room. */
function everyReferencedCharacter(primary: CharacterId, input: readonly BulkImportChatInput[]): CharacterId[] {
  const ids: CharacterId[] = [primary];
  for (const c of input) {
    ids.push(...(c.roster ?? []));
    for (const m of c.messages) {
      const named = namedSpeaker(m);
      if (named !== null) {
        ids.push(named);
      }
    }
  }
  return ids;
}

/** Resolve one chat's two async preconditions and build its statement plan. Both preconditions run in ONE
 *  `Promise.all`: the bounded asset-existence read, and — only for a chat carrying a narrator slot — the
 *  find-or-mint of the room's synthetic identity, the same op and the same idempotency a live narrator round
 *  uses. A chat with no narrator slot never touches the synthetic namespace at all. */
async function planOneChat(args: Omit<OneChatArgs, "existingAssetIds" | "narratorCharacterId">): Promise<ReturnType<typeof buildChatStatements>> {
  const { ctx, ci, ownerId, chatId } = args;
  const [existingAssetIds, narratorCharacterId] = await Promise.all([
    ctx.filterExistingAssetIds(ownerId, ci.messages.flatMap(assetRefsInMessage)),
    hasNarratorSlot(ci) ? ctx.mintSyntheticGroupCharacter({ ownerId, chatId }).then((ref) => ref.characterId) : Promise.resolve(null),
  ]);
  return buildChatStatements({ ...args, existingAssetIds, narratorCharacterId });
}

/** Dup-skips by `chats.importHash`, commits each chat as ONE `db.batch`, then resolves branch parents. */
export function createBulkImportChats(ctx: ChatImportContext): BulkImportChats {
  return async ({ ownerId, characterId, chats: input }): Promise<BulkImportChatsResult> => {
    const { db } = ctx;
    // EVERY id this run could seat or attribute — the primary, every chat's extra roster, and every slot's
    // named speaker — ownership-gated in ONE pass before any write. A foreign id anywhere refuses the whole
    // run rather than landing a partially-correct room.
    await assertOwnedCharacters(db, ownerId, everyReferencedCharacter(characterId, input));
    for (const ci of input) {
      assertSeatedSpeakers(ci, characterId);
    }
    const existing = await loadExistingHashes(
      db,
      characterId,
      input.map((c) => c.importHash),
    );

    const chatIds: ChatId[] = [];
    let chatsImported = 0;
    let chatsSkipped = 0;
    let messagesImported = 0;
    let variantsImported = 0;
    let realConversationWritten = false;
    const pendingParents: PendingParent[] = [];

    for (const ci of input) {
      if (existing[ci.importHash] === true) {
        chatsSkipped += 1;
        continue; // true idempotent skip — the messages were written on the first import
      }
      existing[ci.importHash] = true; // a second byte-identical file later in THIS run skips too

      const chatId = ctx.newChatId();
      // biome-ignore lint/performance/noAwaitInLoops: per-chat by construction — the preconditions resolve against THIS chat's freshly minted id, at the same granularity as the atomic commit below.
      const { stmts, messageCount, variantCount } = await planOneChat({ ctx, chatId, ci, ownerId, characterId });
      if (ci.parentRef !== null) {
        pendingParents.push({ chatId, parentRef: ci.parentRef, forkedAt: ci.createdAt });
      }

      await commitChatBatch(db, stmts);
      chatIds.push(chatId);
      chatsImported += 1;
      messagesImported += messageCount;
      variantsImported += variantCount;
      if (ci.isRealConversation) {
        realConversationWritten = true;
      }
    }

    const branchesLinked = await resolveBranches(db, characterId, pendingParents);
    return {
      chatIds,
      chatsImported,
      chatsSkipped,
      messagesImported,
      variantsImported,
      branchesLinked,
      realConversationWritten,
    };
  };
}
