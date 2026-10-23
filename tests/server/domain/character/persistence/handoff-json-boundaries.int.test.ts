// @subject packages/server/src/domain/character/persistence/handoff-copy-write.ts

import { refinerySignalsSchema } from "@orb/contracts/character";
import { themeOverrideSchema } from "@orb/contracts/theme";
import { assets, characters, chatParticipants, chats } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { HandoffActors } from "../../chat/substrate/handoff.fixtures.ts";
import { handoffActors } from "../../chat/substrate/handoff.fixtures.ts";

async function nominate(harness: ServerTestHarness, actors: HandoffActors): Promise<void> {
  await harness.services.chat.nominateHostHandoff({
    principal: actors.host,
    chatId: actors.chat.id,
    userId: actors.nominee.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
}
for (const field of ["themeOverride", "backgroundOverride"] as const) {
  test(`the actual accepted offer validates every ${field} before any character or avatar is re-owned`, async ({ harness }) => {
    const actors = await handoffActors(harness, true);
    await nominate(harness, actors);
    const second = actors.cards[1];
    if (second === undefined) {
      throw new Error("the real room did not retain its second source card");
    }
    if (field === "themeOverride") {
      await harness.db
        .update(characters)
        .set({ themeOverride: sql`${"false"}` })
        .where(eq(characters.id, second.id));
    } else {
      await harness.db
        .update(characters)
        .set({ backgroundOverride: sql`${"false"}` })
        .where(eq(characters.id, second.id));
    }
    await expect(harness.services.chat.acceptHostHandoff({ principal: actors.nominee, chatId: actors.chat.id })).rejects.toBeInstanceOf(z.ZodError);
    expect(await harness.db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, actors.nominee.userId))).toEqual([]);
    expect(await harness.db.select({ id: assets.id }).from(assets).where(eq(assets.ownerId, actors.nominee.userId))).toEqual([]);
    expect(
      await harness.db
        .select({ userId: chatParticipants.userId })
        .from(chatParticipants)
        .where(and(eq(chatParticipants.chatId, actors.chat.id), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq))),
    ).toEqual([{ userId: actors.host.userId }]);
    expect(await harness.db.select({ pendingHostUserId: chats.pendingHostUserId }).from(chats).where(eq(chats.id, actors.chat.id))).toEqual([
      { pendingHostUserId: actors.nominee.userId },
    ]);
  });
}

test("a non-member admin cannot privately decode the malformed offered source", async ({ harness }) => {
  const actors = await handoffActors(harness);
  await nominate(harness, actors);
  const first = actors.cards[0];
  if (first === undefined) {
    throw new Error("the real room omitted its first card");
  }
  await harness.db
    .update(characters)
    .set({ themeOverride: sql`${"{"}` })
    .where(eq(characters.id, first.id));
  const foreign = await harness.principalFor((await harness.actor({ role: "admin" })).id);
  await expect(harness.services.chat.acceptHostHandoff({ principal: foreign, chatId: actors.chat.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await harness.db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, foreign.userId))).toEqual([]);
});

test("a valid offered card keeps its parsed look and re-owned avatar but never inherits interactive consent or refinery judgement", async ({ harness }) => {
  const actors = await handoffActors(harness, true);
  const first = actors.cards[0];
  if (first === undefined || actors.avatar === null) {
    throw new Error("the actual avatar-bearing source is missing");
  }
  const look = themeOverrideSchema.parse({ accent: "#123456" });
  await harness.db
    .update(characters)
    .set({ themeOverride: look, interactiveHtml: true, refinery: refinerySignalsSchema.parse({ score: 7, analysis: null }) })
    .where(eq(characters.id, first.id));
  await nominate(harness, actors);
  await harness.services.chat.acceptHostHandoff({ principal: actors.nominee, chatId: actors.chat.id });
  const copied = await harness.db
    .select()
    .from(characters)
    .where(and(eq(characters.ownerId, actors.nominee.userId), eq(characters.importedFrom, `handoff:${actors.chat.id}:${first.id}`)));
  expect(copied).toHaveLength(1);
  expect(copied[0]).toMatchObject({ name: first.name, themeOverride: look, interactiveHtml: null, refinery: null });
  expect(copied[0]?.avatarAssetId).not.toBe(actors.avatar.assetId);
  const reowned = await harness.db.select({ id: assets.id, hash: assets.hash }).from(assets).where(eq(assets.ownerId, actors.nominee.userId));
  expect(reowned).toEqual([{ id: copied[0]?.avatarAssetId, hash: actors.avatar.hash }]);
});
