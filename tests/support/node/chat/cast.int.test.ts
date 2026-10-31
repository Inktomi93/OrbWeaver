// @subject tests/support/node/chat/cast.ts
import { expect, test } from "../fixtures.ts";
import { addCharacter, addPersona, startRoom, storeAvatar } from "./cast.ts";
import { createChatRoot } from "./composed.ts";

test("the cast builders create what the production verbs read back: an avatar-bearing character and persona, and a room over a roster", async () => {
  await using h = await createChatRoot({ providerFetch: () => Promise.reject(new Error("the cast builders never generate")) });
  const portrait = await storeAvatar(h, h.owner);
  const iris = await addCharacter(h, "iris", portrait);
  const plain = await addCharacter(h, "plain");
  const nyx = await addPersona(h, h.owner, "nyx", { avatar: portrait, description: "nyx walks at night" });
  const chatId = await startRoom(h, [iris, plain]);
  await h.root.services.persona.setActivePersona({ principal: h.owner, chatId, personaId: nyx });

  const { identities } = await h.root.services.chat.getChat({ principal: h.owner, chatId });
  expect(identities).toEqual(
    expect.arrayContaining([
      { kind: "character", id: iris, name: "iris", avatarHash: portrait.hash },
      { kind: "character", id: plain, name: "plain", avatarHash: null },
      { kind: "persona", id: nyx, name: "nyx", description: "nyx walks at night", avatarHash: portrait.hash },
    ]),
  );
});
