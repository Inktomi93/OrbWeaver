// Storage is the subject: a snapshot row whose actor plane still spells an actor with the retired `cast` arm is
// refused on read with a typed corrupt-state error, so the host is told the game cannot be read instead of
// silently losing the actor. The same game reads again once the row is valid.
// @subject packages/server/src/domain/rpg/persistence/snapshots.ts

import { rpgSnapshots } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { seedRecallRoom, seedRpgGame } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";

const STALE_ACTOR_STATE = [
  {
    actorRef: { kind: "cast", castKey: "sister-vesna" },
    identity: { name: "Sister Vesna", emoji: "", mood: "", appearance: "", outfit: "", thoughts: "", relationship: { kind: "neutral", label: "" } },
    volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "wary" },
  },
];

test("a snapshot actor row under the retired cast spelling fails the whole read loudly and names its column", async ({ harness, db }) => {
  const host = await harness.principalFor(harness.ownerId);
  const chatId = await seedRecallRoom(await harness.internalCallerFor(host.userId));
  await seedRpgGame(harness, { principal: host, chatId, mode: "lite" });
  await harness.services.rpg.editSnapshot({ principal: host, chatId, patch: { location: "the undercroft" } });
  const before = await harness.services.rpg.getTrackerView({ principal: host, chatId });
  expect(before.ambient?.location).toBe("the undercroft");

  await db.update(rpgSnapshots).set({ actorState: sql`${JSON.stringify(STALE_ACTOR_STATE)}` });

  await expect(harness.services.rpg.getTrackerView({ principal: host, chatId })).rejects.toMatchObject({
    code: "rpg_state_corrupt",
    message: expect.stringContaining("actorState"),
  });

  await db.update(rpgSnapshots).set({ actorState: sql`${JSON.stringify([])}` });
  expect((await harness.services.rpg.getTrackerView({ principal: host, chatId })).ambient?.location).toBe("the undercroft");
});
