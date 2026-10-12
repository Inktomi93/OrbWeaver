// A deep dump of one chat's stored state: the chat row, the roster, every message slot with its selected
// variant's content, the agent-sdk session-cache frame count, and recent bus events. The "did it actually
// land in the DB?" check the log/trace rings can't answer.

import type { ChatInspection } from "@orb/contracts/debug";
import type { Db } from "@orb/db";
import { characters, chatEvents, chatParticipants, chats, messages, messageVariants, sessionEntries } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { asc, count, desc, eq } from "drizzle-orm";

const RECENT_EVENT_LIMIT = 50;

type InspectedParticipant = ChatInspection["participants"][number];
type InspectedMessage = ChatInspection["messages"][number];

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

  const frameRows = await db.select({ n: count() }).from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  const sessionFrameCount = Number(frameRows[0]?.n ?? 0);

  const recentEvents = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId)).orderBy(desc(chatEvents.seq)).limit(RECENT_EVENT_LIMIT);

  return {
    found: true,
    chat: chatRow,
    participants,
    messages: inspectedMessages,
    sessionFrameCount,
    recentEvents,
  };
}
