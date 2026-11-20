// A choice picked from the Scene tab's echo can be a new room's first line with an empty composer: leaving the
// room while that send is in flight does not reap it. Reads come from a real corpus root whose game is seeded
// through the product's verbs.
// @subject packages/client/src/features/rpg/components/rpg-choice-echo.tsx

import { createCharacterSchema } from "@orb/contracts/character";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { RpgSceneReapStory } from "./_own-key-panels-stories.tsx";

const STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgSceneReapStory";
const CHOICE = "Open the sealed door";
const GREETING = `The corridor ends at a sealed door.\n:::choices\n1. ${CHOICE}\n2. Turn back\n:::`;

test("leaving a new game room while a picked choice is sending does not reap it, and leaving an untouched one does", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const keeper = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "door-keeper", name: "Keeper", description: "A keeper of doors.", greetings: [{ text: GREETING }] }),
  });
  const chatId = (await caller.chat.startChat({ characterIds: [keeper.id], opening: "first-message" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite", ruleset: "d20" });
  await caller.rpg.updateConfig({ chatId, patch: { cyoa: true, cyoaChoiceBehavior: "send" } });
  const otherChatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  const send = holdServed();
  const rpc = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "chat.getChat",
      "chat.listMessages",
      "rpg.getGame",
      "rpg.getTrackerView",
      "rpg.revealHidden",
      "chat.reapHusk",
    ]),
    ...serveCorpusProcedures(caller, ["chat.send"], () => send),
  });
  await mount<typeof RpgSceneReapStory>(STORY, { chatId, otherChatId });
  await page.getByRole("button", { name: "Enter the new room", exact: true }).click();

  await page.getByRole("button", { name: `1. ${CHOICE}`, exact: true }).click();
  await send.requested;
  await page.getByRole("button", { name: "Go to the landing", exact: true }).click();
  // Control: an untouched new room left after it is reaped, so a reap for the game room would have landed first.
  await page.getByRole("button", { name: "Enter another new room", exact: true }).click();
  await page.getByRole("button", { name: "Go to the landing", exact: true }).click();

  await expect.poll(() => rpc.inputs("chat.reapHusk").some((input) => input.chatId === otherChatId)).toBe(true);
  expect(rpc.inputs("chat.reapHusk")).toEqual([{ chatId: otherChatId }]);
  send.fail();
});
