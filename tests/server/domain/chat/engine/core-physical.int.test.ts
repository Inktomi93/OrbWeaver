// A scripted reply is a claim that a request happened, so the room's own disposal judges every reply it was handed.
import { expect, test } from "@orb/testkit/node";
import { coreHttpRoom, coreProse } from "./core-physical.ts";

test("a room refuses disposal when a planned reply was never requested, after its root has closed", async () => {
  const opened = Promise.withResolvers<Awaited<ReturnType<typeof coreHttpRoom>>>();
  const spendOne = async (): Promise<void> => {
    await using room = await coreHttpRoom([(): Response => coreProse("Spent."), (): Response => coreProse("Never asked for.")]);
    opened.resolve(room);
    expect((await room.root.services.chat.generate({ principal: room.owner, chatId: room.chatId })).aborted).toBe(false);
  };
  await expect(spendOne()).rejects.toThrow("the core HTTP reply plan left 1 of 2 replies unused");
  const h = await opened.promise;
  await expect(h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).rejects.toMatchObject({ cause: { code: "CLIENT_CLOSED" } });
});

test("a room whose plan is spent disposes quietly", async () => {
  await using h = await coreHttpRoom([(): Response => coreProse("Spent.")]);
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).aborted).toBe(false);
});
