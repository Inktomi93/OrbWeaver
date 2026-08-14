// verb: exportChatBundle (R6) — the room WHOLE, as the orb-native bundle file. The relational work (ids →
// handles/names, ids → bundle POSITIONS) lives here, before build; the serde (`#kit/serde/chat-bundle`) stays
// pure bytes↔`PortableChat`.
//
// WHY BESIDE `export-chat.ts` RATHER THAN A FORMAT ARM ON IT: the ST jsonl verb resolves a chat DOWN to the
// interchange's vocabulary — one header character, one user name, messages. That projection is lossy by
// design and correct for ST parity. This verb resolves the same chat UP: every seat, every injection, the tag
// overlay, the room blob, the per-chat variable/macro picks, and the whole rpg campaign. Two projections, two
// verbs, one shared host gate — folding them would make the ST arm carry a payload it cannot express.
//
// THE HOST GATE IS THE SAME ONE `export-chat.ts` RUNS, deliberately re-stated rather than shared through a
// helper: chats are membership-scoped (no `chats.ownerId`, D18) and bulk extraction is a host action, so the
// gate is this file's own precondition and must be readable at this file's own top.
//
// POSITIONS, NOT IDS: `rpg_snapshots`/`rpg_journal`/`rpg_turn_tool_calls` are message- and variant-keyed, and
// neither id survives a cross-box move. This verb builds the id → `{messageIndex, variantIdx}` index off the
// SAME ordered canon read it serializes, so a carried anchor and the message it points at are the same
// derivation rather than two agreeing ones.

import { characters, chatInjections, chatParticipants, chats, chatTags, messages, messageVariants, personas, tags } from "@orb/db";
import type { CharacterHandle, CharacterId, ChatId, MessageId, MessageVariantId, PersonaId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { RpgPortableGame } from "#domain/rpg";
import type { PortableChat, PortableChatInjection, PortableChatMessage, PortableChatVariant, PortableRpgGame } from "#kit/serde/chat-bundle";
import { buildChatBundleFile, CHAT_BUNDLE_EXT } from "#kit/serde/chat-bundle";
import type { ExportContext } from "../context.ts";
import type { ExportChatBundleParams } from "../contract/params.ts";
import type { ExportedFile } from "../contract/results.ts";
import type { ExportService } from "../contract/service.ts";
import { slug } from "../substrate/download-slug.ts";

type ChatRow = typeof chats.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type VariantRow = typeof messageVariants.$inferSelect;

const LIMIT_ONE = 1;

/** Where one variant sits in the bundle: `messages[messageIndex].variants[variantIdx]`. */
interface VariantPosition {
  readonly messageIndex: number;
  readonly variantIdx: number;
}

/** The chat's seated cast, in JOIN order, as handles — the primary (the fallback voice on import) first.
 *  Departed seats ride too: a transcript voiced by a character who has since left still needs its speaker. */
async function loadSeatHandles(
  ctx: ExportContext,
  chatId: ChatId,
): Promise<{ handles: readonly CharacterHandle[]; byId: ReadonlyMap<CharacterId, CharacterHandle> }> {
  const rows = await ctx.db
    .select({ id: characters.id, handle: characters.handle })
    .from(chatParticipants)
    .innerJoin(characters, eq(characters.id, chatParticipants.characterId))
    .where(and(eq(chatParticipants.chatId, chatId), isNotNull(chatParticipants.characterId)))
    .orderBy(asc(chatParticipants.joinSeq), asc(chatParticipants.id));
  const byId = new Map<CharacterId, CharacterHandle>(rows.map((r) => [r.id, r.handle]));
  return { handles: [...new Set(rows.map((r) => r.handle))], byId };
}

/** The tag overlay the CALLER placed on this chat, by name. `chat_tags` is per-TAGGER (D30), so a co-member's
 *  labels are theirs and never ride in the host's backup — the row's own `ownerId` is the scope. */
async function loadTagNames(ctx: ExportContext, chatId: ChatId, ownerId: ExportChatBundleParams["principal"]["userId"]): Promise<readonly string[]> {
  const rows = await ctx.db
    .select({ name: tags.name })
    .from(chatTags)
    .innerJoin(tags, eq(tags.id, chatTags.tagId))
    .where(and(eq(chatTags.chatId, chatId), eq(chatTags.ownerId, ownerId)))
    .orderBy(asc(tags.name));
  return rows.map((r) => r.name);
}

async function loadInjections(ctx: ExportContext, chatId: ChatId): Promise<readonly PortableChatInjection[]> {
  const rows = await ctx.db
    .select()
    .from(chatInjections)
    .where(eq(chatInjections.chatId, chatId))
    .orderBy(asc(chatInjections.createdAt), asc(chatInjections.id));
  return rows.map(
    (row): PortableChatInjection => ({
      position: row.position,
      depth: row.depth,
      role: row.role,
      content: row.content,
      order: row.order,
      createdAt: row.createdAt,
    }),
  );
}

// The persona NAMES this chat's user turns (and its anchor) were authored under. Names, never ids — a
// persona is re-linked on the far side by `(ownerId, name)`, the same key its own import verb dedups on.
// @owner-scope-ok: the export ran the HOST gate on the chat first (`loadHostedChat` — a non-host caller
// collapses to null before any of this), and the ids are the room's own message-attribution stamps plus its
// own `anchorPersonaId` column, not caller input. The read returns display NAMES only. Owner-scoping on the
// caller would blank a co-member's persona name in a multi-human room, which is the same reasoning
// `export-chat.ts::loadSpeakerNames` carries. Ends if the bundle export ever runs without the host gate.
async function loadPersonaNames(ctx: ExportContext, ids: readonly PersonaId[]): Promise<ReadonlyMap<PersonaId, string>> {
  if (ids.length === 0) {
    return new Map<PersonaId, string>();
  }
  const rows = await ctx.db
    .select({ id: personas.id, name: personas.name })
    .from(personas)
    .where(inArray(personas.id, [...ids]));
  return new Map<PersonaId, string>(rows.map((r) => [r.id, r.name]));
}

function toPortableVariant(v: VariantRow): PortableChatVariant {
  return {
    idx: v.idx,
    content: v.content,
    model: v.model,
    provider: v.provider,
    tokensIn: v.tokensIn,
    tokensOut: v.tokensOut,
    reasoning: v.reasoning,
    ttftMs: v.ttftMs,
    genStartedAt: v.genStartedAt,
    genFinishedAt: v.genFinishedAt,
    variableDelta: v.variableDelta ?? null,
    metadata: v.metadata ?? null,
  };
}

/** The ordered canon plus the id → bundle-position index the rpg planes re-link through. ONE read, ONE
 *  ordering: the positions and the serialized messages cannot disagree because they are the same array. */
function buildCanon(args: {
  readonly slots: readonly MessageRow[];
  readonly variantsByMessage: ReadonlyMap<MessageId, readonly VariantRow[]>;
  readonly handleById: ReadonlyMap<CharacterId, CharacterHandle>;
  readonly personaNameById: ReadonlyMap<PersonaId, string>;
}): {
  readonly portable: readonly PortableChatMessage[];
  readonly messageIndexById: ReadonlyMap<MessageId, number>;
  readonly variantPositionById: ReadonlyMap<MessageVariantId, VariantPosition>;
} {
  const messageIndexById = new Map<MessageId, number>();
  const variantPositionById = new Map<MessageVariantId, VariantPosition>();
  const portable = args.slots.map((slot, messageIndex): PortableChatMessage => {
    messageIndexById.set(slot.id, messageIndex);
    const pool = args.variantsByMessage.get(slot.id) ?? [];
    for (const [variantIdx, variant] of pool.entries()) {
      variantPositionById.set(variant.id, { messageIndex, variantIdx });
    }
    const selected = pool.findIndex((v) => v.id === slot.selectedVariantId);
    return {
      role: slot.role,
      kind: slot.kind,
      // The slot's OWN voice, not the room's primary: a group transcript names its speaker per turn, and a
      // synthetic narrator identity (whose handle is room-scoped) simply does not resolve, so the row lands
      // back through the same `kind: "narrator"` mint the live path uses.
      speakerHandle: slot.characterId === null ? null : (args.handleById.get(slot.characterId) ?? null),
      personaName: slot.personaId === null ? null : (args.personaNameById.get(slot.personaId) ?? null),
      createdAt: slot.createdAt,
      // A slot whose pointer is null degrades to variant 0 (the ST arm's rule), never a throw.
      selectedIdx: Math.max(selected, 0),
      variants: pool.map(toPortableVariant),
    };
  });
  return { portable, messageIndexById, variantPositionById };
}

/** Project the campaign's RAW id refs onto bundle positions. A ref this chat's canon does not contain is
 *  written as null (the serde then prunes what the db could not accept) rather than as a lie. */
function toPortableRpg(args: {
  readonly game: RpgPortableGame;
  readonly messageIndexById: ReadonlyMap<MessageId, number>;
  readonly variantPositionById: ReadonlyMap<MessageVariantId, VariantPosition>;
  /** The seat map — the `sheets` half re-links by CHARACTER HANDLE, which is a chat-side read the rpg op
   *  deliberately does not do (it stamps no owner and resolves no card). */
  readonly handleById: ReadonlyMap<CharacterId, CharacterHandle>;
}): PortableRpgGame {
  const { game, messageIndexById, variantPositionById, handleById } = args;
  const messageIndex = (id: MessageId | null): number | null => (id === null ? null : (messageIndexById.get(id) ?? null));
  const position = (id: MessageVariantId | null): VariantPosition | null => (id === null ? null : (variantPositionById.get(id) ?? null));
  return {
    mode: game.mode,
    status: game.status,
    sessionNumber: game.sessionNumber,
    config: game.config,
    createdAt: game.createdAt,
    sheets: game.sheets.map((sheet) => ({
      // A character sheet re-links by handle; the host sheet (characterId null) re-keys onto the importer.
      characterHandle: sheet.characterId === null ? null : (handleById.get(sheet.characterId) ?? null),
      sheet: sheet.sheet,
    })),
    snapshots: game.snapshots.map((snapshot) => {
      const at = position(snapshot.variantId);
      return {
        messageIndex: at === null ? null : at.messageIndex,
        variantIdx: at === null ? null : at.variantIdx,
        asOfMessageIndex: messageIndex(snapshot.asOfMessageId),
        committed: snapshot.committed,
        createdAt: snapshot.createdAt,
        state: snapshot.state,
      };
    }),
    journal: game.journal.map((entry) => {
      const at = position(entry.variantId);
      return {
        type: entry.type,
        label: entry.label,
        title: entry.title,
        content: entry.content,
        messageIndex: at === null ? null : at.messageIndex,
        variantIdx: at === null ? null : at.variantIdx,
        sourceMessageIndex: messageIndex(entry.sourceMessageId),
        createdAt: entry.createdAt,
      };
    }),
    // Both refs are NOT NULL at the db, so an unresolvable record is DROPPED here rather than emitted with a
    // sentinel the far side would have to re-detect.
    turnToolCalls: game.turnToolCalls.flatMap((record) => {
      const at = position(record.variantId);
      return at === null ? [] : [{ messageIndex: at.messageIndex, variantIdx: at.variantIdx, calls: record.calls, createdAt: record.createdAt }];
    }),
    checkpoints: game.checkpoints.map((checkpoint) => ({
      snapshotIndex: checkpoint.snapshotIndex,
      label: checkpoint.label,
      trigger: checkpoint.trigger,
      createdAt: checkpoint.createdAt,
    })),
  };
}

/** The room blob, widened to the serde's opaque passthrough. The SPREAD is load-bearing, not cosmetic: an
 *  `interface` has no implicit index signature, an object-literal type does — so this is the sound widening,
 *  never a cast. The far side runs the column's own `parseChatMetadata` seam, which is where the shape is
 *  actually decided (one validation home). */
function toPortableMetadata(metadata: ChatRow["metadata"]): PortableChat["metadata"] {
  return metadata === null ? null : { ...metadata };
}

/** The chat's whole ordered canon (slots ⋈ their variant pools). */
async function loadCanonRows(
  ctx: ExportContext,
  chatId: ChatId,
): Promise<{ slots: readonly MessageRow[]; variantsByMessage: ReadonlyMap<MessageId, readonly VariantRow[]> }> {
  const slots = await ctx.db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.seq));
  const variantsByMessage = new Map<MessageId, VariantRow[]>();
  if (slots.length === 0) {
    return { slots, variantsByMessage };
  }
  const variantRows = await ctx.db
    .select()
    .from(messageVariants)
    .where(
      inArray(
        messageVariants.messageId,
        slots.map((m) => m.id),
      ),
    )
    .orderBy(asc(messageVariants.idx), asc(messageVariants.id));
  for (const v of variantRows) {
    const pool = variantsByMessage.get(v.messageId) ?? [];
    pool.push(v);
    variantsByMessage.set(v.messageId, pool);
  }
  return { slots, variantsByMessage };
}

/** The host gate — the caller must be the present `role='host'` row. A non-host caller and a missing chat
 *  collapse to the same `null` (the leak-free posture `export-chat.ts` established). */
async function loadHostedChat(ctx: ExportContext, params: ExportChatBundleParams): Promise<ChatRow | null> {
  const [chat] = await ctx.db.select().from(chats).where(eq(chats.id, params.chatId)).limit(LIMIT_ONE);
  if (chat === undefined) {
    return null;
  }
  const hostRows = await ctx.db
    .select({ userId: chatParticipants.userId })
    .from(chatParticipants)
    .where(
      and(eq(chatParticipants.chatId, params.chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq), isNotNull(chatParticipants.userId)),
    );
  return hostRows.some((r) => r.userId === params.principal.userId) ? chat : null;
}

export function createExportChatBundle(ctx: ExportContext): ExportService["exportChatBundle"] {
  return async (params: ExportChatBundleParams): Promise<ExportedFile | null> => {
    const chat = await loadHostedChat(ctx, params);
    if (chat === null) {
      return null;
    }
    const [{ handles, byId: handleById }, tagNames, injections, { slots, variantsByMessage }, rawRpg] = await Promise.all([
      loadSeatHandles(ctx, params.chatId),
      loadTagNames(ctx, params.chatId, params.principal.userId),
      loadInjections(ctx, params.chatId),
      loadCanonRows(ctx, params.chatId),
      ctx.exportRpgGame({ chatId: params.chatId }),
    ]);

    const personaIds = [...new Set(slots.flatMap((m) => (m.personaId !== null ? [m.personaId] : [])))];
    if (chat.anchorPersonaId !== null && !personaIds.includes(chat.anchorPersonaId)) {
      personaIds.push(chat.anchorPersonaId);
    }
    const personaNameById = await loadPersonaNames(ctx, personaIds);
    const { portable, messageIndexById, variantPositionById } = buildCanon({ slots, variantsByMessage, handleById, personaNameById });

    const rpg = rawRpg === null ? null : toPortableRpg({ game: rawRpg, messageIndexById, variantPositionById, handleById });
    const bundle: PortableChat = {
      title: chat.title ?? "",
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      starred: chat.starred,
      archived: chat.archived,
      compactSummary: chat.compactSummary,
      compactedAtSeq: chat.compactedAtSeq,
      // The room blob rides VERBATIM (its own read seam validates it on the way back in).
      metadata: toPortableMetadata(chat.metadata),
      variableValues: chat.variableValues,
      userMacroValues: chat.userMacroValues,
      anchorPersonaName: chat.anchorPersonaId === null ? null : (personaNameById.get(chat.anchorPersonaId) ?? null),
      characterHandles: handles,
      tagNames,
      injections,
      messages: portable,
      rpg,
    };
    // A FLAT, human-meaningful download name (the `exportChat` slug shape) — the single-chat HTTP door serves
    // this verbatim. The BUNDLE descriptor re-nests it under the primary seat's handle at the composition
    // seam, exactly where the jsonl arm's `<handle>/<chatId>` layout is already decided; a verb that baked a
    // directory in would be deciding the archive's shape from inside a single-entity door.
    return { bytes: buildChatBundleFile(bundle), filename: `${slug(handles[0] ?? "chat")}-${slug(chat.title ?? "chat")}${CHAT_BUNDLE_EXT}` };
  };
}
