// A folder import whose chats land in stages leaves the owner's stats equal to a rebuild over what landed.
// @subject packages/server/src/domain/import/workload-contributions.ts
// @subject packages/server/src/domain/chat/persistence/import-write.ts
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import { admit, cardPng, chatOf, finishRun, harness, settings } from "./_st-tree-door.ts";

const SENT = "2025-07-18@12h00m01s";
// Several landing stages, so the room the run counts was written by more than one batch.
const LONG_CHAT_MESSAGES = 2001;

function longChat(): string {
  const lines = ['{"user_name":"Bob","character_name":"Aria","create_date":"2025-07-18@12h00m00s"}'];
  for (let turn = 0; turn < LONG_CHAT_MESSAGES; turn += 1) {
    lines.push(JSON.stringify({ name: turn % 2 === 0 ? "Bob" : "Aria", ["is_user"]: turn % 2 === 0, mes: `line ${String(turn)}`, ["send_date"]: SENT }));
  }
  return lines.join("\n");
}

test("the stats a folder import leaves equal a rebuild over the rooms it landed", async () => {
  await using root = await harness();
  const id = await admit(root, {
    [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }),
    "characters/Aria.png": cardPng(root, "Aria"),
    "chats/Aria/long.jsonl": longChat(),
    "chats/Aria/short.jsonl": chatOf("Aria greets you."),
  });
  await finishRun(root, id);

  const afterRun = await root.services.stats.overview(root.ownerId);
  await root.services.stats.reconcile(root.ownerId);
  const rebuilt = await root.services.stats.overview(root.ownerId);

  // The control: the run's stats count both rooms and every imported turn, so the equality is not two empty reads.
  expect(afterRun).toMatchObject({ chats: 2 });
  expect((afterRun?.userTurns ?? 0) + (afterRun?.assistantTurns ?? 0)).toBe(LONG_CHAT_MESSAGES + 1);
  expect(rebuilt).toEqual(afterRun);
});
