// @subject packages/ui/src/primitives/option-strip/option-strip.tsx
// The composer's slash strip on a phone: a command signature longer than the row ends in an ellipsis inside the row, never
// cut at the viewport edge, and every offer stays inside the strip's own box.
import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_MESSAGE_INPUT_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const READS = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...ROOM_PROCEDURES, "notifications.presence", "rpg.getGame", "rpg.listTurnToolCalls"] as const;
const PHONE_WIDTHS = [320, 390] as const;

for (const width of PHONE_WIDTHS) {
  test.describe(`${String(width)}px phone`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });

    test("a signature wider than the row is ellipsized inside its row", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const host = await root.internalCallerFor(root.ownerId);
      const room = (await host.chat.listChats({ limit: 1 })).items[0];
      if (room === undefined) {
        throw new Error("The corpus has no room");
      }
      await seedShellState(page, { activeSection: "chats" });
      await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
      await routeTrpc(page, serveCorpusProcedures(host, READS));
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });
      await page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true }).fill("/");
      const strip = page.locator('[data-slot="option-strip"]');
      await expect(strip).toBeVisible();
      const read = await strip.evaluate((listbox) => {
        const edge = listbox.getBoundingClientRect().right;
        return [...listbox.querySelectorAll('[data-slot="option-strip-label"]')].map((label) => ({
          right: label.getBoundingClientRect().right,
          wider: label.getBoundingClientRect().right > edge + 1 || label.scrollWidth > label.clientWidth,
          ellipsis: getComputedStyle(label).textOverflow === "ellipsis",
          edge,
        }));
      });
      await test.info().attach("slash-labels", { body: JSON.stringify(read), contentType: "application/json" });
      // The control: at least one signature is wider than the row, so the checks below judge a real overflow.
      expect(read.some((label) => label.wider)).toBe(true);
      for (const label of read) {
        expect(label.right).toBeLessThanOrEqual(label.edge + 1);
        expect(label.ellipsis).toBe(true);
      }
    });
  });
}
