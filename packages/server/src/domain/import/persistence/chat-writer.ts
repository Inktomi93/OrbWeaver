// domain/import/persistence/chat-writer — the ST chat → canon writer (PD-77). The EXPLICIT named exception
// to "persistence is queries only" (like chat's `canon-write.ts` / `lock.ts`): it builds the INSERT/UPDATE
// statements that commit an imported chat's slots + variants + roster, and resolves branch parents. Writes
// against `@orb/db` DIRECTLY — the sanctioned bulk-serializer exemption the export reads use (RULING A). The
// import domain sideways-imports NO other domain: the `chat_participants` row SHAPE mirrors chat's
// `persistence/roster.ts` contract (host human `role='host'` + the character `role='member'`, `joinSeq=0`),
// built here rather than reached across the boundary.
//
// D-LEDGER adaptations from the neo writer:
//   • D26 — `messages` is a PURE SLOT; ALL content/economics live on `message_variants`. The 3-step dance
//     (insert slot pointer-null → insert variant(s) → set `selectedVariantId`) is chat's `canon-write.ts`
//     pattern; the SELECTED variant's content is the authoritative `mes` (esoterica 3).
//   • D28 — no character version table: the chat↔character link is the `chat_participants.characterId` seat
//     (keyed on live `characters.id`); dedup + branch resolution scope through THAT junction (no `cv_id`).
//   • D18 — no `chats.ownerId`: the owner is the host participant. Dedup/branch scope is "this character's
//     chats" (the character-seat join), which is inherently owner-local (the character is owned).
//
// THE LOAD-BEARING ESOTERICA (carried verbatim — `import-st-profile-waves.md` §"The chat writer"):
//   2. `updatedAt = Math.max(send_dates)`, NOT import `now` (stamping now piles the corpus at the top of the
//      recent-chats feed; send_dates are non-monotonic → max, not last).
//   4. `chats.importHash` (file bytes) is the per-chat dedup oracle — pre-fetched in ONE query AND updated
//      mid-loop (two byte-identical files in one run both skip).
// ATOMICITY: each chat commits as ONE `db.batch`; `db.transaction()` is BANNED (the `:memory:` trap). A
// kill-mid-import leaves zero rows for the in-flight chat (the importHash dedup heals the re-run).

import type { Db } from "@orb/db";
import { chatParticipants, chats, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type {
  CharacterId,
  ChatId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import type { ImportProfileDeps } from "../contract/service";
import type { CollectedChat, ParsedChatMessage } from "../contract/views";

// The imported-chat title is the source filename minus its extension (top-level per useTopLevelRegex).
const JSONL_EXT = /\.jsonl$/i;

/** The tallies one chat-import pass returns (file-local — the verb maps it to `ImportChatsResult`). */
interface ChatWriteCounts {
  readonly chatsImported: number;
  readonly chatsSkipped: number;
  readonly messagesImported: number;
  readonly variantsImported: number;
  readonly branchesLinked: number;
  /** True when ≥1 `real_conversation` chat was written (the PD-78 backfill gate). */
  readonly realConversationWritten: boolean;
}

/** One variant row's columns for a message slot (the D26 economics subset the import carries). */
interface VariantColumns {
  readonly idx: number;
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly ttftMs: number | null;
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  readonly metadata: Record<string, unknown> | null;
}

/** Build the variant pool + the selected index for a parsed message (D26 — the SELECTED variant's content is
 *  the authoritative `mes`). A multi-swipe message uses its swipe pool; when the active swipe was empty-
 *  dropped (`activeVariantIdx` null) OR there is no pool, a variant carrying `mes` + the message-level
 *  economics is appended and selected — so the rendered content is ALWAYS `mes`. `ttftMs` (message-level in
 *  ST) rides on the selected variant. */
function buildVariantColumns(m: ParsedChatMessage): {
  readonly variants: VariantColumns[];
  readonly selectedIdx: number;
} {
  if (m.variants.length > 0 && m.activeVariantIdx !== null) {
    const variants = m.variants.map(
      (v): VariantColumns => ({
        idx: v.idx,
        content: v.content,
        model: v.model,
        provider: v.provider,
        tokensOut: v.tokensOut,
        reasoning: v.reasoning,
        ttftMs: null,
        genStartedAt: v.genStarted,
        genFinishedAt: v.genFinished,
        metadata: v.metadata,
      }),
    );
    const selected = variants[m.activeVariantIdx];
    if (selected !== undefined) {
      // ST's active swipe IS the rendered `mes`; the message-level ttft belongs to that generation.
      return {
        variants: variants.map((v) =>
          v.idx === m.activeVariantIdx ? { ...v, ttftMs: m.ttftMs } : v,
        ),
        selectedIdx: m.activeVariantIdx,
      };
    }
  }
  // No pool, or the active swipe was empty-dropped: the swipe pool (if any) rides as alternates + a `mes`
  // variant is appended and selected (esoterica 3 — `mes` is authoritative regardless).
  const alternates = m.variants.map(
    (v): VariantColumns => ({
      idx: v.idx,
      content: v.content,
      model: v.model,
      provider: v.provider,
      tokensOut: v.tokensOut,
      reasoning: v.reasoning,
      ttftMs: null,
      genStartedAt: v.genStarted,
      genFinishedAt: v.genFinished,
      metadata: v.metadata,
    }),
  );
  const mesIdx = alternates.length;
  alternates.push({
    idx: mesIdx,
    content: m.content,
    model: m.model,
    provider: m.provider,
    tokensOut: m.tokensOut,
    reasoning: m.reasoning,
    ttftMs: m.ttftMs,
    genStartedAt: m.genStarted,
    genFinishedAt: m.genFinished,
    metadata: m.metadata,
  });
  return { variants: alternates, selectedIdx: mesIdx };
}

interface MessageStatementsArgs {
  readonly db: Db;
  readonly messageId: MessageId;
  readonly chatId: ChatId;
  readonly seq: number;
  readonly message: ParsedChatMessage;
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly chatPersonaId: PersonaId | null;
  readonly createdAt: number;
  readonly newVariantId: () => MessageVariantId;
}

/** The D26 statements for ONE imported message: slot (pointer null) → its variant pool → set the pointer.
 *  Returns the batch fragment + the variant count. Attribution is SLOT-level (D26): a user turn carries the
 *  owner + the matched persona; an assistant turn carries the character; system carries neither. */
function messageStatements(args: MessageStatementsArgs): {
  readonly stmts: BatchStmt[];
  readonly variantCount: number;
} {
  const { db, messageId, chatId, seq, message, createdAt } = args;
  const { variants, selectedIdx } = buildVariantColumns(message);

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
        personaId: isUser ? args.chatPersonaId : null,
        selectedVariantId: null,
        createdAt,
      }),
    ),
  ];
  let selectedVariantId: MessageVariantId | null = null;
  for (const [i, v] of variants.entries()) {
    const variantId = args.newVariantId();
    if (i === selectedIdx) {
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
          createdAt,
        }),
      ),
    );
  }
  stmts.push(
    batchStmt(db.update(messages).set({ selectedVariantId }).where(eq(messages.id, messageId))),
  );
  return { stmts, variantCount: variants.length };
}

/** The founding roster for an imported chat (host human + the one character), matching chat's roster.ts row
 *  shape. Imported chats are owner-authored (no agent principal at import time); `joinSeq=0` (a born-here
 *  chat). Built inline (the bulk-serializer exemption) — import never sideways-imports chat. */
function rosterRows(args: {
  readonly deps: ImportProfileDeps;
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly chatPersonaId: PersonaId | null;
  readonly now: number;
}): (typeof chatParticipants.$inferInsert)[] {
  return [
    {
      id: args.deps.newParticipantId(),
      chatId: args.chatId,
      kind: "human",
      userId: args.ownerId,
      role: "host",
      activePersonaId: args.chatPersonaId,
      joinedAt: args.now,
      joinSeq: 0,
    },
    {
      id: args.deps.newParticipantId(),
      chatId: args.chatId,
      kind: "character",
      characterId: args.characterId,
      role: "member",
      joinedAt: args.now,
      joinSeq: 0,
    },
  ];
}

interface PendingParent {
  readonly chatId: ChatId;
  readonly parentRef: string;
  readonly forkedAt: number;
}

/** Pre-fetch the `importHash`es this CHARACTER already has (the byte-identical dedup oracle, scoped through
 *  the character-seat junction — inherently owner-local, D18/D28). ONE query for the whole batch; returns a
 *  plain `Record` seen-map (persistence holds no in-memory state — this is a query-local lookup). */
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

/** Commit one chat's statements as ONE atomic `db.batch` — wrapped so the per-chat loop calls a function
 *  (not a bare `db.*` in-loop) while keeping the deliberate per-chat atomicity. */
function commitChatBatch(db: Db, stmts: readonly BatchStmt[]): Promise<unknown> {
  return db.batch(batchMany(stmts));
}

/** Resolve `parentRef` (a parent FILENAME) → the parent chat's id, across ALL of this character's chats
 *  (prior runs included). The map is built newest-last (ascending createdAt, id) so the freshest row wins.
 *  Emits the parent-link UPDATEs as ONE atomic batch. */
async function resolveBranches(
  db: Db,
  characterId: CharacterId,
  pending: readonly PendingParent[],
): Promise<number> {
  if (pending.length === 0) {
    return 0;
  }
  const all = await db
    .select({
      id: chats.id,
      importedFrom: chats.importedFrom,
      createdAt: chats.createdAt,
    })
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

/**
 * Write a list of parsed ST chats into an existing character: dup-skip by `chats.importHash`, commit each
 * chat as ONE `db.batch` (chat → roster → slots → variants), then resolve branch parents character-wide.
 * `personaByUserName` (populated by `importPersonas`) attributes each chat's `user_name`.
 */
export async function writeImportedChats(
  deps: ImportProfileDeps,
  args: {
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    readonly chats: readonly CollectedChat[];
  },
): Promise<ChatWriteCounts> {
  const { db, now, personaByUserName } = deps;
  const { ownerId, characterId } = args;
  const existing = await loadExistingHashes(
    db,
    characterId,
    args.chats.map((c) => c.importHash),
  );

  let chatsImported = 0;
  let chatsSkipped = 0;
  let messagesImported = 0;
  let variantsImported = 0;
  let realConversationWritten = false;
  const pendingParents: PendingParent[] = [];

  for (const ci of args.chats) {
    if (existing[ci.importHash] === true) {
      chatsSkipped += 1;
      continue; // true idempotent skip — the messages were written on the first import
    }
    existing[ci.importHash] = true; // a second byte-identical file later in THIS run skips too

    const pc = ci.parsed;
    const created =
      pc.createDate ?? pc.messages.find((m) => m.sendDate !== null)?.sendDate ?? now();
    // The chat's TRUE last activity = MAX message send_date (esoterica 2) — NOT `now` (which would pile the
    // whole corpus at the top of the recent-chats feed). Non-monotonic, so `Math.max`, not last-in-order.
    const sendDates = pc.messages.flatMap((m) => (m.sendDate !== null ? [m.sendDate] : []));
    const lastActivity = sendDates.length > 0 ? Math.max(...sendDates) : created;
    const chatId = deps.newChatId();
    const key = pc.userName?.trim().toLowerCase();
    const chatPersonaId = (key !== undefined && personaByUserName.get(key)) || null;

    const stmts: BatchStmt[] = [
      batchStmt(
        db.insert(chats).values({
          id: chatId,
          title: ci.importedFrom.replace(JSONL_EXT, ""),
          anchorPersonaId: chatPersonaId,
          importedFrom: ci.importedFrom,
          importHash: ci.importHash,
          createdAt: created,
          updatedAt: lastActivity,
        }),
      ),
      ...rosterRows({ deps, chatId, ownerId, characterId, chatPersonaId, now: created }).map((r) =>
        batchStmt(db.insert(chatParticipants).values(r)),
      ),
    ];
    if (pc.parentRef !== null) {
      pendingParents.push({ chatId, parentRef: pc.parentRef, forkedAt: created });
    }

    let seq = 0;
    for (const m of pc.messages) {
      const { stmts: msgStmts, variantCount } = messageStatements({
        db,
        messageId: deps.newMessageId(),
        chatId,
        seq,
        message: m,
        ownerId,
        characterId,
        chatPersonaId,
        createdAt: m.sendDate ?? created,
        newVariantId: deps.newVariantId,
      });
      stmts.push(...msgStmts);
      messagesImported += 1;
      variantsImported += variantCount;
      seq += 1;
    }

    // ONE atomic batch per chat (D26 3-step per message is FK-safe in emitted order; a kill mid-batch
    // leaves zero rows for this chat). `db.transaction()` is BANNED (the `:memory:` trap).
    // biome-ignore lint/performance/noAwaitInLoops: the chat is the unit of import atomicity — one atomic db.batch per chat bounds memory on big corpora (the resumable importHash dedup heals a partial run).
    await commitChatBatch(db, stmts);
    chatsImported += 1;
    if (pc.bucket === "real_conversation") {
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
}
