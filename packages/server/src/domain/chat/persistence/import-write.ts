// domain/chat/persistence/import-write — the chat-owned bulk-import WRITE, the explicit named exception to
// "persistence is queries only" (like canon-write.ts/lock.ts): commits an imported chat's slots + variants +
// founding roster and resolves branch parents.
//
// LOAD-BEARING: `updatedAt` is the ST max(send_dates) carried in from import (not `now`); `importHash` is the
// per-chat provenance while `chat_import_claims` is the scoped atomic dedup oracle. db.transaction() is BANNED, and
// one batch for a long room held the server for seconds, so a room lands in stages: the room marked landing with
// its claim, the messages a stage at a time, then the roster with the cleared marker. Readers reach a room only
// through its roster, so a reader sees all of a room or none of it. A failed import, and the boot sweep after a
// kill, delete a room still marked landing (`import-landing.ts`).

import type {
  BulkImportChatInput,
  BulkImportChatsOp,
  BulkImportChatsResult,
  BulkImportVariantInput,
  ChatMetadata,
  FindImportedChatHashes,
  ImportedChatIdentity,
  ImportedChatRemap,
  MessageKind,
  TurnInitiator,
} from "@orb/contracts/chat";
import { DEFAULT_MESSAGE_KIND } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import { generationUsageSchema, modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import {
  characters,
  chatGenerationObservations,
  chatImportClaims,
  chatInjections,
  chatParticipants,
  chats,
  messageAssets,
  messages,
  messageVariants,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany, batchStmt, chunkRows, insertRowsAsJson, isConstraintViolation } from "@orb/db/query";
import { batchHandle, databaseForOwner } from "@orb/db/wiring-owner";
import { assetIdsInContent } from "@orb/kit/content";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, CharacterId, ChatId, MessageId, MessageVariantId, ModelId, PersonaId, UserId } from "@orb/kit/ids";
import { and, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { yieldToLoop } from "#primitives/abort";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { ChatImportAssemblyContext, ChatImportContext } from "../contract/import.ts";
import { parseChatMetadata } from "../contract/metadata.ts";
import { importedObservationRows } from "../substrate/import-observations.ts";
import { carriesAssetBackground, guardedChatId } from "./background-write.ts";
import { deleteLandingChat, LANDING_STAGE_CHARS, LANDING_STAGE_MESSAGES } from "./import-landing.ts";
import { assertSeatableCharacters } from "./seat-characters.ts";

// Budget a scope bind alongside each varying value, so the statement's fixed scope always fits too.
const SCOPED_FILTER_BIND_BUDGET = 2;
// Marks a slot the bulk import wrote, never a requested turn.
const IMPORT_INITIATOR = "import" satisfies TurnInitiator;

type ImportMessage = BulkImportChatInput["messages"][number];

/** A chat's messages cut into landing stages: each holds at most {@link LANDING_STAGE_MESSAGES} messages and, past its
 *  first message, at most {@link LANDING_STAGE_CHARS} characters of variant text. `start` is the first message's index. */
function* landingStages(all: readonly ImportMessage[]): Generator<{ readonly start: number; readonly stage: readonly ImportMessage[] }> {
  let stage: ImportMessage[] = [];
  let chars = 0;
  let start = 0;
  for (const [index, message] of all.entries()) {
    const weight = message.variants.reduce((total, variant) => total + variant.content.length, 0);
    if (stage.length > 0 && (stage.length >= LANDING_STAGE_MESSAGES || chars + weight > LANDING_STAGE_CHARS)) {
      yield { start, stage };
      stage = [];
      chars = 0;
      start = index;
    }
    stage.push(message);
    chars += weight;
  }
  if (stage.length > 0) {
    yield { start, stage };
  }
}

/** The distinct inline `asset:<id>` refs in a message's content, across all its variants. */
function assetRefsInMessage(message: ImportMessage): AssetId[] {
  // query-local dedup Set for asset refs in a message. Ends if it outlives the call.
  return [...new Set(message.variants.flatMap((v) => assetIdsInContent(v.content)))];
}

interface PendingParent {
  readonly chatId: ChatId;
  readonly parentRef: string;
  readonly forkedAt: number;
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
  // call-local membership Set over one input's seats (a pure precondition check, no state survives the call). Ends if it outlives the call.
  const seated = new Set(seatedCharacterIds(primary, ci.characterIds));
  for (const m of ci.messages) {
    const named = namedSpeaker(m);
    if (named !== null && !seated.has(named)) {
      throw new DomainNotFoundError("chat_participant", named);
    }
  }
}

/** Referential gate for the per-seat KNOBS, the {@link assertSeatedSpeakers} posture: a knob may only
 *  configure a seat this chat actually SEATS. Dropping an unseated knob silently would make "the mute
 *  travelled" a claim nobody can check — the whole point of carrying the flag. */
function assertSeatedKnobs(ci: BulkImportChatInput, primary: CharacterId): void {
  if (ci.seatKnobs === undefined || ci.seatKnobs.length === 0) {
    return;
  }
  // call-local membership Set over one input's seats (a pure precondition check, no state survives the call). Ends if it outlives the call.
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
  /** Another run is still landing this room in stages (`chats.landing_at` set). */
  readonly landing: boolean;
}

/** Pre-fetch the exact scoped import claims. Keyed by hash → the room it is, because the dedup branch no
 *  longer only SKIPS: it heals the room's persona attribution when this run can resolve one and the stored
 *  room never got one. */
async function loadExistingImports(db: Db, characterId: CharacterId, hashes: readonly string[]): Promise<Record<string, ExistingImport>> {
  const seen: Record<string, ExistingImport> = {};
  // query-local dedup of requested import identities. Ends if it outlives the call.
  const uniqueHashes = new Set(hashes);
  for (const chunk of chunkRows([...uniqueHashes], SCOPED_FILTER_BIND_BUDGET)) {
    // each chunk reserves the character-scope bind under the driver cap. Ends if the driver lifts its bind cap.
    const rows = await db
      .select({ id: chats.id, importHash: chatImportClaims.importHash, anchorPersonaId: chats.anchorPersonaId, landingAt: chats.landingAt })
      .from(chatImportClaims)
      .innerJoin(chats, eq(chats.id, chatImportClaims.chatId))
      .where(and(eq(chatImportClaims.characterId, characterId), inArray(chatImportClaims.importHash, chunk)));
    for (const r of rows) {
      seen[r.importHash] ??= { chatId: r.id, anchorPersonaId: r.anchorPersonaId, landing: r.landingAt !== null };
    }
  }
  return seen;
}

/**
 * The DEDUP-SKIP arm's HEAL (owner ruling): back-fill persona attribution onto a room that was
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
 * their own business), and each user slot, matched by `seq = index + origin` against the room's own import
 * origin ({@link importSeqOrigin}). A seq match survives a deleted slot, which a position among the survivors
 * does not. A room whose origin its slots cannot prove heals its pin and seat but no slot.
 */
function healPersonaAttribution(
  ctx: ChatImportContext,
  room: {
    readonly existing: ExistingImport;
    readonly origin: ImportSeqOrigin | null;
    readonly ownerId: UserId;
    readonly ci: BulkImportChatInput;
  },
): BatchStmt[] {
  const { db } = ctx;
  const { existing, origin, ownerId, ci } = room;
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
  if (origin === null) {
    return stmts;
  }
  for (const [index, m] of ci.messages.entries()) {
    const personaId = m.role === "user" ? m.personaId : null;
    if (personaId === null) {
      continue;
    }
    stmts.push(
      batchStmt(
        db
          .update(messages)
          .set({ personaId })
          .where(and(eq(messages.chatId, existing.chatId), eq(messages.seq, index + origin), eq(messages.role, "user"), isNull(messages.personaId))),
      ),
    );
  }
  return stmts;
}

/** The first seq each import writer numbered a room's canon from. `legacy` rooms are already in launched
 *  databases; every new import is `current`, the origin live canon appends from (`commitCanonAppend` writes at
 *  the head + 1 over an empty head of 0). */
const IMPORT_SEQ_ORIGINS = { legacy: 0, current: 1 } as const;
type ImportSeqOrigin = (typeof IMPORT_SEQ_ORIGINS)[keyof typeof IMPORT_SEQ_ORIGINS];

/** The origin a stored import room was written with, proven from its own import-written slots: only the legacy
 *  writer wrote seq 0, and only the current writer wrote seq `count` for a `count`-message transcript. `null`
 *  when deletions removed both proofs, so no caller pairs a slot rather than guess an offset. */
async function importSeqOrigin(db: Db, chatId: ChatId, count: number): Promise<ImportSeqOrigin | null> {
  const proofs = await db
    .select({ seq: messages.seq })
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.initiator, IMPORT_INITIATOR),
        inArray(messages.seq, [IMPORT_SEQ_ORIGINS.legacy, count - 1 + IMPORT_SEQ_ORIGINS.current]),
      ),
    );
  if (proofs.some((row) => row.seq === IMPORT_SEQ_ORIGINS.legacy)) {
    return IMPORT_SEQ_ORIGINS.legacy;
  }
  return proofs.length > 0 ? IMPORT_SEQ_ORIGINS.current : null;
}

/** The founding roster for an imported chat (host human + every seated character); `joinSeq=0` (born here).
 *  A single-character `characterIds` is byte-identically the pre-roster two-row shape. */
function rosterRows(args: {
  readonly ctx: ChatImportContext;
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  readonly characterIds: readonly CharacterId[];
  readonly anchorPersonaId: BulkImportChatInput["anchorPersonaId"];
  /** The chat's declared per-seat knobs. A seat with none takes the columns' own defaults, which is
   *  byte-identically a row without knobs — the knobs are SPREAD, never defaulted here, so the column stays the
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

interface MessageRowsArgs {
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
function importedUsageColumns(
  v: BulkImportVariantInput,
): Pick<
  typeof messageVariants.$inferInsert,
  | "tokensIn"
  | "tokensOut"
  | "reasoningTokens"
  | "cacheReadTokens"
  | "cacheWriteTokens"
  | "costUsd"
  | "costDetails"
  | "costProvenance"
  | "servedModel"
  | "tokenDetails"
  | "responseCache"
> {
  const usage = v.usage === undefined ? undefined : generationUsageSchema.parse(v.usage);
  return {
    tokensIn: usage === undefined ? (v.tokensIn ?? null) : usage.tokensIn,
    tokensOut: usage === undefined ? v.tokensOut : usage.tokensOut,
    reasoningTokens: usage?.reasoningTokens ?? null,
    cacheReadTokens: usage?.cacheReadTokens ?? null,
    cacheWriteTokens: usage?.cacheWriteTokens ?? null,
    costUsd: usage?.costUsd ?? null,
    costDetails: usage?.costDetails ?? null,
    costProvenance: usage?.costProvenance ?? "unrecorded",
    servedModel: usage?.servedModel ?? null,
    tokenDetails: usage?.tokenDetails ?? null,
    responseCache: usage?.responseCache ?? null,
  };
}

/** One imported message as rows, not statements: {@link landMessages} writes a chat's rows in multi-row
 *  inserts, because a statement per row made a long chat tens of thousands of statements and the build of that
 *  batch held the event loop for seconds. */
interface MessageRows {
  readonly message: typeof messages.$inferInsert;
  readonly variants: (typeof messageVariants.$inferInsert)[];
  readonly selectedVariantId: MessageVariantId | null;
  readonly assets: (typeof messageAssets.$inferInsert)[];
  readonly variantIds: readonly MessageVariantId[];
}

function messageRows(args: MessageRowsArgs): MessageRows {
  const { ctx, messageId, chatId, seq, message } = args;
  const isUser = message.role === "user";
  let selectedVariantId: MessageVariantId | null = null;
  const variantIds: MessageVariantId[] = [];
  const variants = message.variants.map((v, i): typeof messageVariants.$inferInsert => {
    const variantId = ctx.newMessageVariantId();
    variantIds.push(variantId);
    if (i === message.selectedIdx) {
      selectedVariantId = variantId;
    }
    return {
      id: variantId,
      messageId,
      idx: v.idx,
      content: v.content,
      model: importedModelId(v.model),
      provider: importedProviderId(v.provider),
      // Foreign history has no durable local connection row to attribute. Preserve that as missing,
      // never as a fabricated deletion of a connection this app did not record.
      connectionAttributionProvenance: "unrecorded",
      // `tokensIn` is supplied by the orb-native bundle AND by the ST arm's user/system slots (the
      // role-routed `extra.token_count`); `variableDelta` stays orb-native-only.
      ...importedUsageColumns(v),
      tokenProvenance: v.tokenProvenance,
      reasoning: v.reasoning,
      ttftMs: v.ttftMs,
      genStartedAt: v.genStartedAt,
      genFinishedAt: v.genFinishedAt,
      variableDelta: v.variableDelta ?? null,
      metadata: v.metadata,
      createdAt: message.createdAt,
    };
  });
  return {
    message: {
      id: messageId,
      chatId,
      seq,
      role: message.role,
      kind: slotKind(message),
      authorUserId: isUser ? args.ownerId : null,
      characterId: slotCharacterId(message, args.characterId, args.narratorCharacterId),
      personaId: isUser ? message.personaId : null,
      // The variant row needs its message first, so the pointer is set by `selectVariantStmts` after both land.
      selectedVariantId: null,
      // Imported history was not typed in this app: the viewer's last-turn reads skip it.
      initiator: IMPORT_INITIATOR,
      createdAt: message.createdAt,
    },
    variants,
    selectedVariantId,
    // Re-create the message_assets retaining row for each inline attachment that exists on the target box.
    assets: assetRefsInMessage(message)
      .filter((assetId) => args.existingAssetIds.includes(assetId))
      .map((assetId) => ({
        id: ctx.newMessageAssetId(),
        messageId,
        assetId,
        // An imported attachment is a user upload by construction (ST carries no model-emitted pictures).
        origin: "attached" as const,
        createdAt: message.createdAt,
      })),
    variantIds,
  };
}

/** Point each message at its selected variant. The pairs reach SQLite as one JSON text, so the statement binds one
 *  value however many messages it names. */
function selectVariantStmts(db: Db, selections: readonly { readonly messageId: MessageId; readonly variantId: MessageVariantId }[]): BatchStmt[] {
  if (selections.length === 0) {
    return [];
  }
  const pairs = JSON.stringify(selections.map(({ messageId, variantId }) => [messageId, variantId]));
  return [
    batchStmt(
      db.run(
        sql`update ${messages} set ${sql.identifier(messages.selectedVariantId.name)} = pair.value ->> '$[1]' from json_each(${pairs}) as pair where ${messages.id} = pair.value ->> '$[0]'`,
      ),
    ),
  ];
}

/** Append one room's heal statements to the run's pool; `1` when that room contributed any (the per-CHAT
 *  heal count), `0` when it had nothing to heal. */
function collectInto(pool: BatchStmt[], stmts: readonly BatchStmt[]): number {
  pool.push(...stmts);
  return stmts.length > 0 ? 1 : 0;
}

/** Commit one atomic `db.batch`. The batch runs synchronously in the driver, so it starts on a fresh turn of the
 *  loop: the time it holds the server is its own and not added to the work before it. */
async function commitChatBatch(db: Db, stmts: readonly BatchStmt[]): Promise<unknown> {
  await yieldToLoop();
  return await db.batch(batchMany(stmts));
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
  // query-local dedup Map for import-from linkage. Ends if it outlives the call.
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

/** Both import arms arrive with the whole resolved prose list: native chat_injections or the ST mapper
 *  conversion of note_prompt and recorded placement knobs. This writer applies no placement policy and must
 *  not hardcode in_chat/depth 4/system over the mapper result.
 */
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

/** The first landing stage: the room, marked landing, and its import claim. The claim's composite PK is the
 *  concurrent arbiter, so a loser fails on this stage and leaves neither a claim nor any portion of its room. */
function openingStmts({ ctx, chatId, ci, characterId }: OneChatArgs): BatchStmt[] {
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
        // Cleared by the closing stage; until then only the landing cleanup and the boot sweep may delete the room.
        landingAt: ctx.now(),
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
    batchStmt(
      db.insert(chatImportClaims).values({
        chatId,
        characterId,
        importHash: ci.importHash,
        createdAt: ctx.now(),
      }),
    ),
  ];
}

function pendingObservationStmts(ctx: ChatImportContext, ownerId: UserId, ci: BulkImportChatInput, identity: ImportedChatIdentity): BatchStmt[] {
  return importedObservationRows(ctx.newChatTurnId, ownerId, ci, identity).map((row) => batchStmt(ctx.db.insert(chatGenerationObservations).values(row)));
}

/** The last landing stage: the founding roster, the per-chat prose (`chat_injections`, the ONE per-chat prose
 *  door), the pending observations and the cleared landing marker, in one batch. Every reader reaches a room
 *  through its roster, so no reader sees the room before this batch, and every reader that does sees all of it. */
function closingStmts(args: OneChatArgs, identity: ImportedChatIdentity): BatchStmt[] {
  const { ctx, chatId, ci, ownerId, characterId } = args;
  const { db } = ctx;
  return [
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
    ...pendingObservationStmts(ctx, ownerId, ci, identity),
    batchStmt(
      db
        .update(chats)
        .set({ landingAt: null })
        .where(and(eq(chats.id, chatId), isNotNull(chats.landingAt))),
    ),
  ];
}

/** The seq the import writes for `ci.messages[index]`: the current origin, so a carried `compactedAtSeq`, which
 *  names the source room's seqs, lines up with its rows when the source room has no seq gaps. */
function importedSeq(index: number): number {
  return index + IMPORT_SEQ_ORIGINS.current;
}

/** Commit ONE imported chat's message slots and variants, one {@link landingStages} stage a batch, and
 *  return the identity of what landed. `identity` is INDEX-ALIGNED to `ci.messages` — the R6 remap
 *  (`ImportedChatIdentity`); the tallies the caller reports are derived from it rather than counted separately,
 *  so the count and the remap cannot disagree about what landed. */
async function landMessages(args: OneChatArgs): Promise<ImportedChatIdentity> {
  const { ctx, chatId, ci, ownerId, characterId, existingAssetIds, narratorCharacterId } = args;
  const { db } = ctx;
  const messageIds: MessageId[] = [];
  const variantIds: (readonly MessageVariantId[])[] = [];
  for (const { start, stage } of landingStages(ci.messages)) {
    const selections: { readonly messageId: MessageId; readonly variantId: MessageVariantId }[] = [];
    const rows = stage.map((m, offset) => {
      const messageId = ctx.newMessageId();
      const built = messageRows({
        ctx,
        messageId,
        chatId,
        seq: importedSeq(start + offset),
        message: m,
        ownerId,
        characterId,
        existingAssetIds,
        narratorCharacterId,
      });
      messageIds.push(messageId);
      variantIds.push(built.variantIds);
      if (built.selectedVariantId !== null) {
        selections.push({ messageId, variantId: built.selectedVariantId });
      }
      return built;
    });
    // The stage's messages, then their variants, then the pointers: a variant names its message and a pointer
    // names its variant.
    await commitChatBatch(db, [
      ...insertRowsAsJson(
        db,
        messages,
        rows.map((row) => row.message),
      ),
      ...insertRowsAsJson(
        db,
        messageVariants,
        rows.flatMap((row) => row.variants),
      ),
      ...selectVariantStmts(db, selections),
      ...insertRowsAsJson(
        db,
        messageAssets,
        rows.flatMap((row) => row.assets),
      ),
    ]);
  }
  return { chatId, messageIds, variantIds };
}

/** EVERY character id a run could seat or attribute: the primary, each chat's extra roster, and each slot's
 *  named speaker. Ownership-gated in one pass before any write, so a foreign id anywhere refuses the whole
 *  run rather than landing a partially-correct room. */
function everyReferencedCharacter(primary: CharacterId, input: readonly BulkImportChatInput[]): CharacterId[] {
  // call-local first-seen ownership set across the complete import input. Ends if it outlives the call.
  const ids = new Set<CharacterId>([primary]);
  for (const c of input) {
    for (const id of c.characterIds ?? []) {
      ids.add(id);
    }
    // A knob names a seat; an id that reaches the ownership gate here can never be one the seat gate below
    // then refuses for the wrong reason (foreign reads as unseated).
    for (const knob of c.seatKnobs ?? []) {
      ids.add(knob.characterId);
    }
    for (const m of c.messages) {
      const named = namedSpeaker(m);
      if (named !== null) {
        ids.add(named);
      }
    }
  }
  return [...ids];
}

async function filterImportedAssetIds(ctx: ChatImportContext, ownerId: UserId, ci: BulkImportChatInput): Promise<AssetId[]> {
  // call-local dedup of the complete chat's inline references. Ends if it outlives the call.
  const requested = new Set<AssetId>();
  for (const { stage } of landingStages(ci.messages)) {
    for (const message of stage) {
      for (const assetId of assetRefsInMessage(message)) {
        requested.add(assetId);
      }
    }
    // Tokenizing every message's text for refs costs time by its length, as the write does.
    await yieldToLoop();
  }
  const existing: AssetId[] = [];
  for (const ids of chunkRows([...requested], SCOPED_FILTER_BIND_BUDGET)) {
    existing.push(...(await ctx.filterExistingAssetIds(ownerId, ids)));
  }
  return existing;
}

/** Resolve one chat's two async preconditions. Both run in ONE `Promise.all`: the bounded asset-existence read,
 *  and — only for a chat carrying a narrator slot — the find-or-mint of the room's synthetic identity, the same op
 *  and the same idempotency a live narrator round uses. A chat with no narrator slot never touches the synthetic
 *  namespace at all. */
async function planOneChat(args: Omit<OneChatArgs, "existingAssetIds" | "narratorCharacterId">): Promise<OneChatArgs> {
  const { ctx, ci, ownerId, chatId } = args;
  const [existingAssetIds, narratorCharacterId] = await Promise.all([
    filterImportedAssetIds(ctx, ownerId, ci),
    hasNarratorSlot(ci) ? ctx.mintSyntheticGroupCharacter({ ownerId, chatId }).then((ref) => ref.characterId) : Promise.resolve(null),
  ]);
  return { ...args, existingAssetIds, narratorCharacterId };
}

/** The run's whole-input gates, BEFORE any write: EVERY id this run could seat, attribute or CONFIGURE — the
 *  primary, every chat's extra roster, every slot's named speaker, every per-seat knob — must be the
 *  caller's, and every named speaker and knob must be seated in its own room. A foreign or unseated id
 *  anywhere refuses the whole run rather than landing a partially-correct room. */
async function assertImportPreconditions(db: Db, ownerId: UserId, characterId: CharacterId, input: readonly BulkImportChatInput[]): Promise<void> {
  // EVERY seat (the primary + any extra roster id) must be the caller's own card, checked before a row is written.
  await assertSeatableCharacters(db, ownerId, everyReferencedCharacter(characterId, input));
  for (const ci of input) {
    assertSeatedSpeakers(ci, characterId);
    assertSeatedKnobs(ci, characterId);
  }
}

interface ImportRunState {
  readonly existing: Record<string, ExistingImport>;
  readonly remaps: ImportedChatRemap[];
  readonly written: ImportedChatIdentity[];
  readonly pendingParents: PendingParent[];
  readonly healStmts: BatchStmt[];
  chatsImported: number;
  chatsSkipped: number;
  messagesImported: number;
  variantsImported: number;
  chatsPersonaHealed: number;
  readonly realConversationsWritten: ChatId[];
}

/** The claimed room's remap for `ci`, paired by `seq = index + origin` against the slots the import wrote, so a
 *  slot deleted since then leaves a `null` at its own position instead of shifting every later pairing. Range
 *  bounds rather than id lists keep the binds independent of history size. */
async function loadImportedRemap(db: Db, chatId: ChatId, ci: BulkImportChatInput, origin: ImportSeqOrigin | null): Promise<ImportedChatRemap> {
  if (ci.messages.length === 0) {
    return { kind: "aligned", chatId, messageIds: [], variantIds: [] };
  }
  if (origin === null) {
    return { kind: "unproven-origin", chatId };
  }
  // The initiator filter keeps a live slot later appended into a deleted import seq out of the pairing.
  const importedSlot = and(
    eq(messages.chatId, chatId),
    eq(messages.initiator, IMPORT_INITIATOR),
    gte(messages.seq, origin),
    lt(messages.seq, ci.messages.length + origin),
  );
  const slots = await db.select({ id: messages.id, seq: messages.seq }).from(messages).where(importedSlot);
  const variants = await db
    .select({ id: messageVariants.id, messageId: messageVariants.messageId, idx: messageVariants.idx })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(importedSlot);
  // query-local indexes over the rows just loaded. Ends if they outlive the call.
  const slotBySeq = new Map(slots.map((slot) => [slot.seq, slot.id]));
  const variantsByMessage = new Map<MessageId, Map<number, MessageVariantId>>();
  for (const variant of variants) {
    const pool = variantsByMessage.get(variant.messageId) ?? new Map<number, MessageVariantId>();
    pool.set(variant.idx, variant.id);
    variantsByMessage.set(variant.messageId, pool);
  }
  const pairs = ci.messages.map((m, index) => {
    const messageId = slotBySeq.get(index + origin) ?? null;
    const pool = messageId === null ? undefined : variantsByMessage.get(messageId);
    // A carried variant pairs by its own `idx`, the column the import stored it under.
    return { messageId, variantIds: m.variants.map((v) => pool?.get(v.idx) ?? null) };
  });
  return { kind: "aligned", chatId, messageIds: pairs.map((pair) => pair.messageId), variantIds: pairs.map((pair) => pair.variantIds) };
}

async function recordSkippedImport(args: {
  readonly ctx: ChatImportContext;
  readonly state: ImportRunState;
  readonly existing: ExistingImport;
  readonly ownerId: UserId;
  readonly ci: BulkImportChatInput;
}): Promise<void> {
  const { ctx, state, existing, ownerId, ci } = args;
  if (existing.landing) {
    // Another run is still landing this room, so its slots cannot be paired yet and its roster is not there to heal.
    state.remaps.push({ kind: "unproven-origin", chatId: existing.chatId });
    state.chatsSkipped += 1;
    return;
  }
  const origin = await importSeqOrigin(ctx.db, existing.chatId, ci.messages.length);
  state.remaps.push(await loadImportedRemap(ctx.db, existing.chatId, ci, origin));
  state.chatsSkipped += 1;
  state.chatsPersonaHealed += collectInto(state.healStmts, healPersonaAttribution(ctx, { existing, origin, ownerId, ci }));
}

/** Commit one fresh candidate's opening stage, returning the exact winning claim when another invocation won the
 * race. Other constraint errors remain loud: only a now-visible scoped claim classifies the failure as the
 * expected concurrent loser. */
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
  // The content identity first; the whole-file hash a row imported before it carries second.
  const already = state.existing[ci.importHash] ?? (ci.fileHash === undefined ? undefined : state.existing[ci.fileHash]);
  if (already !== undefined) {
    await recordSkippedImport({ ctx, state, existing: already, ownerId, ci });
    return;
  }

  const chatId = ctx.newChatId();
  // A second byte-identical file later in THIS run skips too — and it has nothing to heal, since the row
  // it would heal is the one this very run writes WITH whatever persona the mapper resolved.
  state.existing[ci.importHash] = { chatId, anchorPersonaId: ci.anchorPersonaId, landing: false };
  const plan = await planOneChat({ ctx, chatId, ci, ownerId, characterId });
  const metadata = ci.metadata === undefined ? null : parseChatMetadata(ci.metadata);
  const claimed = await commitImportCandidate({ db: ctx.db, stmts: openingStmts(plan), characterId, importHash: ci.importHash, metadata });
  if (claimed !== null) {
    state.existing[ci.importHash] = claimed;
    await recordSkippedImport({ ctx, state, existing: claimed, ownerId, ci });
    return;
  }
  // One atomic batch for a long room held the server for seconds, so the room lands in stages and readers wait for
  // the closing stage's roster. A failure after the opening stage removes what landed.
  let identity: ImportedChatIdentity;
  try {
    identity = await landMessages(plan);
    const closing = closingStmts(plan, identity);
    // Once per room, in the stage that makes it visible: a rebuild scanning meanwhile folds the owner again once.
    ctx.bumpStatsCanonVersion(closing, ctx.db, ownerId);
    await commitChatBatch(ctx.db, closing);
  } catch (err) {
    await deleteLandingChat(ctx.db, chatId);
    throw err;
  }

  if (ci.parentRef !== null) {
    state.pendingParents.push({ chatId, parentRef: ci.parentRef, forkedAt: ci.createdAt });
  }
  state.written.push(identity);
  state.remaps.push({ kind: "aligned", ...identity });
  state.chatsImported += 1;
  state.messagesImported += identity.messageIds.length;
  state.variantsImported += identity.variantIds.reduce((total, pool) => total + pool.length, 0);
  if (ci.isRealConversation) {
    state.realConversationsWritten.push(chatId);
  }
}

/** The read-only twin of {@link createBulkImportChats}'s dedup gate, for a preview that must not write. */
export function createFindImportedChatHashes(assembly: Pick<ChatImportAssemblyContext, "db">): FindImportedChatHashes {
  const db = databaseForOwner(assembly.db);
  return async ({ ownerId, characterId, hashes }): Promise<ReadonlySet<string>> => {
    const found = new Set<string>();
    // each chunk reserves the character and owner binds under the driver cap. Ends if the driver lifts its bind cap.
    for (const chunk of chunkRows([...new Set(hashes)], SCOPED_FILTER_BIND_BUDGET + 1)) {
      const rows = await db
        .select({ importHash: chatImportClaims.importHash })
        .from(chatImportClaims)
        .innerJoin(characters, eq(characters.id, chatImportClaims.characterId))
        .where(and(eq(chatImportClaims.characterId, characterId), eq(characters.ownerId, ownerId), inArray(chatImportClaims.importHash, chunk)));
      for (const row of rows) {
        found.add(row.importHash);
      }
    }
    return found;
  };
}

/** Dup-skips by the scoped atomic import claim (healing the skipped room's persona attribution — see
 *  {@link healPersonaAttribution}), lands each fresh chat in stages, then resolves branch parents. */
export function createBulkImportChats(assembly: ChatImportAssemblyContext): BulkImportChatsOp {
  const ctx: ChatImportContext = {
    ...assembly,
    db: databaseForOwner(assembly.db),
    bumpStatsCanonVersion: (batch, _db, ownerId) => assembly.bumpStatsCanonVersion(batchHandle(batch), assembly.db, ownerId),
  };
  return async ({ ownerId, characterId, chats: input }): Promise<BulkImportChatsResult> => {
    const { db } = ctx;
    await assertImportPreconditions(db, ownerId, characterId, input);
    const existing = await loadExistingImports(
      db,
      characterId,
      input.flatMap((c) => (c.fileHash === undefined ? [c.importHash] : [c.importHash, c.fileHash])),
    );

    const state: ImportRunState = {
      existing,
      remaps: [],
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
      realConversationsWritten: [],
    };

    for (const ci of input) {
      await importOneChat({ ctx, state, ownerId, characterId, ci });
    }

    if (state.healStmts.length > 0) {
      await commitChatBatch(db, state.healStmts);
    }
    const branchesLinked = await resolveBranches(ctx, ownerId, characterId, state.pendingParents);
    return {
      remaps: state.remaps,
      written: state.written,
      chatsImported: state.chatsImported,
      chatsSkipped: state.chatsSkipped,
      messagesImported: state.messagesImported,
      variantsImported: state.variantsImported,
      branchesLinked,
      realConversationsWritten: state.realConversationsWritten,
      chatsPersonaHealed: state.chatsPersonaHealed,
    };
  };
}
