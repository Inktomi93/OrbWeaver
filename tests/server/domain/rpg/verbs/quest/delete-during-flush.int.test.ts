// Deleting a quest while a state-round flush lands keeps the flush's quest: the removal derives from the head
// inside the hand-write section, never from a list read before the flush's write. Production entry:
// `rpg.deleteQuest` and `chat.send` on the composed root; read back through `rpg.getTrackerView`. Layer: server
// integration (a read-then-write race through real persistence, the flush's row write parked at the storage edge).
// @subject packages/server/src/domain/rpg/verbs/quest/delete-quest.ts

import { setImmediate } from "node:timers/promises";
import { finiteReplies } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { cheapRoundRoom, narrative, QUEST_TOOL, round } from "../../round-room.ts";

// Enough event-loop turns for a read the verb issues before it queues its write to finish against in-memory SQLite.
const READ_TURNS = 20;

test("a quest deleted while a flush adds another quest leaves the flush's quest and removes only the deleted one", async () => {
  using held = await freshHeldDb();
  using plan = finiteReplies("delete during a flush", [
    narrative("A stranger offers a new lead."),
    round([{ name: QUEST_TOOL, args: { name: "Follow the stranger", action: "create" } }]),
  ]);
  await using h = await cheapRoundRoom(plan.take, { db: held.db });
  const params = { principal: h.owner, chatId: h.chatId };
  const errand = await h.root.services.rpg.upsertQuest({ ...params, name: "Fetch the water" });
  const kept = await h.root.services.rpg.upsertQuest({ ...params, name: "Mend the fence" });

  // Park the flush's row write inside its per-game section, then delete while it is parked.
  expect(h.root.db).toBe(held.db);
  const parked = held.hold(/^insert into "rpg_snapshots"/i);
  await h.root.services.chat.send({ ...params, content: "Hear the stranger out." });
  await parked.reached;
  const deleting = h.root.services.rpg.deleteQuest({ ...params, questId: errand });
  for (let turn = 0; turn < READ_TURNS; turn += 1) {
    await setImmediate();
  }
  parked.release();
  await deleting;
  await h.root.settleBackground();

  const quests = (await h.root.services.rpg.getTrackerView(params)).quests;
  expect(quests.map((quest) => quest.name).toSorted()).toEqual(["Follow the stranger", "Mend the fence"]);
  expect(quests.map((quest) => quest.id)).toContain(kept);
});
