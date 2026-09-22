// The `chat_stream_events` append writer's attribution boundary. These are real libSQL batches: a delta
// stamped for another chat is refused before statement construction, and a forged message root rolls the
// whole batch back when the message lookup proves the id belongs elsewhere.

import type { ChatDeltaEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatStreamEvents, chats, messages } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { loadStreamReplay } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { insertChatStreamEventStatements } from "../../../../../packages/server/src/domain/chat/persistence/stream-events.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedChat, seedMessage } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("insertChatStreamEventStatements — trusted message attribution", () => {
  test("a deleted message cannot rewind the chat cursor past an already-issued resume token", async () => {
    const ctx = makeChatContext(db);
    const chatId = await seedChat(db, "monotonic-cursor");
    const first = await seedMessage(db, chatId, 1, { role: "assistant", content: "first" });
    const firstStatements = insertChatStreamEventStatements(db, {
      message: { id: first.messageId, chatId },
      deltas: [
        { chatId, kind: "text", text: "a" },
        { chatId, kind: "text", text: "b" },
      ],
      newEventId: ctx.newStreamEventId,
      newGenerationId: ctx.newStreamGenerationId,
      createdAt: ctx.now(),
    });
    await db.batch(batchMany(firstStatements));
    const firstReplay = await loadStreamReplay(db, chatId, undefined, 0);
    const issuedCursor = firstReplay.at(-1)?.seq;
    expect(issuedCursor).toBe(2);
    expect(new Set(firstReplay.map(({ generationId }) => generationId)).size).toBe(1);
    const firstGenerationId = firstReplay[0]?.generationId;

    await db.delete(messages).where(eq(messages.id, first.messageId));
    const second = await seedMessage(db, chatId, 2, { role: "assistant", content: "second" });
    const secondStatements = insertChatStreamEventStatements(db, {
      message: { id: second.messageId, chatId },
      deltas: [{ chatId, kind: "text", text: "new" }],
      newEventId: ctx.newStreamEventId,
      newGenerationId: ctx.newStreamGenerationId,
      createdAt: ctx.now(),
    });
    await db.batch(batchMany(secondStatements));

    const resumed = await loadStreamReplay(db, chatId, issuedCursor, 0);
    expect(resumed).toMatchObject([{ seq: 3, delta: "new" }]);
    expect(resumed[0]?.generationId).not.toBe(firstGenerationId);
  });

  test("concurrent append batches allocate distinct cursors from the chat-owned head", async () => {
    const ctx = makeChatContext(db);
    const chatId = await seedChat(db, "concurrent-cursor");
    const first = await seedMessage(db, chatId, 1, { role: "assistant", content: "first" });
    const second = await seedMessage(db, chatId, 2, { role: "assistant", content: "second" });
    const append = async (messageId: typeof first.messageId, text: string): Promise<void> => {
      await db.batch(
        batchMany(
          insertChatStreamEventStatements(db, {
            message: { id: messageId, chatId },
            deltas: [{ chatId, kind: "text", text }],
            newEventId: ctx.newStreamEventId,
            newGenerationId: ctx.newStreamGenerationId,
            createdAt: ctx.now(),
          }),
        ),
      );
    };

    await Promise.all([append(first.messageId, "first"), append(second.messageId, "second")]);

    const rows = await loadStreamReplay(db, chatId, undefined, 0);
    expect(rows.map(({ seq }) => seq)).toEqual([1, 2]);
    expect(new Set(rows.map(({ generationId }) => generationId).filter((id) => id !== null)).size).toBe(2);
  });

  test("refuses a cross-chat delta before building any persistence statement", async () => {
    const ctx = makeChatContext(db);
    const messageChatId = await seedChat(db, "message-chat");
    const deltaChatId = await seedChat(db, "delta-chat");
    const { messageId } = await seedMessage(db, messageChatId, 1, { role: "assistant", content: "root" });
    const delta: ChatDeltaEvent = { chatId: deltaChatId, kind: "text", text: "wrong room" };

    expect(() =>
      insertChatStreamEventStatements(db, {
        message: { id: messageId, chatId: messageChatId },
        deltas: [delta],
        newEventId: ctx.newStreamEventId,
        newGenerationId: ctx.newStreamGenerationId,
        createdAt: ctx.now(),
      }),
    ).toThrow("chat stream event attribution mismatch");
    expect(await db.select().from(chatStreamEvents)).toEqual([]);
  });

  test("a mismatched claimed message root rejects the atomic batch and persists no stream row", async () => {
    const ctx = makeChatContext(db);
    const actualChatId = await seedChat(db, "actual-chat");
    const claimedChatId = await seedChat(db, "claimed-chat");
    const { messageId } = await seedMessage(db, actualChatId, 1, { role: "assistant", content: "root" });
    const delta: ChatDeltaEvent = { chatId: claimedChatId, kind: "text", text: "wrong root" };
    const statements = insertChatStreamEventStatements(db, {
      message: { id: messageId, chatId: claimedChatId },
      deltas: [delta],
      newEventId: ctx.newStreamEventId,
      newGenerationId: ctx.newStreamGenerationId,
      createdAt: ctx.now(),
    });

    await expect(db.batch(batchMany(statements))).rejects.toThrow();
    expect(await db.select().from(chatStreamEvents)).toEqual([]);
    expect((await db.select({ streamSeq: chats.streamSeq }).from(chats).where(eq(chats.id, claimedChatId)))[0]?.streamSeq).toBe(0);
  });
});
