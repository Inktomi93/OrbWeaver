import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
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
const DRAFT = "Look at this lantern.";
const REFUSALS = [
  { status: 413, reason: "That file is over the upload size limit." },
  { status: 415, reason: "That file's contents are not an image or video." },
] as const;

for (const { status, reason } of REFUSALS) {
  test(`Send shows the server's reason when the attachment upload is refused with ${String(status)}, and keeps the draft`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const room = corpus.reads["chat.getChat"][0]?.output;
    if (room === undefined) {
      throw new Error("The committed corpus omitted a room");
    }
    await seedShellState(page, { activeSection: "chats" });
    await page.route(UPLOAD_ROUTE, (route) => route.fulfill({ status, json: { error: reason } }));
    const rpc = await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...SETTINGS_READS, "rpg.getGame", "rpg.listTurnToolCalls"]),
    });
    const chatId = (await caller.chat.getChat({ chatId: room.id })).id;
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });

    const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
    await input.fill(DRAFT);
    await input.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([1, 2, 3, 4])], "lantern.png", { type: "image/png" }));
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('[data-slot="composer-attachment"]')).toHaveCount(1);

    await page.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();

    await expect(page.getByRole("region", { name: "Alerts" }).getByText(reason, { exact: true })).toBeVisible();
    await expect(input).toHaveValue(DRAFT);
    await expect(page.locator('[data-slot="composer-attachment"]')).toHaveCount(1);
    expect(rpc.count("chat.send")).toBe(0);
  });
}
