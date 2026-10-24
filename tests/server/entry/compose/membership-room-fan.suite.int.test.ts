// The verbs outside the chat domain that write a membership-class table announce the write on the room's chat
// channel, so a co-member's projection refreshes; the per-person user bus cannot reach them.
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { Fixtures } from "@orb/testkit/node";
import { test as baseTest, expect } from "@orb/testkit/node";
import { onTestFinished } from "vitest";

type ChatFrame = Parameters<Parameters<ServicesResult["liveBuses"]["chat"]["subscribeAllChatEvents"]>[0]>[0];

const test = baseTest.extend<Pick<Fixtures, "env">>({
  env: async ({}, use): Promise<void> => {
    await use({ ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" });
  },
});

test("a host's membership-class writes reach the shared room channel, not only the host's own bus", async ({
  app,
  ownerCaller,
  otherCaller,
  harness,
}): Promise<void> => {
  const room = (await ownerCaller.chat.startChat({ characterIds: [] })).chat;
  await ownerCaller.settings.updateAppSettings({ partial: { localMultiUser: true } });
  // Internal callers capture one request's capability; the changed setting governs the next request.
  const host = await harness.internalCallerFor(harness.ownerId);
  const member = await harness.internalCallerFor((await otherCaller.sessions.me()).userId);
  const invite = await host.invites.createInvite({ chatId: room.id, input: {} });
  await member.invites.redeemInvite({ token: invite.token });
  expect((await otherCaller.chat.getChat({ chatId: room.id })).id).toBe(room.id);

  const script = await host.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "room fan", findRegex: "x", replaceString: "y", placement: [] }),
  });
  const second = await host.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "room fan second", findRegex: "a", replaceString: "b", placement: [] }),
  });
  const book = await host.worldInfo.createBook({ input: { name: "room fan book" } });
  const document = await host.databank.createFromText({ name: "room fan document", text: "shared with the room" });
  await harness.settleBackground();

  const frames: ChatFrame[] = [];
  onTestFinished(app.liveBuses.chat.subscribeAllChatEvents((frame) => frames.push(frame)));
  const roomFrames = async (write: () => Promise<unknown>): Promise<readonly ChatFrame[]> => {
    frames.length = 0;
    await write();
    await harness.settleBackground();
    return frames.filter((frame) => frame.event.chatId === room.id);
  };

  const writes: readonly (readonly [string, () => Promise<unknown>])[] = [
    ["regex.attachToChat", (): Promise<unknown> => host.regex.attachToChat({ chatId: room.id, scriptId: script.id })],
    ["regex.attachToChat second", (): Promise<unknown> => host.regex.attachToChat({ chatId: room.id, scriptId: second.id })],
    [
      "regex.applyScopeOrder",
      (): Promise<unknown> => host.regex.applyScopeOrder({ scope: { kind: "chat", chatId: room.id }, orderedScriptIds: [second.id, script.id] }),
    ],
    ["regex.detachFromChat", (): Promise<unknown> => host.regex.detachFromChat({ chatId: room.id, scriptId: script.id })],
    ["worldInfo.attachToChat", (): Promise<unknown> => host.worldInfo.attachToChat({ chatId: room.id, bookId: book.id })],
    ["worldInfo.detachFromChat", (): Promise<unknown> => host.worldInfo.detachFromChat({ chatId: room.id, bookId: book.id })],
    ["databank.attachToChat", (): Promise<unknown> => host.databank.attachToChat({ chatId: room.id, documentId: document.document.id })],
    ["databank.detachFromChat", (): Promise<unknown> => host.databank.detachFromChat({ chatId: room.id, documentId: document.document.id })],
    [
      "databank.createFromText into the room",
      (): Promise<unknown> =>
        host.databank.createFromText({ name: "room destination", text: "ingested into the room", destination: { kind: "chat", chatId: room.id } }),
    ],
  ];
  const silent: string[] = [];
  for (const [verb, write] of writes) {
    if ((await roomFrames(write)).length === 0) {
      silent.push(verb);
    }
  }
  expect(silent).toEqual([]);
});
