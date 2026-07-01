// foundation/observability/debug/inspect/inspect-chat — a deep dump of one chat's stored state: the chat
// row, the roster (D16 chat_participants), every message slot WITH its selected variant's content (D26),
// the agent-sdk session-cache frame count (D8/D25 — keyed by chatId, NOT a chats.sessionId), and recent
// bus events. The "did it actually land in the DB?" check the log/trace rings can't answer. Reads @orb/db
// DOWN. No characterVersions (D28 — the card is the flat `characters` row).

import type { Db } from "@orb/db";
import {
  characters,
  chatEvents,
  chatParticipants,
  chats,
  messages,
  messageVariants,
  sessionEntries,
} from "@orb/db";
import type {
  CharacterId,
  ChatId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { asc, count, desc, eq } from "drizzle-orm";

const RECENT_EVENT_LIMIT = 50;

/** One roster member (the actor XOR + the resolved character name when it's a character). */
export interface InspectedParticipant {
  id: string;
  kind: string; // FLAG[PD-8]
  role: string; // FLAG[PD-8]
  userId: UserId | null;
  characterId: CharacterId | null;
  characterName: string | null;
}

/** One message slot flattened with its selected variant's content/provenance (D26). */
export interface InspectedMessage {
  id: MessageId;
  seq: number;
  role: string;
  authorUserId: UserId | null;
  characterId: CharacterId | null;
  personaId: PersonaId | null;
  selectedVariantId: MessageVariantId | null;
  excludedFromPrompt: boolean;
  content: string | null;
  model: string | null;
  provider: string | null;
}

/** The full chat inspection (foundation-internal; returned as JSON by /api/_debug/db/chat/:id). */
export interface ChatInspection {
  found: boolean;
  chat: typeof chats.$inferSelect | null;
  participants: InspectedParticipant[];
  messages: InspectedMessage[];
  sessionFrameCount: number;
  recentEvents: (typeof chatEvents.$inferSelect)[];
}

const NOT_FOUND: ChatInspection = {
  found: false,
  chat: null,
  participants: [],
  messages: [],
  sessionFrameCount: 0,
  recentEvents: [],
};

export async function inspectChatState(db: Db, chatId: ChatId): Promise<ChatInspection> {
  const chatRow = (await db.select().from(chats).where(eq(chats.id, chatId)).limit(1))[0] ?? null;
  if (chatRow === null) {
    return NOT_FOUND;
  }

  const participantRows = await db
    .select({ p: chatParticipants, characterName: characters.name })
    .from(chatParticipants)
    .leftJoin(characters, eq(chatParticipants.characterId, characters.id))
    .where(eq(chatParticipants.chatId, chatId));
  const participants: InspectedParticipant[] = participantRows.map(({ p, characterName }) => ({
    id: p.id,
    kind: p.kind,
    role: p.role,
    userId: p.userId,
    characterId: p.characterId,
    characterName: characterName ?? null,
  }));

  // The slot joined to its SELECTED variant (D26 — content lives on the variant the pointer names).
  const messageRows = await db
    .select({ m: messages, v: messageVariants })
    .from(messages)
    .leftJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.seq));
  const inspectedMessages: InspectedMessage[] = messageRows.map(({ m, v }) => ({
    id: m.id,
    seq: m.seq,
    role: m.role,
    authorUserId: m.authorUserId,
    characterId: m.characterId,
    personaId: m.personaId,
    selectedVariantId: m.selectedVariantId,
    excludedFromPrompt: m.excludedFromPrompt,
    content: v?.content ?? null,
    model: v?.model ?? null,
    provider: v?.provider ?? null,
  }));

  const frameRows = await db
    .select({ n: count() })
    .from(sessionEntries)
    .where(eq(sessionEntries.chatId, chatId));
  const sessionFrameCount = Number(frameRows[0]?.n ?? 0);

  const recentEvents = await db
    .select()
    .from(chatEvents)
    .where(eq(chatEvents.chatId, chatId))
    .orderBy(desc(chatEvents.seq))
    .limit(RECENT_EVENT_LIMIT);

  return {
    found: true,
    chat: chatRow,
    participants,
    messages: inspectedMessages,
    sessionFrameCount,
    recentEvents,
  };
}
