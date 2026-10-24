// A global generate_image rule fired by a character import with no room open stores one imagery_generations
// row (chat-less, subject and mode stamped) joined to a generated asset, and writes no chat or message row.
// @subject packages/server/src/domain/automation/engine/dispatch.ts
// @subject packages/server/src/domain/automation/service.ts

import { assets, chats, imageryGenerations, messages } from "@orb/db";
import { expect } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { PORTRAIT_MODEL, portraitTest } from "../engine/dispatch.fixtures.ts";
import { enabledRule } from "../runtime.fixtures.ts";

portraitTest("a global rule fires on its character import with no room open and persists the author's quiet portrait", async ({ portrait }) => {
  const { root, character, physical } = portrait;
  const principal = await root.principalFor(root.ownerId);
  const rule = await enabledRule(root, {
    chatId: null,
    name: "Living library",
    trigger: { bus: "domain", type: "character.updated" },
    predicateCel: "has(event.character) && event.character.contentChanged",
    actions: [{ type: "generate_image", mode: "character_multimodal", n: 1, useAvatarReference: false, reuse: "prefer", quiet: true }],
  });
  await root.services.automation.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: true });
  const generations = await root.db.select().from(imageryGenerations).innerJoin(assets, eq(imageryGenerations.assetId, assets.id));
  expect(generations).toHaveLength(1);
  expect(generations[0]).toMatchObject({
    ["imagery_generations"]: { chatId: null, subjectCharacterId: character.id, mode: "character_multimodal", model: PORTRAIT_MODEL },
    assets: { ownerId: root.ownerId, kind: "generated" },
  });
  expect(physical.requests.filter((request) => request.startsWith("POST "))).toEqual(["POST /v1/chat/completions", "POST /v1/images/generations"]);
  expect(await root.db.select().from(chats)).toEqual([]);
  expect(await root.db.select().from(messages)).toEqual([]);
  expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => [fire.outcome, fire.chatId])).toEqual([["fired", null]]);
});
