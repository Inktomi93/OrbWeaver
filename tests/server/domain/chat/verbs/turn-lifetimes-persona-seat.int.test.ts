// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
import { createPersonaSchema } from "@orb/contracts/persona";
import { expect, test } from "@orb/testkit/node";
import { personaInputs, personaRoom, seatPersona } from "../persona-cache-physical.ts";

test("the actual reattribute target follows a swapped active seat and stays null on an empty seat despite its pinned anchor", async () => {
  await using h = await personaRoom([], { group: { output: "per-speaker", policy: "list" } });
  await seatPersona(h, h.owner, "First speaker", "The original voice.");
  const spare = await h.root.services.persona.create({
    principal: h.owner,
    input: createPersonaSchema.parse({ name: "Swapped speaker", description: "The new voice." }),
  });
  const params = { principal: h.owner, chatId: h.chatId };
  await h.root.services.persona.setActivePersona({ ...params, personaId: spare.id });
  const swapped = await h.root.services.chat.commitMessage({ ...params, content: "After the swap." });
  expect(swapped.aborted).toBe(false);
  expect(swapped.messages).toMatchObject([{ personaId: spare.id }]);
  expect((await h.root.services.chat.getChat(params)).viewerActivePersonaId).toBe(spare.id);
  await h.root.services.chat.setChatAnchorPersona({ ...params, personaId: spare.id });
  await h.root.services.persona.setActivePersona({ ...params, personaId: null });
  const bare = await h.root.services.chat.commitMessage({ ...params, content: "No seat persona." });
  expect(bare.aborted).toBe(false);
  expect(bare.messages).toMatchObject([{ personaId: null }]);
  const room = await h.root.services.chat.getChat(params);
  expect(room.viewerActivePersonaId).toBeNull();
  expect(room.anchorPersonaId).toBe(spare.id);
  expect(await personaInputs(h)).toEqual([]);
});
