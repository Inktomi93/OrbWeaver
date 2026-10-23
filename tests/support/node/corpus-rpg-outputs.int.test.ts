// @subject tests/support/node/corpus-rpg-outputs.ts
import { assertReferentialIntegrity } from "@orb/db";
import { RPG_OUTPUT_NAME, RPG_OUTPUT_NAME_MAX, RPG_OUTPUT_SECRET, seedCorpusRpgOutputs } from "./corpus-rpg-outputs.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native RPG outputs preserve actor rekeying, disclosed name clamping, deterministic dice and selected-canon reveal", async () => {
  await using root = await createServerHarness({ random: () => 0.25 });
  const result = await seedCorpusRpgOutputs(root);
  expect(result.created).toEqual({ gameId: result.born.id, trackersReadOnly: result.born.trackersReadOnly });
  expect(result.born.chatId).toBe(result.room.chat.id);
  expect(result.born.mode).toBe("lite");
  expect(result.missing).toMatchObject({ ok: false, reason: expect.stringContaining("nothing to promote") });
  expect(result.patched).toEqual({ ok: true });
  const actor = result.beforePromotion.actors.find((entry) => entry.name === RPG_OUTPUT_NAME);
  expect(actor?.actorRef.kind).toBe("npc");
  expect(actor?.volatile?.inventory).toMatchObject([{ name: "Loom shuttle" }]);
  expect(result.promoted).toMatchObject({ ok: true, issues: [expect.stringContaining("shortened")] });
  const foundingCharacterId = result.room.chat.participants.find((seat) => seat.kind === "character")?.characterId;
  const promoted = result.afterPromotion.actors.find((entry) => entry.actorRef.kind === "character" && entry.actorRef.characterId !== foundingCharacterId);
  expect(promoted?.actorRef.kind).toBe("character");
  expect(promoted?.name).toHaveLength(RPG_OUTPUT_NAME_MAX);
  expect(promoted?.name).not.toBe(RPG_OUTPUT_NAME);
  expect(promoted?.identity).toBeNull();
  expect(promoted?.volatile?.inventory).toEqual(actor?.volatile?.inventory);
  expect(result.afterPromotion.actors).not.toContainEqual(actor);
  if (promoted === undefined || promoted.actorRef.kind !== "character") {
    throw new Error("native promotion has no canonical character ref");
  }
  const characterId = promoted.actorRef.characterId;
  expect(result.promotedRoom.participants.some((seat) => seat.characterId === characterId)).toBe(true);
  const caller = await root.internalCallerFor(root.ownerId);
  expect((await caller.character.get({ characterId })).name).toBe(promoted.name);
  expect(result.dismissed).toEqual({ ok: true });
  expect(result.afterDismissal.actors.some((entry) => entry.actorRef.kind === "character" && entry.actorRef.characterId === characterId)).toBe(true);
  expect(result.afterDismissal.actors.find((entry) => entry.actorRef.kind === "character" && entry.actorRef.characterId === characterId)?.volatile).toBeNull();
  expect(result.dice).toEqual({ notation: "2d6+3", rolls: [2, 2], modifier: 3, total: 7, stamp: "[dice: 2d6+3 → 7]" });
  const opening = result.room.opening?.messages[0];
  expect(result.reveal.messages.map((message) => message.messageId)).toEqual([opening?.id]);
  expect(result.reveal.messages[0]?.spans[0]?.fields).toContainEqual({ key: "truth", value: RPG_OUTPUT_SECRET });
  expect(result.reveal.standingLies).toMatchObject([{ character: "Reveal witness", lies: [{ messageId: opening?.id, truth: RPG_OUTPUT_SECRET }] }]);
  expect(result.withheld).toEqual({ messages: [], standingLies: [] });
  expect(result.config.hiddenContentReveal).toBe(false);
  expect(result.config.statProfile).toEqual(result.born.publicConfig.statProfile);
  expect(result.born).not.toHaveProperty("steeringNote");
  expect(result.born.publicConfig).not.toHaveProperty("hiddenContentReveal");
  expect(result.checkpoints).toMatchObject([{ id: result.checkpointId, gameId: result.born.id, label: "Promoted witness", trigger: "manual" }]);
  expect(result.resync).toMatchObject({ ok: false, reason: expect.any(String) });
  expect(result.populate).toMatchObject({ ok: false, reason: expect.any(String) });
  const outsiderRow = await root.actor();
  const outsider = await root.internalCallerFor(outsiderRow.id);
  await expect(outsider.rpg.revealHidden({ chatId: result.born.chatId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await assertReferentialIntegrity(root.db);
});
