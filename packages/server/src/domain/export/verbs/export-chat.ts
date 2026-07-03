// verb: exportChat (PD-42) — read the chat + canon (D26 slots⋈variants) + the persona/character names and
// emit the ST JSONL interchange or the TXT transcript (the pure `substrate/chat-jsonl.ts` builders).
//
// GATE (D29): chats are MEMBERSHIP-scoped (D18 — no `chats.ownerId`); bulk transcript extraction is a HOST
// action in v1. Export is the sanctioned bulk db-reader (no domain-service injection),
// so the gate is a direct roster read: the caller must BE the present `role='host'` row. A non-host caller
// and a missing chat COLLAPSE to `null` (no foreign-existence leak; HTTP maps null → 404).
//
// D26 mapping: a message's primary contribution is its SELECTED variant (content + economics); the full
// variant set is the swipe array (the builder's >1 gate). D28: the character name resolves off the flat
// `characters` row of the FIRST character participant (join order — never a version pin). The `{{user}}` name
// is the chat's ANCHOR persona (`chats.anchorPersonaId` → personas.name). Branch/note round-trip:
// `parentRef` = the parent chat's `importedFrom`; `notePrompt` = `roomOverrides.authorsNote` (the ST
// author's-note home in orbweaver's typed metadata).

import { characters, chatParticipants, chats, messages, messageVariants, personas } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { ExportChatParams, ExportMessage, ExportVariant } from "../contract/params";
import type { ExportedText } from "../contract/results";
import type { ExportContext, ExportService } from "../contract/service";
import { buildChatJsonl, buildChatTxt } from "../substrate/chat-jsonl";
import { slug } from "../substrate/download-slug";

type ChatRow = typeof chats.$inferSelect;
type VariantRow = typeof messageVariants.$inferSelect;

/** Map a D26 variant row → the builder's swipe shape. */
function toExportVariant(v: VariantRow): ExportVariant {
  return {
    content: v.content,
    model: v.model,
    provider: v.provider,
    tokensOut: v.tokensOut,
    reasoning: v.reasoning,
    genStarted: v.genStartedAt,
    genFinished: v.genFinishedAt,
  };
}

type MessageRow = typeof messages.$inferSelect;

/** The per-chat speaker-name maps (D18/Part III — a room has MANY characters + personas): characterId → card
 *  name (every voicing character), personaId → persona name (every human author). Built ONCE from the canon's
 *  distinct ids so each turn resolves to its OWN speaker, not the header primary. */
async function loadSpeakerNames(
  ctx: ExportContext,
  slots: readonly MessageRow[],
): Promise<{ char: Map<string, string>; persona: Map<string, string> }> {
  const charIds = [
    ...new Set(slots.flatMap((m) => (m.characterId !== null ? [m.characterId] : []))),
  ];
  const personaIds = [
    ...new Set(slots.flatMap((m) => (m.personaId !== null ? [m.personaId] : []))),
  ];
  const charRows =
    charIds.length === 0
      ? []
      : await ctx.db
          .select({ id: characters.id, name: characters.name })
          .from(characters)
          .where(inArray(characters.id, charIds));
  const personaRows =
    personaIds.length === 0
      ? []
      : await ctx.db
          .select({ id: personas.id, name: personas.name })
          .from(personas)
          .where(inArray(personas.id, personaIds));
  return {
    char: new Map(charRows.map((c) => [c.id, c.name])),
    persona: new Map(personaRows.map((p) => [p.id, p.name])),
  };
}

/** Resolve THIS turn's speaker display name (Part III — the per-message speaker, never the header primary):
 *  a human turn is its authoring persona; an assistant turn is its voicing character. FLAG[PD-17]: an
 *  agent-authored assistant row (`characterId` NULL, `authorUserId` set — AP3) has no name source here yet
 *  (its soul name needs `resolveAgentSpeaker`, doc 04 §5) → it degrades to the header character name; the
 *  `agent_author` provenance (doc 06 §6) lands with the seat wave. */
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

/** Load the canon (slots ⋈ their variant sets, seq order) → the builder inputs. The SELECTED variant is the
 *  message's primary contribution (D26); a slot whose pointer is null degrades to variant 0 (the insert-time
 *  window) — never a throw. Each row carries its OWN resolved speaker name (Part III group fidelity). */
async function loadExportMessages(
  ctx: ExportContext,
  chatId: ChatId,
  fallback: { characterName: string; userName: string | null },
): Promise<ExportMessage[]> {
  const slots = await ctx.db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.seq));
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
  return slots.map((m) => {
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
      activeVariantIdx: selected?.idx ?? null,
      variants: variants.map(toExportVariant),
    };
  });
}

/** The chat-level header facts: the primary character's name (D28 flat row, join order — inv #5), the
 *  anchor persona's name, and the branch round-trip ref. Every miss degrades (never a throw). */
async function loadExportMeta(
  ctx: ExportContext,
  chat: ChatRow,
): Promise<{ characterName: string; userName: string | null; parentRef: string | null }> {
  const [firstChar] = await ctx.db
    .select({ characterId: chatParticipants.characterId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chat.id), isNotNull(chatParticipants.characterId)))
    .orderBy(asc(chatParticipants.joinSeq), asc(chatParticipants.id))
    .limit(1);
  let characterName = "Character";
  if (firstChar?.characterId !== null && firstChar?.characterId !== undefined) {
    const [c] = await ctx.db
      .select({ name: characters.name })
      .from(characters)
      .where(eq(characters.id, firstChar.characterId))
      .limit(1);
    characterName = c?.name ?? characterName;
  }
  let userName: string | null = null;
  if (chat.anchorPersonaId !== null) {
    const [p] = await ctx.db
      .select({ name: personas.name })
      .from(personas)
      .where(eq(personas.id, chat.anchorPersonaId))
      .limit(1);
    userName = p?.name ?? null;
  }
  let parentRef: string | null = null;
  if (chat.parentChatId !== null) {
    const [parent] = await ctx.db
      .select({ importedFrom: chats.importedFrom })
      .from(chats)
      .where(eq(chats.id, chat.parentChatId))
      .limit(1);
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
    // D29 host gate — the caller must be the PRESENT `role='host'` row (a non-host caller and a missing
    // chat collapse to the same null; the direct roster read is export's sanctioned bulk-serializer read).
    const hostRows = await ctx.db
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.role, "host"),
          isNotNull(chatParticipants.userId),
        ),
      );
    const isHost = hostRows.some((r) => r.userId === principal.userId);
    if (!isHost) {
      return null;
    }

    const { characterName, userName, parentRef } = await loadExportMeta(ctx, chat);
    // The ST author's note (`note_prompt`) — orbweaver's home is the room-override blob.
    const rawNote = chat.metadata?.roomOverrides?.authorsNote;
    const notePrompt = typeof rawNote === "string" ? rawNote : null;
    const exportMessages = await loadExportMessages(ctx, chatId, { characterName, userName });

    const meta = { characterName, userName, createDate: chat.createdAt, parentRef, notePrompt };
    const base = `${slug(characterName)}-${slug(chat.title ?? "chat")}`;
    if (format === "txt") {
      return { text: buildChatTxt(meta, exportMessages), filename: `${base}.txt` };
    }
    return { text: buildChatJsonl(meta, exportMessages), filename: `${base}.jsonl` };
  };
}
