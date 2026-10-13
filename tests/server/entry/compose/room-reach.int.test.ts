// Real composed writes and transport frames prove reach authority, confirmed deletion, and failure isolation.
import "@orb/testkit/node/composed-real.ts";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { auditLogs, chatEvents, regexScripts } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { getLog } from "@orb/server/foundation/observability";
import { subscribeAllChatEvents } from "@orb/server/transport/trpc";
import type { HeldDb } from "@orb/testkit/node/db.ts";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";
import { onTestFinished, vi } from "vitest";

const held = test.extend<{ heldDb: HeldDb }>({
  heldDb: async ({}, use): Promise<void> => {
    await use(await freshHeldDb());
  },
  db: async ({ heldDb }, use): Promise<void> => {
    await use(heldDb.db);
  },
});

held(
  "a raced single regex delete preserves its answer but fans no rooms when its owned DELETE removed nothing",
  async ({ heldDb, db, ownerCaller }): Promise<void> => {
    const script = await ownerCaller.regex.createScript({
      input: createRegexScriptSchema.parse({ name: "race", findRegex: "x", replaceString: "y", placement: [] }),
    });
    const { chat } = await ownerCaller.chat.startChat({ characterIds: [] });
    await ownerCaller.regex.attachToChat({ chatId: chat.id, scriptId: script.id });
    const frames: Parameters<Parameters<typeof subscribeAllChatEvents>[0]>[0][] = [];
    onTestFinished(
      subscribeAllChatEvents((frame) => {
        if (frame.event.type === "roomEntityChanged") {
          frames.push(frame);
        }
      }),
    );
    const gate = heldDb.hold(/^delete from "regex_scripts"/u);
    const loser = ownerCaller.regex.removeScript({ scriptId: script.id });
    try {
      await gate.reached;
      gate.disarm();
      expect(await ownerCaller.regex.removeScript({ scriptId: script.id })).toEqual({ deleted: true });
      expect(frames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: chat.id, entity: "regex" } }]);
      frames.length = 0;
      gate.release();
      expect(await loser).toEqual({ deleted: true });
      expect(await db.select().from(regexScripts).where(eq(regexScripts.id, script.id))).toEqual([]);
      expect(
        await db
          .select()
          .from(auditLogs)
          .where(and(eq(auditLogs.actorUserId, OWNER_USER_ID), eq(auditLogs.entityId, script.id), eq(auditLogs.action, "regex.removeScript"))),
      ).toHaveLength(2);
      expect(frames).toEqual([]);
    } finally {
      gate.release();
      await loser;
    }
  },
);

test("bulk regex capture fans only confirmed owned scripts, once per room, and never a host-only library tier", async ({
  services,
  ownerCaller,
  otherCaller,
}): Promise<void> => {
  const input = createRegexScriptSchema.parse({ name: "owned", findRegex: "x", replaceString: "y", placement: [] });
  const first = await ownerCaller.regex.createScript({ input });
  const second = await ownerCaller.regex.createScript({ input: { ...input, name: "second" } });
  const global = await ownerCaller.regex.createScript({ input: { ...input, name: "global" } });
  const foreign = await otherCaller.regex.createScript({ input: { ...input, name: "foreign" } });
  const ownedRoom = (await ownerCaller.chat.startChat({ characterIds: [] })).chat;
  const foreignRoom = (await otherCaller.chat.startChat({ characterIds: [] })).chat;
  await ownerCaller.regex.attachToChat({ chatId: ownedRoom.id, scriptId: first.id });
  await ownerCaller.regex.attachToChat({ chatId: ownedRoom.id, scriptId: second.id });
  await ownerCaller.regex.attachGlobal({ scriptId: global.id });
  await otherCaller.regex.attachToChat({ chatId: foreignRoom.id, scriptId: foreign.id });
  const frames: Parameters<Parameters<typeof subscribeAllChatEvents>[0]>[0][] = [];
  onTestFinished(
    subscribeAllChatEvents((frame) => {
      if (frame.event.type === "roomEntityChanged") {
        frames.push(frame);
      }
    }),
  );
  expect(await ownerCaller.regex.bulkRemove({ scriptIds: [first.id, second.id, global.id, foreign.id, mintTypeId(ID_PREFIX.regexScript)] })).toEqual({
    affected: 3,
  });
  expect((await services.regex.getScript({ principal: principal(OTHER_USER_ID), scriptId: foreign.id })).id).toBe(foreign.id);
  expect(frames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: ownedRoom.id, entity: "regex" } }]);
});

test("a foreign or missing global book never fans its captured rooms, while an owned delete fans after cascade without a durable event", async ({
  db,
  ownerCaller,
  otherCaller,
}): Promise<void> => {
  const room = (await otherCaller.chat.startChat({ characterIds: [] })).chat;
  const book = await otherCaller.worldInfo.createBook({ input: { name: "private book" } });
  const frames: Parameters<Parameters<typeof subscribeAllChatEvents>[0]>[0][] = [];
  const attached = Promise.withResolvers<void>();
  onTestFinished(
    subscribeAllChatEvents((frame) => {
      if (frame.event.type === "roomEntityChanged") {
        frames.push(frame);
        if (frame.event.entity === "world-info" && frame.event.chatId === room.id) {
          attached.resolve();
        }
      }
    }),
  );
  await otherCaller.worldInfo.attachGlobal({ bookId: book.id });
  await attached.promise;
  frames.length = 0;
  const durableBefore = await db.select().from(chatEvents);
  await expect(ownerCaller.worldInfo.removeBook({ bookId: book.id })).toThrowTRPCError("NOT_FOUND");
  await expect(ownerCaller.worldInfo.removeBook({ bookId: mintTypeId(ID_PREFIX.worldBook) })).toThrowTRPCError("NOT_FOUND");
  expect(frames).toEqual([]);
  expect(await otherCaller.worldInfo.removeBook({ bookId: book.id })).toEqual({ deleted: true });
  expect(frames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: room.id, entity: "world-info" } }]);
  expect(await db.select().from(chatEvents)).toEqual(durableBefore);
  await expect(otherCaller.worldInfo.getBook({ bookId: book.id })).toThrowTRPCError("NOT_FOUND");
});

test("global document reach credits a present member rather than only the host, then drops that departed member", async ({
  ownerCaller,
  otherCaller,
}): Promise<void> => {
  const hostRoom = (await ownerCaller.chat.startChat({ characterIds: [] })).chat;
  const invite = await ownerCaller.invites.createInvite({ chatId: hostRoom.id, input: {} });
  await otherCaller.invites.redeemInvite({ token: invite.token });
  const ownRoom = (await otherCaller.chat.startChat({ characterIds: [] })).chat;
  const document = await otherCaller.databank.createFromText({ name: "member globals", text: "shared by a real global attachment" });
  await otherCaller.databank.attachGlobal({ documentId: document.document.id });
  const book = await otherCaller.worldInfo.createBook({ input: { name: "host-only global" } });
  const frames: Parameters<Parameters<typeof subscribeAllChatEvents>[0]>[0][] = [];
  const bookRefreshed = Promise.withResolvers<void>();
  onTestFinished(
    subscribeAllChatEvents((frame) => {
      if (frame.event.type === "roomEntityChanged") {
        frames.push(frame);
        if (frame.event.entity === "world-info" && frame.event.chatId === ownRoom.id) {
          bookRefreshed.resolve();
        }
      }
    }),
  );
  await otherCaller.worldInfo.attachGlobal({ bookId: book.id });
  await bookRefreshed.promise;
  expect(frames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: ownRoom.id, entity: "world-info" } }]);
  frames.length = 0;
  await otherCaller.databank.rename({ id: document.document.id, name: "present" });
  expect(new Set(frames.map((frame) => frame.event.chatId))).toEqual(new Set([hostRoom.id, ownRoom.id]));
  expect(frames).toHaveLength(2);
  expect(frames.every((frame) => frame.seq === null && frame.event.type === "roomEntityChanged" && frame.event.entity === "databank")).toBe(true);
  await otherCaller.invites.selfLeave({ chatId: hostRoom.id });
  frames.length = 0;
  await otherCaller.databank.rename({ id: document.document.id, name: "departed" });
  expect(frames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: ownRoom.id, entity: "databank" } }]);
});

test("a failed regex reach capture is logged and cannot fault the confirmed delete", async ({ db, services, ownerCaller }): Promise<void> => {
  const script = await ownerCaller.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "capture failure", findRegex: "x", replaceString: "y", placement: [] }),
  });
  const room = (await ownerCaller.chat.startChat({ characterIds: [] })).chat;
  await ownerCaller.regex.attachToChat({ chatId: room.id, scriptId: script.id });
  const frames: Parameters<Parameters<typeof subscribeAllChatEvents>[0]>[0][] = [];
  onTestFinished(
    subscribeAllChatEvents((frame) => {
      if (frame.event.type === "roomEntityChanged") {
        frames.push(frame);
      }
    }),
  );
  const failure = new Error("controlled reach driver failure");
  const warn = vi.spyOn(getLog(), "warn");
  const select = vi.spyOn(db, "select").mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(await services.regex.bulkRemoveScripts({ principal: principal(OWNER_USER_ID, { role: "owner", via: "header" }), scriptIds: [script.id] })).toEqual({
      affected: 1,
    });
  } finally {
    select.mockRestore();
  }
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({ err: failure, entity: "regex" }),
    "room-reach: pre-write delete capture failed; the delete proceeds unannounced",
  );
  expect(frames).toEqual([]);
  expect(await db.select().from(regexScripts).where(eq(regexScripts.id, script.id))).toEqual([]);
});

test("a failed document reach is logged without rejecting or rolling back its already-committed rename", async ({
  db,
  services,
  ownerCaller,
}): Promise<void> => {
  const document = await ownerCaller.databank.createFromText({ name: "before", text: "real canon" });
  const failure = new Error("controlled document reach driver failure");
  const warn = vi.spyOn(getLog(), "warn");
  const select = vi.spyOn(db, "select").mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(
      (await services.databank.rename({ principal: principal(OWNER_USER_ID, { role: "owner", via: "header" }), id: document.document.id, name: "committed" }))
        .name,
    ).toBe("committed");
  } finally {
    select.mockRestore();
  }
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({ err: failure, entity: "databank", key: "document" }),
    "room-reach: databank reach lookup failed; the write proceeds unannounced",
  );
  expect((await ownerCaller.databank.get({ id: document.document.id, includeText: true })).name).toBe("committed");
});
