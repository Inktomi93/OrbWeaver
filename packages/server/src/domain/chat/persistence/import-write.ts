// domain/chat/persistence/import-write — the chat-owned bulk-import WRITE, the explicit named exception to
// "persistence is queries only" (like canon-write.ts/lock.ts): commits an imported chat's slots + variants +
// founding roster and resolves branch parents.
//
// LOAD-BEARING: `updatedAt` is the ST max(send_dates) carried in from import (not `now`); `importHash` is the
// per-chat provenance while `chat_import_claims` is the scoped atomic dedup oracle. Each chat + claim commits
// as ONE db.batch — db.transaction() is BANNED (the :memory: trap) — so a kill mid-import leaves zero rows.

import type { BulkImportChatInput, BulkImportChatsResult, ChatMetadata, ImportedChatIdentity, MessageKind } from "@orb/contracts/chat";
import { DEFAULT_MESSAGE_KIND } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { characters, chatImportClaims, chatInjections, chatParticipants, chats, messageAssets, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt, isConstraintViolation } from "@orb/db/kit";
import { tokenizeContent } from "@orb/kit/content";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, CharacterId, ChatId, MessageId, MessageVariantId, ModelId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { BulkImportChats, ChatImportContext } from "../contract/import.ts";
import { parseChatMetadata } from "../contract/metadata.ts";
import { carriesAssetBackground, guardedChatId } from "./background-write.ts";

/** The distinct inline `asset:<id>` refs in a message's content, across all its variants. */
function assetRefsInMessage(message: BulkImportChatInput["messages"][number]): AssetId[] {
  // @orb-waive persistence-no-in-memory-state(Set): query-local dedup Set for asset refs in a message. Ends if it outlives the call.
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
  // @orb-waive persistence-no-in-memory-state(Set): query-local membership Set over the row set this query just returned. Ends if it outlives the call.
  const ownedIds = new Set(owned.map((row) => row.id));
  for (const characterId of characterIds) {
    if (!ownedIds.has(characterId)) {
      throw new DomainNotFoundError("character", characterId);
    }
  }
}

/** The DISTINCT seated character ids for one imported chat: the run's primary first (it is the header character —
 *  `loadExistingHashes`/`resolveBranches` scope on it), then this chat's extra roster seats in order. */
function seatedCharacterIds(primary: CharacterId, additionalCharacterIds: readonly CharacterId[] | undefined): readonly CharacterId[] {
  return [primary, ...(additionalCharacterIds ?? []).filter((id) => id !== primary)];
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
  // @orb-waive persistence-no-in-memory-state(Set): call-local membership Set over one input's seats (a pure precondition check, no state survives the call). Ends if it outlives the call.
  const seated = new Set(seatedCharacterIds(primary, ci.characterIds));
  for (const m of ci.messages) {
    const named = namedSpeaker(m);
    if (named !== null && !seated.has(named)) {
      throw new DomainNotFoundError("chat_participant", named);
    }
  }
}

/** Referential gate for the per-seat KNOBS (#1687), the {@link assertSeatedSpeakers} posture: a knob may only
 *  configure a seat this chat actually SEATS. Dropping an unseated knob silently would make "the mute
 *  travelled" a claim nobody can check — the whole point of carrying the flag. */
function assertSeatedKnobs(ci: BulkImportChatInput, primary: CharacterId): void {
  if (ci.seatKnobs === undefined || ci.seatKnobs.length === 0) {
    return;
  }
  // @orb-waive persistence-no-in-memory-state(Set): call-local membership Set over one input's seats (a pure precondition check, no state survives the call). Ends if it outlives the call.
  const seated = new Set(seatedCharacterIds(primary, ci.characterIds));
  for (const knob of ci.seatKnobs) {
    if (!seated.has(knob.characterId)) {
      throw new DomainNotFoundError("chat_participant", knob.characterId);
    }
  }
}

/** What a pre-existing import of one `importHash` looks like to the dedup gate: the room it landed as, and
 *  whether that room still has NO anchor persona (the heal's gate — see {@link healPersonaAttribution}). */
interface ExistingImport {
  readonly chatId: ChatId;
  readonly anchorPersonaId: PersonaId | null;
}

/** Pre-fetch the exact scoped import claims. Keyed by hash → the room it is, because the dedup branch no
 *  longer only SKIPS: it heals the room's persona attribution when this run can resolve one and the stored
 *  room never got one. */
async function loadExistingImports(db: Db, characterId: CharacterId, hashes: readonly string[]): Promise<Record<string, ExistingImport>> {
  const seen: Record<string, ExistingImport> = {};
  if (hashes.length === 0) {
    return seen;
  }
  const rows = await db
    .select({ id: chats.id, importHash: chatImportClaims.importHash, anchorPersonaId: chats.anchorPersonaId })
    .from(chatImportClaims)
    .innerJoin(chats, eq(chats.id, chatImportClaims.chatId))
    .where(and(eq(chatImportClaims.characterId, characterId), inArray(chatImportClaims.importHash, [...hashes])));
  for (const r of rows) {
    if (seen[r.importHash] === undefined) {
      seen[r.importHash] = { chatId: r.id, anchorPersonaId: r.anchorPersonaId };
    }
  }
  return seen;
}

/**
 * The DEDUP-SKIP arm's HEAL (owner ruling 2026-08-17): back-fill persona attribution onto a room that was
 * already imported without it.
 *
 * WHY IT CANNOT BE A RE-IMPORT. The importer is idempotent by `chats.importHash`, so once a transcript has
 * landed, a re-run skips it forever — a corpus imported while the mapper could not yet resolve its persona
 * (the `user_name: "unused"` majority, healed by the per-turn `name` signal the mapper now reads) would stay
 * unattributed for good, and the only alternatives are a wipe or a bespoke maintenance pass. So the ordinary
 * re-run IS the heal path, and it is re-runnable by construction: every statement below is guarded on the
 * column still being NULL.
 *
 * WHY ONLY WHERE NULL. `anchorPersonaId` / `activePersonaId` / `messages.personaId` are all owner-editable
 * after the import (the room's playing-as pin, a seat's active persona, an edited turn). An import re-run is
 * not authority over a choice a human made later — it only fills the blanks it left. That guard is what makes
 * this safe to run on every subsequent import, forever.
 *
 * The three planes are the same three the fresh write sets, so a healed room is indistinguishable from one
 * imported today: the room's pin, the HOST SEAT's active persona (scoped to `ownerId` — a member's seat is
 * their own business), and each user slot, matched by `seq` (which the fresh write assigns as the input
 * index, so `ci.messages[i]` ↔ `seq = i` is exact, not a heuristic).
 */
function healPersonaAttribution(ctx: ChatImportContext, existing: ExistingImport, ownerId: UserId, ci: BulkImportChatInput): BatchStmt[] {
  const { db } = ctx;
  const anchor = ci.anchorPersonaId;
  // Gated twice — the stored room must still be anchor-less AND this run must have resolved a persona for it —
  // so an ordinary re-import of an already-attributed corpus produces ZERO statements.
  if (anchor === null || existing.anchorPersonaId !== null) {
    return [];
  }
  const stmts: BatchStmt[] = [
    batchStmt(
      db
        .update(chats)
        .set({ anchorPersonaId: anchor })
        .where(and(eq(chats.id, existing.chatId), isNull(chats.anchorPersonaId))),
    ),
    batchStmt(
      db
        .update(chatParticipants)
        .set({ activePersonaId: anchor })
        .where(
          and(
            eq(chatParticipants.chatId, existing.chatId),
            eq(chatParticipants.kind, "human"),
            eq(chatParticipants.userId, ownerId),
            isNull(chatParticipants.activePersonaId),
          ),
        ),
    ),
  ];
  for (const [seq, m] of ci.messages.entries()) {
    const personaId = m.role === "user" ? m.personaId : null;
    if (personaId === null) {
      continue;
    }
    stmts.push(
      batchStmt(
        db
          .update(messages)
          .set({ personaId })
          .where(and(eq(messages.chatId, existing.chatId), eq(messages.seq, seq), eq(messages.role, "user"), isNull(messages.personaId))),
      ),
    );
  }
  return stmts;
}

/** The founding roster for an imported chat (host human + every seated character); `joinSeq=0` (born here).
 *  A single-character `characterIds` is byte-identically the pre-roster two-row shape. */
function rosterRows(args: {
  readonly ctx: ChatImportContext;
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  readonly characterIds: readonly CharacterId[];
  readonly anchorPersonaId: BulkImportChatInput["anchorPersonaId"];
  /** The chat's declared per-seat knobs (#1687). A seat with none takes the columns' own defaults, which is
   *  byte-identically the pre-#1687 row — the knobs are SPREAD, never defaulted here, so the column stays the
   *  one home for "what an unspecified knob means". */
  readonly seatKnobs: BulkImportChatInput["seatKnobs"];
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
    ...args.characterIds.map((characterId): typeof chatParticipants.$inferInsert => {
      const knobs = args.seatKnobs?.find((knob) => knob.characterId === characterId);
      return {
        id: args.ctx.newParticipantId(),
        chatId: args.chatId,
        kind: "character",
        characterId,
        role: "member",
        ...(knobs?.talkativeness === undefined ? {} : { talkativeness: knobs.talkativeness }),
        ...(knobs?.disabled === undefined ? {} : { disabled: knobs.disabled }),
        joinedAt: args.now,
        joinSeq: 0,
      };
    }),
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

function importedModelId(raw: string | null): ModelId | null {
  return modelIdSchema.safeParse(raw).data ?? null;
}

function importedProviderId(raw: string | null): ProviderId | null {
  return providerIdSchema.safeParse(raw).data ?? null;
}

/** Is this slot the room's narrator voice? ONE reading of the declared kind (D129), shared by the attribution
 *  router and the mint gate below so the two can never disagree about which rows made the mint necessary. */
function isNarratorSlot(message: BulkImportChatInput["messages"][number]): boolean {
  return message.role === "assistant" && message.kind === "narrator";
}

/** WHO voices this slot: the room's synthetic narrator identity (a `narrator`-kind slot — the
 *  `output:"narrator"` grammar), else the message's own `characterId` (a per-speaker group transcript names its
 *  speaker per turn), else the run's primary (the single-voice ST transcript — the pre-roster behavior,
 *  unchanged). A `user` slot is never character-attributed. A named id is already proven seated by
 *  {@link assertSeatedSpeakers}; `narratorCharacterId` is null exactly when no slot asked for it. */
function slotCharacterId(message: BulkImportChatInput["messages"][number], primary: CharacterId, narratorCharacterId: CharacterId | null): CharacterId | null {
  if (message.role !== "assistant") {
    return null;
  }
  if (isNarratorSlot(message) && narratorCharacterId !== null) {
    return narratorCharacterId;
  }
  return message.characterId ?? primary;
}

/** The slot's stored PURPOSE. The DB column defaults to `standard`, but the value is written EXPLICITLY here:
 *  an import is a WRITER like any other (D129's writer belt), and a writer that leaves the column to its
 *  default is a writer whose intent nobody can read at the call site. `narrator` additionally implies the
 *  synthetic attribution above, which is why one field now carries what a separate boolean flag used to.
 *
 *  The role gate is the same belt {@link isNarratorSlot} applies: `messages_kind_shape` CHECKs
 *  `narrator ⇒ assistant` (D129(C)), and a caller-supplied input that got that pair wrong would otherwise abort
 *  the whole batch at the db rather than landing an honestly-defaulted row. */
function slotKind(message: BulkImportChatInput["messages"][number]): MessageKind {
  const declared = message.kind ?? DEFAULT_MESSAGE_KIND;
  return declared === "narrator" && !isNarratorSlot(message) ? DEFAULT_MESSAGE_KIND : declared;
}

/** Does this chat carry any narrator-voiced slot? Gates the once-per-chat mint so a plain ST import never
 *  touches the synthetic-character namespace at all (byte-identical: no mint, no extra row, no query). */
function hasNarratorSlot(ci: BulkImportChatInput): boolean {
  return ci.messages.some(isNarratorSlot);
}

/** Statements for ONE imported message: slot (pointer null) → its variant pool → set the pointer. `variantIds`
 *  comes back INDEX-ALIGNED to `message.variants` — the R6 remap the orb-native bundle re-links its carried
 *  rpg planes through (`ImportedChatIdentity`). */
function messageStatements(args: MessageStatementsArgs): {
  readonly stmts: BatchStmt[];
  readonly variantIds: readonly MessageVariantId[];
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
        kind: slotKind(message),
        authorUserId: isUser ? args.ownerId : null,
        characterId: slotCharacterId(message, args.characterId, args.narratorCharacterId),
        personaId: isUser ? message.personaId : null,
        selectedVariantId: null,
        // Imported history was not typed in this app: the viewer's last-turn reads skip it.
        initiator: "import",
        createdAt: message.createdAt,
      }),
    ),
  ];
  let selectedVariantId: (typeof messageVariants.$inferInsert)["id"] | null = null;
  const variantIds: MessageVariantId[] = [];
  for (const [i, v] of message.variants.entries()) {
    const variantId = ctx.newMessageVariantId();
    variantIds.push(variantId);
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
          model: importedModelId(v.model),
          provider: importedProviderId(v.provider),
          // `tokensIn` is supplied by the orb-native bundle AND by the ST arm's user/system slots (the
          // role-routed `extra.token_count`); `variableDelta` stays orb-native-only.
          tokensIn: v.tokensIn ?? null,
          tokensOut: v.tokensOut,
          tokenProvenance: v.tokenProvenance,
          reasoning: v.reasoning,
          ttftMs: v.ttftMs,
          genStartedAt: v.genStartedAt,
          genFinishedAt: v.genFinishedAt,
          variableDelta: v.variableDelta ?? null,
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
            // An imported attachment is a user upload by construction (ST carries no model-emitted pictures).
            origin: "attached",
            createdAt: message.createdAt,
          }),
        ),
      );
    }
  }
  return { stmts, variantIds };
}

/** Append one room's heal statements to the run's pool; `1` when that room contributed any (the per-CHAT
 *  heal count), `0` when it had nothing to heal. */
function collectInto(pool: BatchStmt[], stmts: readonly BatchStmt[]): number {
  pool.push(...stmts);
  return stmts.length > 0 ? 1 : 0;
}

/** Commit one chat's statements as ONE atomic `db.batch`. */
function commitChatBatch(db: Db, stmts: readonly BatchStmt[]): Promise<unknown> {
  return db.batch(batchMany(stmts));
}

/** Resolve `parentRef` (a parent filename) → the parent chat's id, across all of this character's chats. */
async function resolveBranches(ctx: ChatImportContext, ownerId: UserId, characterId: CharacterId, pending: readonly PendingParent[]): Promise<number> {
  const { db } = ctx;
  if (pending.length === 0) {
    return 0;
  }
  const all = await db
    .select({ id: chats.id, importedFrom: chats.importedFrom, createdAt: chats.createdAt })
    .from(chats)
    .innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id))
    .where(eq(chatParticipants.characterId, characterId));
  // @orb-waive persistence-no-in-memory-state(Map): query-local dedup Map for import-from linkage. Ends if it outlives the call.
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
    ctx.bumpStatsCanonVersion(linkStmts, db, ownerId);
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

/** The chat's whole PROSE plane, written verbatim from the ONE carried list. Both arms arrive here already
 *  resolved: an orb-native bundle carries its `chat_injections` rows as they stood, and the ST arm's mapper
 *  (`domain/import/substrate/chat-input.ts`) has already converted `note_prompt` + ST's recorded placement
 *  knobs into exactly one row, applying the house author's-note register as the fallback. This write op holds
 *  no placement policy of its own — it used to hardcode `in_chat`/depth 4/`system` for the ST arm, which
 *  silently overrode the placement 1,070 corpus chats actually recorded. */
function injectionStmts(ctx: ChatImportContext, chatId: ChatId, ci: BulkImportChatInput): BatchStmt[] {
  const { db } = ctx;
  return (ci.injections ?? []).map((injection) =>
    batchStmt(
      db.insert(chatInjections).values({
        id: ctx.newChatInjectionId(),
        chatId,
        position: injection.position,
        depth: injection.depth,
        role: injection.role,
        content: injection.content,
        order: injection.order,
        createdAt: injection.createdAt,
      }),
    ),
  );
}

/** The chat row + founding roster inserts for one imported chat. Per-chat prose rides in as `chat_injections`
 *  rows — the ONE per-chat prose door (the retired `roomOverrides.authorsNote` twin
 *  landed as the SAME at-depth splice). */
function chatHeaderStmts({ ctx, chatId, ci, ownerId, characterId }: OneChatArgs): BatchStmt[] {
  const { db } = ctx;
  const metadata = ci.metadata === undefined ? null : parseChatMetadata(ci.metadata);
  return [
    batchStmt(
      db.insert(chats).values({
        id: guardedChatId(db, chatId, metadata),
        title: ci.title,
        anchorPersonaId: ci.anchorPersonaId,
        importedFrom: ci.importedFrom,
        importHash: ci.importHash,
        // BORN CLAIMED (R0 §4.2): this room arrives with canon already in it, so there is no unstarted
        // state for a husk to represent and the reaper must never see it. `startChat` is the ONE mint
        // that produces a husk.
        startedAt: ctx.now(),
        // Absent ⇒ NULL, byte-identically the ST import. A supplied blob goes through the column's OWN
        // parser (the same fault-isolated read seam every consumer uses) so a caller can never land a
        // sub-blob shape the readers would heal away — one validation home, no second spelling here.
        metadata,
        // R6 orb-native extras. Each `?? <column default>` is the ST arm's behavior spelled out loud: an
        // interchange transcript declares none of these and lands exactly the row it landed before R6.
        // DELIBERATELY ABSENT: `runtimeVariables` (DERIVED — re-folded from the carried per-variant deltas),
        // `temporary` (an ephemeral room its own TTL sweeper already decided to reap), and the pending-handoff
        // pair (it names a USER that does not exist on this box).
        starred: ci.starred ?? false,
        archived: ci.archived ?? false,
        compactSummary: ci.compactSummary ?? null,
        compactedAtSeq: ci.compactedAtSeq ?? null,
        variableValues: ci.variableValues ?? null,
        userMacroValues: ci.userMacroValues ?? null,
        createdAt: ci.createdAt,
        updatedAt: ci.updatedAt,
      }),
    ),
    // THE claim: the composite PK is the concurrent arbiter, and this statement's place in the room batch
    // means a loser leaves neither a claim nor any portion of its candidate room.
    batchStmt(
      db.insert(chatImportClaims).values({
        chatId,
        characterId,
        importHash: ci.importHash,
        createdAt: ctx.now(),
      }),
    ),
    ...injectionStmts(ctx, chatId, ci),
    ...rosterRows({
      ctx,
      chatId,
      ownerId,
      characterIds: seatedCharacterIds(characterId, ci.characterIds),
      anchorPersonaId: ci.anchorPersonaId,
      seatKnobs: ci.seatKnobs,
      now: ci.createdAt,
    }).map((r) => batchStmt(db.insert(chatParticipants).values(r))),
  ];
}

/** All statements for ONE imported chat (header + roster + message slots/variants) + the identity of what it
 *  writes. `identity` is INDEX-ALIGNED to `ci.messages` — the R6 remap (`ImportedChatIdentity`); the tallies
 *  the caller reports are derived from it rather than counted separately, so the count and the remap cannot
 *  disagree about what landed. */
function buildChatStatements(args: OneChatArgs): {
  readonly stmts: BatchStmt[];
  readonly identity: ImportedChatIdentity;
} {
  const { ctx, chatId, ci, ownerId, characterId, existingAssetIds, narratorCharacterId } = args;
  const stmts = chatHeaderStmts(args);
  const messageIds: MessageId[] = [];
  const variantIds: (readonly MessageVariantId[])[] = [];
  let seq = 0;
  for (const m of ci.messages) {
    const messageId = ctx.newMessageId();
    const built = messageStatements({
      ctx,
      messageId,
      chatId,
      seq,
      message: m,
      ownerId,
      characterId,
      existingAssetIds,
      narratorCharacterId,
    });
    stmts.push(...built.stmts);
    messageIds.push(messageId);
    variantIds.push(built.variantIds);
    seq += 1;
  }
  return { stmts, identity: { chatId, messageIds, variantIds } };
}

/** EVERY character id a run could seat or attribute: the primary, each chat's extra roster, and each slot's
 *  named speaker. Ownership-gated in one pass before any write, so a foreign id anywhere refuses the whole
 *  run rather than landing a partially-correct room. */
function everyReferencedCharacter(primary: CharacterId, input: readonly BulkImportChatInput[]): CharacterId[] {
  const ids: CharacterId[] = [primary];
  for (const c of input) {
    ids.push(...(c.characterIds ?? []));
    // A knob names a seat; an id that reaches the ownership gate here can never be one the seat gate below
    // then refuses for the wrong reason (foreign reads as unseated).
    ids.push(...(c.seatKnobs ?? []).map((knob) => knob.characterId));
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

/** The run's whole-input gates, BEFORE any write: EVERY id this run could seat, attribute or CONFIGURE — the
 *  primary, every chat's extra roster, every slot's named speaker, every per-seat knob (#1687) — must be the
 *  caller's, and every named speaker and knob must be seated in its own room. A foreign or unseated id
 *  anywhere refuses the whole run rather than landing a partially-correct room. */
async function assertImportPreconditions(db: Db, ownerId: UserId, characterId: CharacterId, input: readonly BulkImportChatInput[]): Promise<void> {
  await assertOwnedCharacters(db, ownerId, everyReferencedCharacter(characterId, input));
  for (const ci of input) {
    assertSeatedSpeakers(ci, characterId);
    assertSeatedKnobs(ci, characterId);
  }
}

interface ImportRunState {
  readonly existing: Record<string, ExistingImport>;
  readonly identities: ImportedChatIdentity[];
  readonly written: ImportedChatIdentity[];
  readonly pendingParents: PendingParent[];
  readonly healStmts: BatchStmt[];
  chatsImported: number;
  chatsSkipped: number;
  messagesImported: number;
  variantsImported: number;
  chatsPersonaHealed: number;
  realConversationWritten: boolean;
}

/** Record a deduplicated candidate and its optional attribution heal in one place. */
async function loadImportedIdentity(db: Db, chatId: ChatId): Promise<ImportedChatIdentity> {
  const slots = await db.select({ id: messages.id }).from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.seq));
  const messageIds = slots.map((slot) => slot.id);
  if (messageIds.length === 0) {
    return { chatId, messageIds: [], variantIds: [] };
  }
  const variants = await db
    .select({ id: messageVariants.id, messageId: messageVariants.messageId })
    .from(messageVariants)
    .where(inArray(messageVariants.messageId, messageIds))
    .orderBy(asc(messageVariants.idx));
  // @orb-waive persistence-no-in-memory-state(Map): query-local regrouping of the variant rows just loaded. Ends if it outlives the call.
  const variantsByMessage = new Map<MessageId, MessageVariantId[]>();
  for (const variant of variants) {
    const pool = variantsByMessage.get(variant.messageId) ?? [];
    pool.push(variant.id);
    variantsByMessage.set(variant.messageId, pool);
  }
  return {
    chatId,
    messageIds,
    variantIds: messageIds.map((messageId) => variantsByMessage.get(messageId) ?? []),
  };
}

async function recordSkippedImport(args: {
  readonly ctx: ChatImportContext;
  readonly state: ImportRunState;
  readonly existing: ExistingImport;
  readonly ownerId: UserId;
  readonly ci: BulkImportChatInput;
}): Promise<void> {
  const { ctx, state, existing, ownerId, ci } = args;
  state.identities.push(await loadImportedIdentity(ctx.db, existing.chatId));
  state.chatsSkipped += 1;
  state.chatsPersonaHealed += collectInto(state.healStmts, healPersonaAttribution(ctx, existing, ownerId, ci));
}

/** Commit one fresh candidate, returning the exact winning claim when another invocation won the race.
 * Constraint errors elsewhere in the large room batch remain loud: only a now-visible scoped claim
 * classifies the failure as the expected concurrent loser. */
async function commitImportCandidate(args: {
  readonly db: Db;
  readonly stmts: readonly BatchStmt[];
  readonly characterId: CharacterId;
  readonly importHash: string;
  readonly metadata: ChatMetadata | null;
}): Promise<ExistingImport | null> {
  const { db, stmts, characterId, importHash, metadata } = args;
  try {
    await commitChatBatch(db, stmts);
    return null;
  } catch (err) {
    const kind = isConstraintViolation(err)?.kind;
    if (carriesAssetBackground(metadata) && kind === "not-null") {
      const unavailable = new ChatOperationError(CHAT_OP_CODES.backgroundUnavailable, "the imported chat background asset is no longer available");
      unavailable.cause = err;
      throw unavailable;
    }
    if (kind !== "unique" && kind !== "primary-key") {
      throw err;
    }
    const claimed = (await loadExistingImports(db, characterId, [importHash]))[importHash];
    if (claimed === undefined) {
      throw err;
    }
    return claimed;
  }
}

/** Process one candidate against the run-local cache and the database-backed claim arbiter. */
async function importOneChat(args: {
  readonly ctx: ChatImportContext;
  readonly state: ImportRunState;
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly ci: BulkImportChatInput;
}): Promise<void> {
  const { ctx, state, ownerId, characterId, ci } = args;
  const already = state.existing[ci.importHash];
  if (already !== undefined) {
    await recordSkippedImport({ ctx, state, existing: already, ownerId, ci });
    return;
  }

  const chatId = ctx.newChatId();
  // A second byte-identical file later in THIS run skips too — and it has nothing to heal, since the row
  // it would heal is the one this very run writes WITH whatever persona the mapper resolved.
  state.existing[ci.importHash] = { chatId, anchorPersonaId: ci.anchorPersonaId };
  const { stmts, identity } = await planOneChat({ ctx, chatId, ci, ownerId, characterId });
  ctx.bumpStatsCanonVersion(stmts, ctx.db, ownerId);
  const metadata = ci.metadata === undefined ? null : parseChatMetadata(ci.metadata);
  const claimed = await commitImportCandidate({ db: ctx.db, stmts, characterId, importHash: ci.importHash, metadata });
  if (claimed !== null) {
    state.existing[ci.importHash] = claimed;
    await recordSkippedImport({ ctx, state, existing: claimed, ownerId, ci });
    return;
  }

  if (ci.parentRef !== null) {
    state.pendingParents.push({ chatId, parentRef: ci.parentRef, forkedAt: ci.createdAt });
  }
  state.written.push(identity);
  state.identities.push(identity);
  state.chatsImported += 1;
  state.messagesImported += identity.messageIds.length;
  state.variantsImported += identity.variantIds.reduce((total, pool) => total + pool.length, 0);
  state.realConversationWritten ||= ci.isRealConversation;
}

/** Dup-skips by the scoped atomic import claim (healing the skipped room's persona attribution — see
 *  {@link healPersonaAttribution}), commits each fresh chat as ONE `db.batch`, then resolves branch parents. */
export function createBulkImportChats(ctx: ChatImportContext): BulkImportChats {
  return async ({ ownerId, characterId, chats: input }): Promise<BulkImportChatsResult> => {
    const { db } = ctx;
    await assertImportPreconditions(db, ownerId, characterId, input);
    const existing = await loadExistingImports(
      db,
      characterId,
      input.map((c) => c.importHash),
    );

    const state: ImportRunState = {
      existing,
      identities: [],
      written: [],
      pendingParents: [],
      // The dedup-skip arm's accumulated heal commits once after the loop. Every statement is a NULL-guarded
      // update against an existing row, so there is no candidate-room boundary for a per-chat batch to protect.
      healStmts: [],
      chatsImported: 0,
      chatsSkipped: 0,
      messagesImported: 0,
      variantsImported: 0,
      chatsPersonaHealed: 0,
      realConversationWritten: false,
    };

    for (const ci of input) {
      await importOneChat({ ctx, state, ownerId, characterId, ci });
    }

    if (state.healStmts.length > 0) {
      await commitChatBatch(db, state.healStmts);
    }
    const branchesLinked = await resolveBranches(ctx, ownerId, characterId, state.pendingParents);
    return {
      identities: state.identities,
      written: state.written,
      chatsImported: state.chatsImported,
      chatsSkipped: state.chatsSkipped,
      messagesImported: state.messagesImported,
      variantsImported: state.variantsImported,
      branchesLinked,
      realConversationWritten: state.realConversationWritten,
      chatsPersonaHealed: state.chatsPersonaHealed,
    };
  };
}
