// @subject packages/server/src/domain/chat/verbs/turn.ts
// Public stamps and native prompt voices replace private resolver-argument observations.
import { createPersonaSchema } from "@orb/contracts/persona";
import type { PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { inputSystem, personaInputs, personaRoom, seatPersona } from "../persona-cache-physical.ts";

const VOICE_PROBE: PromptSection = { type: "literal", id: "voice", name: "voice", role: "system", enabled: true, content: "PRESET_USER=<{{user}}>" };

test("an explicit owned send persona stamps that human while canon stays anchored and a draft uses the explicit voice", async () => {
  await using h = await personaRoom(["canon", "draft"], {
    promptConfig: { ...DEFAULT_PROMPT_CONFIG, sections: [VOICE_PROBE, ...DEFAULT_PROMPT_CONFIG.sections] },
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
  });
  const anchor = await seatPersona(h, h.owner, "Anchor", "ANCHOR-DESC");
  const override = await h.root.services.persona.create({ principal: h.owner, input: createPersonaSchema.parse({ name: "Vex", description: "VEX-DESC" }) });
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: anchor.id });
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi", personaId: override.id })).aborted).toBe(false);
  const rows = (await readRoomCanon(h.root, h.owner, h.chatId)).filter(({ role }) => role === "user");
  expect(rows).toMatchObject([{ authorUserId: h.owner.userId, personaId: override.id }]);
  let draft = "";
  for await (const { delta } of h.root.services.chat.impersonateStream({ principal: h.owner, chatId: h.chatId, personaId: override.id })) {
    draft += delta;
  }
  expect(draft).toBe("draft");
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(2);
  expect(inputSystem(inputs[0] ?? null)).toContain("PRESET_USER=<Anchor>");
  expect(inputSystem(inputs[1] ?? null)).toContain("PRESET_USER=<Vex>");
});

test("an explicit null send stamp stays null and its draft voice floors without borrowing the active or anchor persona", async () => {
  await using h = await personaRoom(["canon", "draft"], {
    promptConfig: { ...DEFAULT_PROMPT_CONFIG, sections: [VOICE_PROBE, ...DEFAULT_PROMPT_CONFIG.sections] },
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
  });
  const anchor = await seatPersona(h, h.owner, "Anchor", "ANCHOR-DESC");
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: anchor.id });
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi", personaId: null })).aborted).toBe(false);
  const rows = (await readRoomCanon(h.root, h.owner, h.chatId)).filter(({ role }) => role === "user");
  expect(rows).toMatchObject([{ authorUserId: h.owner.userId, personaId: null }]);
  let draft = "";
  for await (const { delta } of h.root.services.chat.impersonateStream({ principal: h.owner, chatId: h.chatId, personaId: null })) {
    draft += delta;
  }
  expect(draft).toBe("draft");
  const inputs = await personaInputs(h);
  expect(inputs).toHaveLength(2);
  expect(inputSystem(inputs[0] ?? null)).toContain("PRESET_USER=<Anchor>");
  expect(inputSystem(inputs[1] ?? null)).toContain(`PRESET_USER=<${DEFAULT_PERSONA_NAME}>`);
  expect(inputSystem(inputs[1] ?? null)).not.toContain("PRESET_USER=<Anchor>");
});
