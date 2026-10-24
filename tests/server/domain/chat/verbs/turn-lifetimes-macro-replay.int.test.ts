// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/assembly/assemble.ts
import { expect, test } from "@orb/testkit/node";
import { textRoom } from "../scenario-physical.ts";
import { MOOD_CONFIG } from "./turn-lifetimes-macro-data.ts";

test("a public SEND saves its actual random-pick draw and SWIPE replays it despite changed business entropy", async () => {
  let entropy = 0;
  await using h = await textRoom(["The first complete account.", "The revised complete account."], {
    promptConfig: MOOD_CONFIG,
    group: { output: "per-speaker", policy: "natural", allowSelfResponses: true },
    server: { random: () => entropy },
  });
  const params = { principal: h.owner, chatId: h.chatId };
  const first = await h.root.services.chat.send({ ...params, content: "Begin this scene." });
  expect(first.aborted).toBe(false);
  const reply = first.messages.find(({ role }) => role === "assistant");
  if (reply === undefined) {
    throw new Error("the actual macro SEND produced no assistant slot");
  }
  const before = await h.root.services.chat.getVariantWire({ ...params, variantId: reply.selectedVariantId });
  expect(before.macroDraws).toEqual({ mood: { tone: "grim" } });
  entropy = 0.9;
  const swiped = await h.root.services.chat.swipe({ ...params, messageId: reply.id });
  expect(swiped.aborted).toBe(false);
  const selected = swiped.messages.find(({ role }) => role === "assistant");
  if (selected === undefined) {
    throw new Error("the actual macro SWIPE produced no assistant variant");
  }
  expect(selected.id).toBe(reply.id);
  expect(selected.selectedVariantId).not.toBe(reply.selectedVariantId);
  expect((await h.root.services.chat.getVariantWire({ ...params, variantId: selected.selectedVariantId })).macroDraws).toEqual(before.macroDraws);
  const inputs = await Promise.all(h.requests.filter(({ method }) => method === "POST").map(async (request) => await request.clone().text()));
  expect(inputs).toHaveLength(2);
  expect(inputs.every((body) => body.includes("Scene tone: grim."))).toBe(true);
  expect(inputs.some((body) => body.includes("Scene tone: wry."))).toBe(false);
});
