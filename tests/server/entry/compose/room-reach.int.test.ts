// Real composed writes and transport frames prove reach authority, confirmed deletion, and failure isolation.
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { chatDocuments, chatRegexScripts } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import { expect } from "@orb/testkit/node";
import { withheldTable } from "@orb/testkit/node/composed";
import { onTestFinished, vi } from "vitest";
import { test } from "./room-reach.fixtures.ts";

test("bulk regex capture fans only confirmed owned scripts, once per room, and never a host-only library tier", async ({
  services,
  app,
  ownerCaller,
  otherCaller,
  harness,
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
  const frames: Parameters<Parameters<ServicesResult["liveBuses"]["chat"]["subscribeAllChatEvents"]>[0]>[0][] = [];
  onTestFinished(
    app.liveBuses.chat.subscribeAllChatEvents((frame) => {
      if (frame.event.type === "roomEntityChanged") {
        frames.push(frame);
      }
    }),
  );
  expect(await ownerCaller.regex.bulkRemove({ scriptIds: [first.id, second.id, global.id, foreign.id, mintTypeId(ID_PREFIX.regexScript)] })).toEqual({
    affected: 3,
  });
  expect((await services.regex.getScript({ principal: await harness.principalFor((await otherCaller.sessions.me()).userId), scriptId: foreign.id })).id).toBe(
    foreign.id,
  );
  expect(frames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: ownedRoom.id, entity: "regex" } }]);
});

test("global document reach credits a present member rather than only the host, then drops that departed member", async ({
  app,
  ownerCaller,
  otherCaller,
  harness,
}): Promise<void> => {
  const hostRoom = (await ownerCaller.chat.startChat({ characterIds: [] })).chat;
  await ownerCaller.settings.updateAppSettings({ partial: { localMultiUser: true } });
  // Internal callers capture one request's capability; the changed setting governs the next request.
  const hostRequest = await harness.internalCallerFor(harness.ownerId);
  const memberRequest = await harness.internalCallerFor((await otherCaller.sessions.me()).userId);
  const invite = await hostRequest.invites.createInvite({ chatId: hostRoom.id, input: {} });
  await memberRequest.invites.redeemInvite({ token: invite.token });
  const ownRoom = (await otherCaller.chat.startChat({ characterIds: [] })).chat;
  const document = await otherCaller.databank.createFromText({ name: "member globals", text: "shared by a real global attachment" });
  await otherCaller.databank.attachGlobal({ documentId: document.document.id });
  const book = await otherCaller.worldInfo.createBook({ input: { name: "host-only global" } });
  const frames: Parameters<Parameters<ServicesResult["liveBuses"]["chat"]["subscribeAllChatEvents"]>[0]>[0][] = [];
  const bookRefreshed = Promise.withResolvers<void>();
  onTestFinished(
    app.liveBuses.chat.subscribeAllChatEvents((frame) => {
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
  await memberRequest.invites.selfLeave({ chatId: hostRoom.id });
  frames.length = 0;
  await otherCaller.databank.rename({ id: document.document.id, name: "departed" });
  expect(frames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: ownRoom.id, entity: "databank" } }]);
});

test("a failed regex reach capture is logged and cannot fault the confirmed delete", async ({ db, services, ownerCaller, app, harness }): Promise<void> => {
  const script = await ownerCaller.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "capture failure", findRegex: "x", replaceString: "y", placement: [] }),
  });
  const room = (await ownerCaller.chat.startChat({ characterIds: [] })).chat;
  await ownerCaller.regex.attachToChat({ chatId: room.id, scriptId: script.id });
  const control = await ownerCaller.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "successful capture", findRegex: "x", replaceString: "y", placement: [] }),
  });
  await ownerCaller.regex.attachToChat({ chatId: room.id, scriptId: control.id });
  const frames: Parameters<Parameters<ServicesResult["liveBuses"]["chat"]["subscribeAllChatEvents"]>[0]>[0][] = [];
  onTestFinished(
    app.liveBuses.chat.subscribeAllChatEvents((frame) => {
      if (frame.event.type === "roomEntityChanged") {
        frames.push(frame);
      }
    }),
  );
  const callerPrincipal = await harness.principalFor(harness.ownerId);
  expect(await services.regex.bulkRemoveScripts({ principal: callerPrincipal, scriptIds: [control.id] })).toEqual({ affected: 1 });
  expect(frames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: room.id, entity: "regex" } }]);
  frames.length = 0;
  using warn = vi.spyOn(harness.logger, "warn");
  await using withheld = await withheldTable(db, chatRegexScripts);
  try {
    expect(await services.regex.bulkRemoveScripts({ principal: callerPrincipal, scriptIds: [script.id] })).toEqual({
      affected: 1,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ cause: expect.objectContaining({ code: "SQLITE_ERROR" }) }), entity: "regex" }),
      "room-reach: pre-write delete capture failed; the delete proceeds unannounced",
    );
    expect(frames).toEqual([]);
    expect((await services.regex.listScripts({ principal: callerPrincipal })).filter(({ id }) => id === script.id)).toEqual([]);
  } finally {
    await withheld.lift();
  }
  expect((await services.regex.listForChat({ principal: callerPrincipal, chatId: room.id })).filter(({ id }) => id === script.id)).toEqual([]);
});

test("a failed document reach is logged without rejecting or rolling back its already-committed rename", async ({
  db,
  services,
  app,
  ownerCaller,
  harness,
}): Promise<void> => {
  const document = await ownerCaller.databank.createFromText({ name: "before", text: "real canon" });
  const room = (await ownerCaller.chat.startChat({ characterIds: [] })).chat;
  await ownerCaller.databank.attachToChat({ chatId: room.id, documentId: document.document.id });
  const frames: Parameters<Parameters<ServicesResult["liveBuses"]["chat"]["subscribeAllChatEvents"]>[0]>[0][] = [];
  onTestFinished(
    app.liveBuses.chat.subscribeAllChatEvents((frame) => {
      if (frame.event.type === "roomEntityChanged") {
        frames.push(frame);
      }
    }),
  );
  const callerPrincipal = await harness.principalFor(harness.ownerId);
  expect((await services.databank.rename({ principal: callerPrincipal, id: document.document.id, name: "positive" })).name).toBe("positive");
  expect(frames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: room.id, entity: "databank" } }]);
  frames.length = 0;
  using warn = vi.spyOn(harness.logger, "warn");
  await using withheld = await withheldTable(db, chatDocuments);
  try {
    expect((await services.databank.rename({ principal: callerPrincipal, id: document.document.id, name: "committed" })).name).toBe("committed");
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({ cause: expect.objectContaining({ code: "SQLITE_ERROR" }) }),
        entity: "databank",
        key: "document",
      }),
      "room-reach: databank reach lookup failed; the write proceeds unannounced",
    );
    expect(frames).toEqual([]);
  } finally {
    await withheld.lift();
  }
  expect((await ownerCaller.databank.get({ id: document.document.id, includeText: true })).name).toBe("committed");
});
