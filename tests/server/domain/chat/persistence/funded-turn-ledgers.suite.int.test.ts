// Host-funded member turns write no chat_generation_observations row for the room: member-started automatic
// beats and the turns either side of a two-party host handoff.
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { chatGenerationObservations } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { memberAutoBeats, twoPartyHandoff } from "../verbs/turn-funding.fixtures.ts";

async function observations(h: ChatRoot): Promise<(typeof chatGenerationObservations.$inferSelect)[]> {
  return await h.root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, h.chatId));
}

test("member-started automatic beats write no generation observation row", async () => {
  await using beats = await memberAutoBeats();
  expect(beats.outcome.aborted).toBe(false);
  expect(await observations(beats.room.h)).toEqual([]);
});

test("the turns either side of a two-party host handoff write no generation observation row", async () => {
  await using handoff = await twoPartyHandoff();
  expect([handoff.before.aborted, handoff.after.aborted]).toEqual([false, false]);
  expect(await observations(handoff.room.h)).toEqual([]);
});
