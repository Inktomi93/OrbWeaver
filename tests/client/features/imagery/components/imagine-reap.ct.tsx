// The Imagine panel's picture can be a new room's first act: the server claims the room only after the picture is
// made, so leaving the room during the call must not reap it, while leaving an untouched new room still does.
// @subject packages/client/src/features/imagery/hooks/use-imagine-commit.tsx
// @subject packages/client/src/state/active-chat-store.ts

import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { IMAGINE_GENERATE_NAME } from "#client/features/imagery/lib/imagine-names.ts";
import type { ImagineReapStory } from "./_imagine-reap-stories.tsx";

const STORY = "tests/client/features/imagery/components/_imagine-reap-stories/ImagineReapStory";
const PROMPT = "A lantern over a harbour";

test("leaving a new room while its picture is generating does not reap it, and leaving an untouched one does", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [room, other] = (await caller.chat.listChats({})).items;
  if (room === undefined || other === undefined) {
    throw new Error("The committed corpus holds fewer than two owner rooms");
  }
  const generate = holdServed();
  const rpc = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "chat.getChat", "chat.reapHusk"]),
    ...serveCorpusProcedures(caller, ["chat.generateImage"], () => generate),
  });
  await mount<typeof ImagineReapStory>(STORY, { chatId: room.id, otherChatId: other.id, prompt: PROMPT });
  await page.getByRole("button", { name: "Enter the new room", exact: true }).click();

  await page.getByRole("button", { name: IMAGINE_GENERATE_NAME, exact: true }).click();
  await generate.requested;

  await page.getByRole("button", { name: "Go to the landing", exact: true }).click();
  // Control: an untouched new room left after it is reaped, so a reap for the first room would have landed first.
  await page.getByRole("button", { name: "Enter another new room", exact: true }).click();
  await page.getByRole("button", { name: "Go to the landing", exact: true }).click();

  await expect.poll(() => rpc.inputs("chat.reapHusk").some(({ chatId }) => chatId === other.id)).toBe(true);
  expect(rpc.inputs("chat.reapHusk")).toEqual([{ chatId: other.id }]);
  generate.fail();
});
