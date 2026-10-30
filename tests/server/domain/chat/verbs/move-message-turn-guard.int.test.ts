// @subject packages/server/src/domain/chat/verbs/edit.ts
import { TURN_LOCKED_OP_CODE } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import { createChatRoot } from "@orb/testkit/node/composed";
import { textProvider } from "../scenario-physical.ts";

test("moveMessage refuses while a turn is in flight and leaves the order alone, then moves once the turn ends", async () => {
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
  const second = (await chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "second" })).messages[0];
  if (first === undefined || second === undefined) {
    throw new Error("the actual commit door returned no slot");
  }
  const order = async (): Promise<readonly string[]> =>
    (await chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.toSorted((a, b) => a.seq - b.seq).map((message) => message.id);
  expect(await order()).toEqual([first.id, second.id]);

  const turn = chat.send({ principal: h.owner, chatId: h.chatId, content: "third" });
  try {
    await arrived.promise;
    await expect(chat.moveMessage({ principal: h.owner, chatId: h.chatId, messageId: second.id, toSeq: first.seq })).rejects.toMatchObject({
      code: TURN_LOCKED_OP_CODE,
    });
    expect((await order()).slice(0, 2)).toEqual([first.id, second.id]);
  } finally {
    // A failed assertion must not leave the held completion blocking the room's teardown.
    release.resolve();
  }
  await turn;
  await h.root.settleBackground();
  // Positive control: the same move succeeds once nothing is generating.
  await chat.moveMessage({ principal: h.owner, chatId: h.chatId, messageId: second.id, toSeq: first.seq });
  expect((await order()).slice(0, 2)).toEqual([second.id, first.id]);
}, 60_000);
