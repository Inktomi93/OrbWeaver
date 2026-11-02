// The hand's clears keep the rest: a null attribute removes only that attribute from the sheet, and releasing a lock
// removes only that path's lock from the snapshot.
// @subject packages/server/src/domain/rpg/verbs/patch-sheet.ts
// @subject packages/server/src/domain/rpg/snapshot-edit.ts

import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCorpusActors, seedRecallRoom, seedRpgGame } from "@orb/testkit/node/composed";

async function liteGame(): Promise<{
  readonly root: Awaited<ReturnType<typeof createServerHarness>>;
  readonly owner: Awaited<ReturnType<typeof seedCorpusActors>>["owner"];
  readonly chatId: Awaited<ReturnType<typeof seedRecallRoom>>;
}> {
  const root = await createServerHarness({ random: () => 0.5 });
  const { owner } = await seedCorpusActors(root);
  const chatId = await seedRecallRoom(await root.internalCallerFor(owner.userId));
  await seedRpgGame(root, { principal: owner, chatId, mode: "lite", ruleset: "d20" });
  return { root, owner, chatId };
}

test("a null attribute in a sheet patch clears that attribute and keeps the others", async () => {
  const { root, owner, chatId } = await liteGame();
  await using _root = root;
  const [first, second] = (await root.services.rpg.getConfigView({ principal: owner, chatId })).statProfile.attributes;
  if (first === undefined || second === undefined) {
    throw new Error("the born game profile has fewer than two attributes");
  }
  const sheet = { principal: owner, chatId, actorRef: { kind: "user", userId: owner.userId } } as const;
  const attributesOf = async (): Promise<Readonly<Record<string, number>> | undefined> =>
    (await root.services.rpg.getTrackerView({ principal: owner, chatId })).actors[0]?.sheet.attributes;

  await root.services.rpg.patchSheet({ ...sheet, patch: { attributes: { [first.key]: 14, [second.key]: 9 } } });
  expect(await attributesOf()).toMatchObject({ [first.key]: 14, [second.key]: 9 });

  await root.services.rpg.patchSheet({ ...sheet, patch: { attributes: { [first.key]: null } } });
  const after = await attributesOf();
  expect(after).not.toHaveProperty(first.key);
  expect(after).toMatchObject({ [second.key]: 9 });
});

test("releasing one lock drops that path and keeps the other pinned paths", async () => {
  const { root, owner, chatId } = await liteGame();
  await using _root = root;
  const locked = async (): Promise<readonly string[]> => (await root.services.rpg.getTrackerView({ principal: owner, chatId })).lockedPaths;

  await root.services.rpg.editSnapshot({ principal: owner, chatId, patch: { location: "the gate", calendarDate: "Spring 3" } });
  expect((await locked()).toSorted()).toEqual(["calendarDate", "location"]);

  await root.services.rpg.editSnapshot({ principal: owner, chatId, patch: {}, releaseLocks: ["location"] });
  const after = await locked();
  expect(after).not.toContain("location");
  expect(after).toContain("calendarDate");
});
