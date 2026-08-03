// Read the chat + canon (slots ⋈ variants) + persona/character names, build the canonical `ParsedChat`, and
// emit via the chat serde core. The relational work (id → name resolution) lives here, before build; the
// serde stays pure JSONL↔ParsedChat.
//
// Chats are membership-scoped (no `chats.ownerId`); bulk transcript extraction is a host action in v1. The
// gate is a direct roster read: the caller must be the present `role='host'` row. A non-host caller and a
// missing chat collapse to `null` (HTTP maps null → 404).
//
// A message's primary contribution is its selected variant; the full variant set is the swipe array. The
// character name resolves off the flat row of the first character participant. The `{{user}}` name is the
// chat's anchor persona.

import { characters, chatParticipants, chats, messages, messageVariants, personas } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { ParsedChat, ParsedChatMessage, ParsedVariant } from "#kit/serde/chat";
import { buildChatJsonl, buildChatTxt, classifyChat } from "#kit/serde/chat";
import type { ExportContext } from "../context.ts";
import type { ExportChatParams } from "../contract/params.ts";
import type { ExportedText } from "../contract/results.ts";
import type { ExportService } from "../contract/service.ts";
import { slug } from "../substrate/download-slug.ts";

type ChatRow = typeof chats.$inferSelect;
type VariantRow = typeof messageVariants.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

// Map a variant row → the serde's swipe shape. `metadata` is not round-tripped through JSONL, so it's null
// on the export side.
function toParsedVariant(v: VariantRow): ParsedVariant {
  return {
    idx: v.idx,
    content: v.content,
    model: v.model,
    provider: v.provider,
    tokensOut: v.tokensOut,
    reasoning: v.reasoning,
    genStarted: v.genStartedAt,
    genFinished: v.genFinishedAt,
    metadata: null,
  };
}

// The per-chat speaker-name maps: characterId → card name, personaId → persona name. Built once from the
// canon's distinct ids so each turn resolves to its own speaker, not the header primary.
// @owner-scope-ok: the export ran the HOST gate on the chat first (file header — a non-host caller collapses
// to null before any of this), and the ids are the room's own message attribution stamps, not caller input.
// The read returns display names only. Owner-scoping on the caller would blank a co-member's card name in a
// multi-human room. Ends if export ever runs without the roster gate.
async function loadSpeakerNames(ctx: ExportContext, slots: readonly MessageRow[]): Promise<{ char: Map<string, string>; persona: Map<string, string> }> {
  const charIds = [...new Set(slots.flatMap((m) => (m.characterId !== null ? [m.characterId] : [])))];
  const personaIds = [...new Set(slots.flatMap((m) => (m.personaId !== null ? [m.personaId] : [])))];
  const charRows =
    charIds.length === 0 ? [] : await ctx.db.select({ id: characters.id, name: characters.name }).from(characters).where(inArray(characters.id, charIds));
  const personaRows =
    personaIds.length === 0 ? [] : await ctx.db.select({ id: personas.id, name: personas.name }).from(personas).where(inArray(personas.id, personaIds));
  return {
    char: new Map(charRows.map((c) => [c.id, c.name])),
    persona: new Map(personaRows.map((p) => [p.id, p.name])),
  };
}

// Resolve this turn's speaker display name: a human turn is its authoring persona; an assistant turn is its
// voicing character. A row with none of those sources degrades to the header character name.
function resolveSpeakerName(
  m: MessageRow,
  names: { char: Map<string, string>; persona: Map<string, string> },
  fallback: { characterName: string; userName: string | null },
): string {
  if (m.role === "user") {
    const persona = m.personaId !== null ? names.persona.get(m.personaId) : undefined;
    return persona ?? fallback.userName ?? "User";
  }
  if (m.characterId !== null) {
    return names.char.get(m.characterId) ?? fallback.characterName;
  }
  return fallback.characterName;
}

// Load the canon (slots ⋈ their variant sets, seq order) → the serde message inputs. The selected variant is
// the message's primary contribution; a slot whose pointer is null degrades to variant 0, never a throw.
async function loadParsedMessages(
  ctx: ExportContext,
  chatId: ChatId,
  fallback: { characterName: string; userName: string | null },
): Promise<ParsedChatMessage[]> {
  const slots = await ctx.db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.seq));
  if (slots.length === 0) {
    return [];
  }
  const variantRows = await ctx.db
    .select()
    .from(messageVariants)
    .where(
      inArray(
        messageVariants.messageId,
        slots.map((m) => m.id),
      ),
    );
  const byMessage = new Map<string, VariantRow[]>();
  for (const v of variantRows) {
    const list = byMessage.get(v.messageId) ?? [];
    list.push(v);
    byMessage.set(v.messageId, list);
  }
  const names = await loadSpeakerNames(ctx, slots);
  return slots.map((m): ParsedChatMessage => {
    const variants = (byMessage.get(m.id) ?? []).sort((a, b) => a.idx - b.idx);
    const selected = variants.find((v) => v.id === m.selectedVariantId) ?? variants[0];
    return {
      role: m.role,
      speakerName: resolveSpeakerName(m, names, fallback),
      content: selected?.content ?? "",
      sendDate: m.createdAt,
      model: selected?.model ?? null,
      provider: selected?.provider ?? null,
      tokensOut: selected?.tokensOut ?? null,
      reasoning: selected?.reasoning ?? null,
      genStarted: selected?.genStartedAt ?? null,
      genFinished: selected?.genFinishedAt ?? null,
      ttftMs: selected?.ttftMs ?? null,
      metadata: null,
      activeVariantIdx: selected?.idx ?? null,
      variants: variants.map(toParsedVariant),
    };
  });
}

// The chat-level header facts: the primary character's name, the anchor persona's name, and the branch
// round-trip ref. Every miss degrades, never a throw.
// @owner-scope-ok: same host-gated chat as `loadSpeakerNames`; the character id is read off this room's own
// roster and the persona id off its own `anchorPersonaId` column — both already-authorized room state, not
// caller input. Names only, and every miss degrades to a default rather than throwing. Ends with the roster
// gate above it.
async function loadExportMeta(ctx: ExportContext, chat: ChatRow): Promise<{ characterName: string; userName: string | null; parentRef: string | null }> {
  const [firstChar] = await ctx.db
    .select({ characterId: chatParticipants.characterId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chat.id), isNotNull(chatParticipants.characterId)))
    .orderBy(asc(chatParticipants.joinSeq), asc(chatParticipants.id))
    .limit(1);
  let characterName = "Character";
  if (firstChar?.characterId !== null && firstChar?.characterId !== undefined) {
    const [c] = await ctx.db.select({ name: characters.name }).from(characters).where(eq(characters.id, firstChar.characterId)).limit(1);
    characterName = c?.name ?? characterName;
  }
  let userName: string | null = null;
  if (chat.anchorPersonaId !== null) {
    const [p] = await ctx.db.select({ name: personas.name }).from(personas).where(eq(personas.id, chat.anchorPersonaId)).limit(1);
    userName = p?.name ?? null;
  }
  let parentRef: string | null = null;
  if (chat.parentChatId !== null) {
    const [parent] = await ctx.db.select({ importedFrom: chats.importedFrom }).from(chats).where(eq(chats.id, chat.parentChatId)).limit(1);
    parentRef = parent?.importedFrom ?? null;
  }
  return { characterName, userName, parentRef };
}

export function createExportChat(ctx: ExportContext): ExportService["exportChat"] {
  return async ({ principal, chatId, format }: ExportChatParams): Promise<ExportedText | null> => {
    const [chat] = await ctx.db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
    if (chat === undefined) {
      return null;
    }
    // Host gate — the caller must be the present `role='host'` row.
    const hostRows = await ctx.db
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq), isNotNull(chatParticipants.userId)));
    const isHost = hostRows.some((r) => r.userId === principal.userId);
    if (!isHost) {
      return null;
    }

    const { characterName, userName, parentRef } = await loadExportMeta(ctx, chat);
    const parsedMessages = await loadParsedMessages(ctx, chatId, { characterName, userName });

    const parsedChat: ParsedChat = {
      characterName,
      userName,
      createDate: chat.createdAt,
      isBranch: parentRef !== null,
      parentRef,
      // ALWAYS null: the room author's-note override was retired (owner ruling 2026-08-01) — per-chat prose
      // is a `chat_injections` LIST now, and ST's single `note_prompt` slot has no unambiguous inverse for a
      // list. Import still lands an inbound `note_prompt` as an injection; the export leg is one-way.
      notePrompt: null,
      bucket: classifyChat(parsedMessages),
      sourceMetadata: null,
      messages: parsedMessages,
    };
    const base = `${slug(characterName)}-${slug(chat.title ?? "chat")}`;
    if (format === "txt") {
      return { text: buildChatTxt(parsedChat), filename: `${base}.txt` };
    }
    return { text: buildChatJsonl(parsedChat), filename: `${base}.jsonl` };
  };
}
