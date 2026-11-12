// Leaving a room this device just created reaps it, but not while a send into it is still in flight: the server
// claims the room only just before the user row, so a reap then would delete the room under the send.
// @subject packages/client/src/state/active-chat-store.ts
// @subject packages/client/src/features/chat/hooks/use-send-message.ts

import type { StoredAsset } from "@orb/contracts/assets";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, holdServed, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { HuskReapSendStory } from "./_husk-reap-send-stories.tsx";

const STORY = "tests/client/features/chat/components/_husk-reap-send-stories/HuskReapSendStory";
const UPLOAD_ROUTE = "**/api/assets/upload";
const SETTINGS_READS = [
  "chat.getGroupConfig",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "chat.listEffectiveRegex",
  "regex.listForChat",
  "automation.listRules",
] as const;

test("leaving a new room while an attachment-only send is in flight does not reap it, and leaving an untouched one does", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [room, other] = (await caller.chat.listChats({})).items;
  if (room === undefined || other === undefined) {
    throw new Error("The committed corpus holds fewer than two owner rooms");
  }
  const stored = { assetId: mintTypeId(ID_PREFIX.asset, createSeededIds().next), hash: "ab".repeat(32), created: true } satisfies StoredAsset;
  await page.route(UPLOAD_ROUTE, (route) => route.fulfill({ json: stored }));
  const send = holdServed();
  await seedShellState(page, { activeSection: "chats" });
  const rpc = await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    // The corpus rooms are claimed, so the served reap is the server's own no-op; the case reads what the client asked.
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...SETTINGS_READS, "rpg.getGame", "rpg.listTurnToolCalls", "chat.reapHusk"]),
    ...serveCorpusProcedures(caller, ["chat.send"], () => send),
  });
  await mount<typeof HuskReapSendStory>(STORY, { chatId: room.id, otherChatId: other.id });
  await page.getByRole("button", { name: "Enter the new room", exact: true }).click();

  const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  await input.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([1, 2, 3, 4])], "lantern.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('[data-slot="composer-attachment"]')).toHaveCount(1);
  await page.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
  await send.requested;
  await expect(input).toHaveValue("");

  await page.getByRole("button", { name: "Go to the landing", exact: true }).click();
  // Control: an untouched new room left after it is reaped, so a reap for the first room would have landed first.
  await page.getByRole("button", { name: "Enter another new room", exact: true }).click();
  await page.getByRole("button", { name: "Go to the landing", exact: true }).click();

  await expect.poll(() => rpc.inputs("chat.reapHusk").some(({ chatId }) => chatId === other.id)).toBe(true);
  expect(rpc.inputs("chat.reapHusk")).toEqual([{ chatId: other.id }]);
  send.fail();
});
