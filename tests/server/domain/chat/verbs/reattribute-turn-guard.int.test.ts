// @subject packages/server/src/domain/chat/verbs/edit.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { TURN_LOCKED_OP_CODE } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import { createChatRoot } from "@orb/testkit/node/composed";
import { textProvider } from "../scenario-physical.ts";

const ADA = createCharacterSchema.parse({ handle: "rturn-ada", name: "Ada Vane", description: "The first voice." });
const BEX = createCharacterSchema.parse({ handle: "rturn-bex", name: "Bex Orrin", description: "The second voice." });

test("reattributeMessages refuses while a turn is in flight and leaves the voice alone, then re-voices once the turn ends", async () => {
  using provider = textProvider(["The reply.", "The reply."]);
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  // Only the chat completion is held, so the turn stays registered in the room until the test lets it finish.
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
      arrived.resolve();
      await release.promise;
    }
    return await provider.execute(request);
  };
  await using h = await createChatRoot({
    memoryEnabled: false,
    providerFetch,
    characters: [ADA, BEX],
    transcript: [
      { role: "user", content: "the opening line" },
      { role: "assistant", speakerHandle: ADA.handle, content: "an ada reply" },
    ],
  });
  const [ada, bex] = h.characters;
  const reply = (await h.caller.chat.listMessages({ chatId: h.chatId })).messages.find((row) => row.role === "assistant");
  if (ada === undefined || bex === undefined || reply === undefined) {
    throw new Error("the imported room lost its cast or its canon");
  }
  const voice = async (): Promise<unknown> => (await h.caller.chat.listMessages({ chatId: h.chatId })).messages.find((row) => row.id === reply.id)?.characterId;

  const turn = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "next" });
  try {
    await arrived.promise;
    await expect(
      h.root.services.chat.reattributeMessages({ principal: h.owner, chatId: h.chatId, messageIds: [reply.id], characterId: bex.id }),
    ).rejects.toMatchObject({
      code: TURN_LOCKED_OP_CODE,
    });
    expect(await voice()).toBe(ada.id);
  } finally {
    // A failed assertion must not leave the held completion blocking the room's teardown.
    release.resolve();
  }
  await turn;
  await h.root.settleBackground();
  // Positive control: the same re-voice succeeds once nothing is generating.
  await h.root.services.chat.reattributeMessages({ principal: h.owner, chatId: h.chatId, messageIds: [reply.id], characterId: bex.id });
  expect(await voice()).toBe(bex.id);
}, 60_000);
