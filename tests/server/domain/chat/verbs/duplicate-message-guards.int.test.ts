// @subject packages/server/src/domain/chat/verbs/edit.ts
import { TURN_LOCKED_OP_CODE } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import { createChatRoot } from "@orb/testkit/node/composed";
import { textProvider } from "../scenario-physical.ts";

const CONCURRENT_COPIES = 4;

test("duplicateMessage refuses while a turn is in flight and writes nothing, then copies once the turn ends", async () => {
  const provider = textProvider(["The reply."]);
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  // Only the chat completion is held, so the turn stays registered in the room until the test lets it finish.
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
      arrived.resolve();
      await release.promise;
    }
    return await provider(request);
  };
  await using h = await createChatRoot({ memoryEnabled: false, providerFetch });
  const { chat } = h.root.services;
  const first = (await chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "first" })).messages[0];
  if (first === undefined) {
    throw new Error("the actual commit door returned no slot");
  }
  const count = async (): Promise<number> => (await chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.length;
  const before = await count();

  const turn = chat.send({ principal: h.owner, chatId: h.chatId, content: "second" });
  try {
    await arrived.promise;
    const during = await count();
    await expect(chat.duplicateMessage({ principal: h.owner, chatId: h.chatId, messageId: first.id })).rejects.toMatchObject({ code: TURN_LOCKED_OP_CODE });
    expect(await count()).toBe(during);
  } finally {
    // A failed assertion must not leave the held completion blocking the room's teardown.
    release.resolve();
  }
  await turn;
  await h.root.settleBackground();
  const afterTurn = await count();
  expect(afterTurn).toBeGreaterThan(before);
  // Positive control: the same copy succeeds once nothing is generating.
  const copy = await chat.duplicateMessage({ principal: h.owner, chatId: h.chatId, messageId: first.id });
  expect(copy.content).toBe("first");
  expect(await count()).toBe(afterTurn + 1);
}, 60_000);

test("concurrent duplicates of one message each land on their own seq", async () => {
  await using h = await createChatRoot({ memoryEnabled: false, providerFetch: textProvider(["unused"]) });
  const { chat } = h.root.services;
  const first = (await chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "first" })).messages[0];
  if (first === undefined) {
    throw new Error("the actual commit door returned no slot");
  }
  const copies = await Promise.all(
    Array.from({ length: CONCURRENT_COPIES }, () => chat.duplicateMessage({ principal: h.owner, chatId: h.chatId, messageId: first.id })),
  );
  expect(new Set(copies.map((copy) => copy.seq)).size).toBe(CONCURRENT_COPIES);
  const rows = (await chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages;
  expect(rows.filter((row) => row.content === "first")).toHaveLength(CONCURRENT_COPIES + 1);
});
