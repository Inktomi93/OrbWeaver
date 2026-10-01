import type { CorpusSource } from "@orb/contracts/search";
import { chatSegments, embedGenerations, messages } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { ChatNotFoundError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { createGetMessageWindow } from "../../../../../packages/server/src/domain/chat/verbs/message-window.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal } from "../../../../support/factories/principal.ts";
import { seedUser as seedUserRow } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChatSegment, vec } from "../../search/_support.ts";
import { makeChatContext, makeLoadParticipantViews, seedChat, seedMessage, seedParticipant } from "../_support.ts";

interface SourceWindowFixture {
  readonly db: Awaited<ReturnType<typeof freshDb>>;
  readonly host: Awaited<ReturnType<typeof seedUserRow>>["id"];
  readonly member: Awaited<ReturnType<typeof seedUserRow>>["id"];
  readonly outsider: Awaited<ReturnType<typeof seedUserRow>>["id"];
  readonly chatId: Awaited<ReturnType<typeof seedChat>>;
  readonly source: CorpusSource;
  readonly read: ReturnType<typeof createGetMessageWindow>;
  readonly slots: Awaited<ReturnType<typeof seedMessage>>[];
}
async function setup(): Promise<SourceWindowFixture> {
  const db = await freshDb();
  const host = (await seedUserRow(db, { id: mintTypeId(ID_PREFIX.user), handle: castId<Handle>("window-host") })).id;
  const member = (await seedUserRow(db, { id: mintTypeId(ID_PREFIX.user), handle: castId<Handle>("window-member") })).id;
  const outsider = (await seedUserRow(db, { id: mintTypeId(ID_PREFIX.user), handle: castId<Handle>("window-outsider") })).id;
  const chatId = await seedChat(db, "source-room", { id: mintTypeId(ID_PREFIX.chat) });
  await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "member", userId: member, joinSeq: 24, joinHistoryVisibility: "from-join" });
  const slots: Awaited<ReturnType<typeof seedMessage>>[] = [];
  for (let seq = 1; seq <= 60; seq += 1) {
    slots.push(
      await seedMessage(db, chatId, seq, {
        id: mintTypeId(ID_PREFIX.message),
        variantId: mintTypeId(ID_PREFIX.messageVariant),
        content: seq === 24 ? 'public <lie character="Witness" type="location" truth="private truth" reason="hidden"/> end' : `line ${seq}`,
      }),
    );
  }
  const rowId = await seedChatSegment(db, {
    id: mintTypeId(ID_PREFIX.chatSegment),
    chatId,
    blockIdx: 2,
    chunkIdx: 1,
    embedding: vec(1),
    text: "selected chunk",
  });
  const [row] = await db.select().from(chatSegments).where(eq(chatSegments.id, rowId));
  if (row === undefined) {
    throw new Error("missing segment fixture");
  }
  const [generation] = await db.select().from(embedGenerations).where(eq(embedGenerations.id, row.generationId));
  if (generation === undefined) {
    throw new Error("missing generation fixture");
  }
  const source: CorpusSource = {
    kind: "segment",
    rowId,
    chatId,
    generationId: row.generationId,
    fingerprint: generation.fingerprint,
    contentHash: row.contentHash,
    blockIdx: row.blockIdx,
    chunkIdx: row.chunkIdx,
    seqStart: row.seqStart,
    seqEnd: row.seqEnd,
    messageStartId: slots[19]?.messageId ?? null,
    messageEndId: slots[28]?.messageId ?? null,
  };
  const read = createGetMessageWindow(makeChatContext(db), { loadParticipantViews: makeLoadParticipantViews(db) });
  return { db, host, member, outsider, chatId, source, read, slots };
}

describe("member-visible source windows", () => {
  test("resolves the exact chunk and preserves its stable endpoints beyond ordinary paging", async () => {
    const { host, chatId, source, read } = await setup();
    const page = await read({ principal: principal(host), chatId, target: { kind: "source", source }, limit: 10 });
    expect(page).toMatchObject({ outcome: "resolved", anchorMessageId: source.messageStartId, endMessageId: source.messageEndId });
    expect(page.messages.map((message) => message.seq)).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
  });

  test("clamps every direction to the member floor and removes hidden bytes before delivery", async () => {
    const { member, chatId, source, read } = await setup();
    const target = { kind: "source" as const, source };
    const page = await read({ principal: principal(member), chatId, target, limit: 12 });
    expect(page.outcome).toBe("moved");
    expect(page.messages[0]?.seq).toBe(24);
    expect(page.messages[0]?.content).toBe("public  end");
    expect(JSON.stringify(page)).not.toContain("private truth");
    expect(page.hasBefore).toBe(false);
    expect((await read({ principal: principal(member), chatId, target, cursor: { kind: "before", seq: 24 } })).messages).toEqual([]);
    expect(
      (await read({ principal: principal(member), chatId, target, cursor: { kind: "after", seq: 0 } })).messages.every((message) => message.seq >= 24),
    ).toBe(true);
  });

  test("a replaced row or deleted start moves to surviving original coverage", async () => {
    const { db, host, chatId, source, read } = await setup();
    await db.update(chatSegments).set({ contentHash: "replacement" }).where(eq(chatSegments.id, source.rowId));
    expect((await read({ principal: principal(host), chatId, target: { kind: "source", source } })).outcome).toBe("moved");
    await db.delete(messages).where(and(eq(messages.chatId, chatId), eq(messages.seq, 20)));
    const page = await read({ principal: principal(host), chatId, target: { kind: "source", source } });
    expect(page.outcome).toBe("moved");
    expect(page).toMatchObject({ anchorMessageId: source.messageEndId, anchorSeq: 29 });
  });

  test("same-hash replacement coverage cannot claim the original source span is exact", async () => {
    const { db, host, chatId, source, read } = await setup();
    await db.update(chatSegments).set({ seqStart: 30, seqEnd: 39 }).where(eq(chatSegments.id, source.rowId));
    expect(await read({ principal: principal(host), chatId, target: { kind: "source", source } })).toMatchObject({
      outcome: "moved",
      anchorMessageId: source.messageStartId,
      anchorSeq: source.seqStart,
    });
  });

  test("a reordered stable start wins over an unrelated replacement at its old sequence", async () => {
    const { db, host, chatId, source, read } = await setup();
    if (source.messageStartId === null) {
      throw new Error("missing stable start fixture");
    }
    await db.update(messages).set({ seq: 61 }).where(eq(messages.id, source.messageStartId));
    const replacement = await seedMessage(db, chatId, 20, {
      id: mintTypeId(ID_PREFIX.message),
      variantId: mintTypeId(ID_PREFIX.messageVariant),
      content: "unrelated replacement",
    });
    const page = await read({ principal: principal(host), chatId, target: { kind: "source", source } });
    expect(page).toMatchObject({ outcome: "moved", anchorMessageId: source.messageStartId, anchorSeq: 61, endMessageId: source.messageStartId, endSeq: 61 });
    expect(page.anchorMessageId).not.toBe(replacement.messageId);
  });

  test("a moved stable end wins over unrelated reused slots when the stable start is deleted", async () => {
    const { db, host, chatId, source, read } = await setup();
    if (source.messageStartId === null || source.messageEndId === null) {
      throw new Error("missing stable source endpoints");
    }
    await db.delete(messages).where(eq(messages.id, source.messageStartId));
    await db.update(messages).set({ seq: 61 }).where(eq(messages.id, source.messageEndId));
    const replacement = await seedMessage(db, chatId, 20, {
      id: mintTypeId(ID_PREFIX.message),
      variantId: mintTypeId(ID_PREFIX.messageVariant),
      content: "unrelated reused source slot",
    });
    const page = await read({ principal: principal(host), chatId, target: { kind: "source", source } });
    expect(page).toMatchObject({ outcome: "moved", anchorMessageId: source.messageEndId, anchorSeq: 61, endMessageId: source.messageEndId, endSeq: 61 });
    expect(page.anchorMessageId).not.toBe(replacement.messageId);
  });

  test("deleted canon has no claimed jump; missing generation has an unavailable outcome", async () => {
    const { db, host, chatId, source, read } = await setup();
    for (let seq = 20; seq <= 29; seq += 1) {
      await db.delete(messages).where(and(eq(messages.chatId, chatId), eq(messages.seq, seq)));
    }
    expect(await read({ principal: principal(host), chatId, target: { kind: "source", source } })).toMatchObject({
      outcome: "deleted",
      anchorMessageId: null,
      messages: [],
    });
    await db.delete(embedGenerations).where(eq(embedGenerations.id, source.generationId));
    expect(await read({ principal: principal(host), chatId, target: { kind: "source", source } })).toMatchObject({
      outcome: "unavailable",
      anchorMessageId: null,
      messages: [],
    });
  });

  test("membership and secondary message scope both refuse foreign identity bytes", async () => {
    const { db, host, outsider, chatId, source, read } = await setup();
    await expect(read({ principal: principal(outsider), chatId, target: { kind: "source", source } })).rejects.toBeInstanceOf(ChatNotFoundError);
    const foreignChat = await seedChat(db, "foreign-source-room", { id: mintTypeId(ID_PREFIX.chat) });
    await seedParticipant(db, { chatId: foreignChat, key: "foreign-host", userId: outsider, role: "host" });
    const foreign = await seedMessage(db, foreignChat, 20, {
      id: mintTypeId(ID_PREFIX.message),
      variantId: mintTypeId(ID_PREFIX.messageVariant),
      content: "foreign marker",
    });
    const page = await read({ principal: principal(host), chatId, target: { kind: "message", messageId: foreign.messageId } });
    expect(page).toMatchObject({ outcome: "deleted", anchorMessageId: null, messages: [] });
    expect(JSON.stringify(page)).not.toContain(foreign.messageId);
    expect(await read({ principal: principal(host), chatId, target: { kind: "source", source: { ...source, chatId: foreignChat } } })).toMatchObject({
      outcome: "unavailable",
      messages: [],
      anchorMessageId: null,
    });
  });
});
