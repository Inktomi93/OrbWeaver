// The turn-write and hand-write section is serialized per game, never across games: a write held open in one game
// leaves another game's writes free, while a second write to the held game waits for it. Production entry:
// `createRpgHandWrites` through the rpg domain door, the owner the composition root builds. Layer: server unit
// (a pure in-process ordering owner).
// @subject packages/server/src/domain/rpg/snapshot-edit.ts

import { ID_PREFIX } from "@orb/kit/ids";
import { createRpgHandWrites } from "@orb/server/domain/rpg";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

test("a write held open in one game blocks only that game's next write", async () => {
  const ids = createSeededIds();
  const [held, other] = [ids.typeId(ID_PREFIX.rpgGame), ids.typeId(ID_PREFIX.rpgGame)];
  await using writes = createRpgHandWrites();
  const order: string[] = [];
  const opened = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();

  const first = writes.run(held, async () => {
    opened.resolve();
    await gate.promise;
    order.push("held game, first");
  });
  await opened.promise;
  const queued = writes.run(held, () => {
    order.push("held game, second");
    return Promise.resolve();
  });
  await writes.run(other, () => {
    order.push("other game");
    return Promise.resolve();
  });
  // The other game finished while the held game's first write is still open, and its second has not started.
  expect(order).toEqual(["other game"]);

  gate.resolve();
  await Promise.all([first, queued]);
  expect(order).toEqual(["other game", "held game, first", "held game, second"]);
});
