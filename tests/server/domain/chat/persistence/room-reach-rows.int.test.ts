// Room reach on delete: a raced single regex delete writes both removeScript audit_logs rows but fans no room,
// and a foreign or missing global book leaves the chat_events log byte-for-byte unchanged.

import { createRegexScriptSchema } from "@orb/contracts/regex";
import { auditLogs, chatEvents, regexScripts } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { Fixtures } from "@orb/testkit/node";
import { expect } from "@orb/testkit/node";
import type { HeldDb } from "@orb/testkit/node/composed";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";
import { onTestFinished } from "vitest";
import { test } from "../../../entry/compose/room-reach.fixtures.ts";

const heldDbTest = test.extend<{ heldDb: HeldDb }>({
  heldDb: async ({}, use): Promise<void> => {
    await use(await freshHeldDb());
  },
});

const held = heldDbTest.extend<Pick<Fixtures, "db">>({
  db: async ({ heldDb }, use): Promise<void> => {
    await use(heldDb.db);
  },
});

held(
  "a raced single regex delete preserves its answer but fans no rooms when its owned DELETE removed nothing",
  async ({ heldDb, db, harness, ownerCaller, app }): Promise<void> => {
    const script = await ownerCaller.regex.createScript({
      input: createRegexScriptSchema.parse({ name: "race", findRegex: "x", replaceString: "y", placement: [] }),
    });
    const { chat } = await ownerCaller.chat.startChat({ characterIds: [] });
    await ownerCaller.regex.attachToChat({ chatId: chat.id, scriptId: script.id });
    const frames: Parameters<Parameters<ServicesResult["liveBuses"]["chat"]["subscribeAllChatEvents"]>[0]>[0][] = [];
    onTestFinished(
      app.liveBuses.chat.subscribeAllChatEvents((frame) => {
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
          .where(and(eq(auditLogs.actorUserId, harness.ownerId), eq(auditLogs.entityId, script.id), eq(auditLogs.action, "regex.removeScript"))),
      ).toHaveLength(2);
      expect(frames).toEqual([]);
    } finally {
      gate.release();
      await loser;
    }
  },
);

test("a foreign or missing global book never fans its captured rooms, while an owned delete fans after cascade without a durable event", async ({
  db,
  app,
  ownerCaller,
  otherCaller,
}): Promise<void> => {
  const room = (await otherCaller.chat.startChat({ characterIds: [] })).chat;
  const book = await otherCaller.worldInfo.createBook({ input: { name: "private book" } });
  const frames: Parameters<Parameters<ServicesResult["liveBuses"]["chat"]["subscribeAllChatEvents"]>[0]>[0][] = [];
  const attached = Promise.withResolvers<void>();
  onTestFinished(
    app.liveBuses.chat.subscribeAllChatEvents((frame) => {
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
