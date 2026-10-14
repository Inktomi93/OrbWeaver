// @subject packages/server/src/domain/preset/persistence/handoff-copy-write.ts

import { DEFAULT_PROMPT_CONFIG, PROMPT_CONFIG_SCHEMA_VERSION, promptConfigSchema } from "@orb/contracts/preset";
import { chatParticipants, presets, rpgGames } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq, isNull, sql } from "drizzle-orm";
import { handoffActors } from "../../chat/substrate/handoff.fixtures.ts";

for (const corruption of ["future-version", "bad-sections"] as const) {
  test(`the actual GM-preset gift refuses ${corruption} before minting or swapping the room`, async ({ harness }) => {
    const actors = await handoffActors(harness);
    const source = await harness.services.preset.create({ userId: actors.host.userId, name: "Gifted voice", kind: "chat" });
    await harness.services.rpg.createGame({ principal: actors.host, chatId: actors.chat.id, mode: "lite" });
    await harness.services.rpg.updateConfig({ principal: actors.host, chatId: actors.chat.id, gmPresetId: source.id });
    await harness.services.chat.nominateHostHandoff({
      principal: actors.host,
      chatId: actors.chat.id,
      userId: actors.nominee.userId,
      offer: { copyCharacters: false, copyGmPreset: true },
    });
    if (corruption === "future-version") {
      await harness.db
        .update(presets)
        .set({ schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION + 1 })
        .where(eq(presets.id, source.id));
    } else {
      await harness.db
        .update(presets)
        .set({ config: sql`${JSON.stringify({ ...source.config, sections: false })}` })
        .where(eq(presets.id, source.id));
    }
    await expect(harness.services.chat.acceptHostHandoff({ principal: actors.nominee, chatId: actors.chat.id })).rejects.toBeInstanceOf(DomainOperationError);
    expect(await harness.db.select({ id: presets.id }).from(presets).where(eq(presets.ownerId, actors.nominee.userId))).toEqual([]);
    expect(
      await harness.db
        .select({ userId: chatParticipants.userId })
        .from(chatParticipants)
        .where(and(eq(chatParticipants.chatId, actors.chat.id), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq))),
    ).toEqual([{ userId: actors.host.userId }]);
    expect(await harness.db.select({ gmPresetId: rpgGames.gmPresetId }).from(rpgGames).where(eq(rpgGames.chatId, actors.chat.id))).toEqual([
      { gmPresetId: source.id },
    ]);
  });
}

test("the actual valid GM gift preserves authored configuration under the nominee's own new row", async ({ harness }) => {
  const actors = await handoffActors(harness);
  const config = promptConfigSchema.parse({
    ...DEFAULT_PROMPT_CONFIG,
    formatStrings: { ...DEFAULT_PROMPT_CONFIG.formatStrings, responseNudge: "Keep this authored cadence." },
  });
  const source = await harness.services.preset.create({ userId: actors.host.userId, name: "Gifted voice", kind: "chat", config });
  await harness.services.rpg.createGame({ principal: actors.host, chatId: actors.chat.id, mode: "lite" });
  await harness.services.rpg.updateConfig({ principal: actors.host, chatId: actors.chat.id, gmPresetId: source.id });
  await harness.services.chat.nominateHostHandoff({
    principal: actors.host,
    chatId: actors.chat.id,
    userId: actors.nominee.userId,
    offer: { copyCharacters: false, copyGmPreset: true },
  });
  await harness.services.chat.acceptHostHandoff({ principal: actors.nominee, chatId: actors.chat.id });
  const rows = await harness.db
    .select({ id: presets.id, config: presets.config, schemaVersion: presets.schemaVersion })
    .from(presets)
    .where(and(eq(presets.ownerId, actors.nominee.userId), eq(presets.forkedFrom, source.id)));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ config, schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION });
  expect(await harness.db.select({ gmPresetId: rpgGames.gmPresetId }).from(rpgGames).where(eq(rpgGames.chatId, actors.chat.id))).toEqual([
    { gmPresetId: rows[0]?.id },
  ]);
});
