// domain/chat/persistence/import-write — the chat-OWNED bulk-import WRITE (Option B; PD-77). The EXPLICIT
// named exception to "persistence is queries only" (like `canon-write.ts` / `lock.ts`): it commits an
// imported chat's slots + variants + founding roster and resolves branch parents. `import` injects this as a
// contract-typed op (`@orb/contracts/chat` `BulkImportChatInput` in, `BulkImportChatsResult` out) and does
// the ST→canonical translation itself — this op learns NOTHING about SillyTavern. Touches ONLY chat's own
// tables (`chats`/`chat_participants`/`messages`/`message_variants`) + a precondition READ of `characters`
// for the ownership gate (the same table chat reads in `macro-names.ts`) — `Tier-1-DB.md` item 1.
//
// D-LEDGER:
//   • D26 — `messages` is a PURE SLOT; content/economics live on `message_variants`. The 3-step dance
//     (slot pointer-null → variant pool → set `selectedVariantId`) is `canon-write.ts`'s pattern.
//   • D28 — no character version table: the chat↔character link is the `chat_participants.characterId` seat
//     (live `characters.id`); dedup + branch resolution scope through THAT junction.
//   • D18 — no `chats.ownerId`: the owner is the host participant; dedup/branch scope is "this character's
//     chats" (inherently owner-local — the character is owned).
//
// LOAD-BEARING (import already computed these into the input; carried into the writes):
//   • `updatedAt` = the ST `Math.max(send_dates)` (import supplies it — NOT `now`).
//   • `importHash` (file bytes) = the per-chat dedup oracle — pre-fetched in ONE query AND updated mid-loop.
// ATOMICITY: each chat commits as ONE `db.batch`; `db.transaction()` is BANNED (the `:memory:` trap). A
// kill-mid-import leaves zero rows for the in-flight chat (the importHash dedup heals the re-run).

import type { BulkImportChatInput, BulkImportChatsResult } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import {
  characters,
  chatParticipants,
  chats,
  messageAssets,
  messages,
  messageVariants,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { tokenizeContent } from "@orb/kit/content";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, CharacterId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import type { BulkImportChats, ChatImportContext } from "../contract/import";

/** #67 — the distinct inline `asset:<id>` refs in a message's content (across all its variants). The ONE ref
 *  grammar (`tokenizeContent`) — never a hand-rolled regex. Import re-creates a `message_assets` retaining row
 *  for each that ALSO exists on the target box (the caller filters by existence). */
function assetRefsInMessage(message: BulkImportChatInput["messages"][number]): AssetId[] {
  const ids = new Set<string>();
  for (const v of message.variants) {
    for (const span of tokenizeContent(v.content)) {
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

/** The character must exist AND be the caller's — the standalone loose-chats path lets the user pick the
 *  target, so this is the ownership gate (leak-free `DomainNotFoundError`). A precondition read; the roster
 *  FK would fail-closed anyway, but the explicit check gives a typed answer. */
async function assertOwnedCharacter(
  db: Db,
  ownerId: UserId,
  characterId: CharacterId,
): Promise<void> {
  const owned = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .limit(1);
  if (owned[0] === undefined) {
    throw new DomainNotFoundError("character", characterId);
  }
}

/** Pre-fetch the `importHash`es this CHARACTER already has (the byte-identical dedup oracle, scoped through
 *  the character-seat junction — inherently owner-local, D18/D28). ONE query; returns a query-local seen-map. */
async function loadExistingHashes(
  db: Db,
  characterId: CharacterId,
  hashes: readonly string[],
): Promise<Record<string, true>> {
  const seen: Record<string, true> = {};
  if (hashes.length === 0) {
    return seen;
  }
  const rows = await db
    .select({ importHash: chats.importHash })
    .from(chats)
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
    .where(
      and(eq(chatParticipants.characterId, characterId), inArray(chats.importHash, [...hashes])),
    );
  for (const r of rows) {
    if (r.importHash !== null) {
      seen[r.importHash] = true;
    }
  }
  return seen;
}

/** The founding roster for an imported chat (host human + the one character), matching `roster.ts`'s row
 *  shape. Imported chats are owner-authored (no agent principal at import time); `joinSeq=0` (born here). */
function rosterRows(args: {
  readonly ctx: ChatImportContext;
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
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
    {
      id: args.ctx.newParticipantId(),
      chatId: args.chatId,
      kind: "character",
      characterId: args.characterId,
      role: "member",
      joinedAt: args.now,
      joinSeq: 0,
    },
  ];
}

interface MessageStatementsArgs {
  readonly ctx: ChatImportContext;
  readonly messageId: MessageId;
  readonly chatId: ChatId;
  readonly seq: number;
  readonly message: BulkImportChatInput["messages"][number];
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  /** #67 — the asset ids confirmed to EXIST on the target box (pre-filtered per chat). A message's inline
   *  `asset:<id>` ref in this list gets a `message_assets` retaining row re-created in the SAME batch. */
  readonly existingAssetIds: readonly AssetId[];
}

/** The D26 statements for ONE imported message: slot (pointer null) → its variant pool → set the pointer.
 *  Attribution is SLOT-level (D26): a user turn carries the owner + the pre-resolved persona; an assistant
 *  turn carries the character; system carries neither. */
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
        characterId: message.role === "assistant" ? args.characterId : null,
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
  stmts.push(
    batchStmt(db.update(messages).set({ selectedVariantId }).where(eq(messages.id, messageId))),
  );
  // #67 — re-create the STRUCTURAL `message_assets` retaining rows for this message's inline attachments that
  // exist on the target box (the body `asset:<id>` ref already round-tripped through the variant content).
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

/** Commit one chat's statements as ONE atomic `db.batch` — wrapped so the per-chat loop calls a function
 *  (not a bare `db.*` in-loop) while keeping the deliberate per-chat atomicity. */
function commitChatBatch(db: Db, stmts: readonly BatchStmt[]): Promise<unknown> {
  return db.batch(batchMany(stmts));
}

/** Resolve `parentRef` (a parent FILENAME) → the parent chat's id, across ALL of this character's chats
 *  (prior runs included). Newest-last (ascending createdAt, id) so the freshest row wins. ONE atomic batch. */
async function resolveBranches(
  db: Db,
  characterId: CharacterId,
  pending: readonly PendingParent[],
): Promise<number> {
  if (pending.length === 0) {
    return 0;
  }
  const all = await db
    .select({ id: chats.id, importedFrom: chats.importedFrom, createdAt: chats.createdAt })
    .from(chats)
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
    .where(eq(chatParticipants.characterId, characterId));
  const byFile = new Map<string, ChatId>();
  const candidates = all
    .filter(
      (c): c is { id: ChatId; importedFrom: string; createdAt: number } => c.importedFrom !== null,
    )
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const c of candidates) {
    byFile.set(c.importedFrom, c.id);
  }
  const linkStmts: BatchStmt[] = [];
  for (const p of pending) {
    const parentId = byFile.get(p.parentRef);
    if (parentId !== undefined && parentId !== p.chatId) {
      linkStmts.push(
        batchStmt(
          db
            .update(chats)
            .set({ parentChatId: parentId, forkedAt: p.forkedAt })
            .where(eq(chats.id, p.chatId)),
        ),
      );
    }
  }
  if (linkStmts.length > 0) {
    await db.batch(batchMany(linkStmts));
  }
  return linkStmts.length;
}

/** The per-chat write args (bundled — the write threads the same run-level context + owner/character). */
interface OneChatArgs {
  readonly ctx: ChatImportContext;
  readonly chatId: ChatId;
  readonly ci: BulkImportChatInput;
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  /** #67 — the target-box-EXISTING subset of this chat's inline `asset:<id>` refs (pre-resolved once per
   *  chat via `ctx.filterExistingAssetIds`), so `message_assets` rows re-create without a dangling FK. */
  readonly existingAssetIds: readonly AssetId[];
}

/** The chat row + founding roster inserts for one imported chat. The ST author's note round-trips through
 *  the typed room-override home (export-chat.ts reads it back from here); absent → null metadata. */
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
        metadata:
          ci.authorsNote !== null
            ? { roomOverrides: { authorsNote: { prompt: ci.authorsNote } } }
            : null,
        createdAt: ci.createdAt,
        updatedAt: ci.updatedAt,
      }),
    ),
    ...rosterRows({
      ctx,
      chatId,
      ownerId,
      characterId,
      anchorPersonaId: ci.anchorPersonaId,
      now: ci.createdAt,
    }).map((r) => batchStmt(db.insert(chatParticipants).values(r))),
  ];
}

/** All statements for ONE imported chat (header + roster + the D26 message slots/variants) + its tallies. */
function buildChatStatements(args: OneChatArgs): {
  readonly stmts: BatchStmt[];
  readonly messageCount: number;
  readonly variantCount: number;
} {
  const { ctx, chatId, ci, ownerId, characterId, existingAssetIds } = args;
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
    });
    stmts.push(...built.stmts);
    messageCount += 1;
    variantCount += built.variantCount;
    seq += 1;
  }
  return { stmts, messageCount, variantCount };
}

/**
 * Build the chat-owned bulk-import WRITE op. Dup-skips by `chats.importHash`, commits each chat as ONE
 * `db.batch` (chat → roster → slots → variants), then resolves branch parents character-wide. Throws
 * {@link DomainNotFoundError} when the target character isn't the caller's.
 */
export function createBulkImportChats(ctx: ChatImportContext): BulkImportChats {
  return async ({ ownerId, characterId, chats: input }): Promise<BulkImportChatsResult> => {
    const { db } = ctx;
    await assertOwnedCharacter(db, ownerId, characterId);
    const existing = await loadExistingHashes(
      db,
      characterId,
      input.map((c) => c.importHash),
    );

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
      // #67 — pre-resolve which of this chat's inline `asset:<id>` refs actually exist on the target box (ONE
      // owner-scoped read per chat), so `message_assets` rows re-create only for landed blobs (no dangling FK).
      // biome-ignore lint/performance/noAwaitInLoops: one bounded existence read per imported chat (the same per-chat granularity as the atomic commit below); a foreign asset would fail-closed the whole chat batch otherwise.
      const existingAssetIds = await ctx.filterExistingAssetIds(
        ownerId,
        ci.messages.flatMap(assetRefsInMessage),
      );
      const { stmts, messageCount, variantCount } = buildChatStatements({
        ctx,
        chatId,
        ci,
        ownerId,
        characterId,
        existingAssetIds,
      });
      if (ci.parentRef !== null) {
        pendingParents.push({ chatId, parentRef: ci.parentRef, forkedAt: ci.createdAt });
      }

      // ONE atomic batch per chat (the D26 3-step per message is FK-safe in emitted order). A kill mid-batch
      // leaves zero rows for this chat; `db.transaction()` is BANNED (the `:memory:` trap). Wrapped in
      // `commitChatBatch` so the per-chat atomicity is deliberate, not a stray in-loop query.
      // biome-ignore lint/performance/noAwaitInLoops: the chat is the unit of import atomicity — one atomic db.batch per chat bounds memory on big corpora (the resumable importHash dedup heals a partial run).
      await commitChatBatch(db, stmts);
      chatsImported += 1;
      messagesImported += messageCount;
      variantsImported += variantCount;
      if (ci.isRealConversation) {
        realConversationWritten = true;
      }
    }

    const branchesLinked = await resolveBranches(db, characterId, pendingParents);
    return {
      chatsImported,
      chatsSkipped,
      messagesImported,
      variantsImported,
      branchesLinked,
      realConversationWritten,
    };
  };
}
