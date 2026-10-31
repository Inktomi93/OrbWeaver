// WCAG 2.5.3 on the host's rename button: every word the button shows, the date included, is in its accessible name.
import { accessibilityScan } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { ChatHeaderTitleStory } from "./_chat-header-title-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-header-title-stories/ChatHeaderTitleStory";
const LABEL_MISMATCH = "label-content-name-mismatch";

for (const roomName of [null, "Midnight heist"]) {
  test(`the rename button's name carries its whole visible text (room name ${roomName ?? "unset"})`, async ({ mount, page }) => {
    await mount<typeof ChatHeaderTitleStory>(STORY, { canRename: true, roomName });
    const rename = page.getByRole("button", { name: /^Rename chat/u });
    await expect(rename).toBeVisible();
    const shown = await rename.evaluate((element) => [...element.children].map((child) => child.textContent).join(" "));
    // Words only: the name separates the label from its date with a comma where the page shows a dot.
    const words = shown.split(/[^\p{L}\p{N}]+/u).filter((word) => word !== "");
    await expect(rename).toHaveAccessibleName(new RegExp(words.join("\\W+"), "u"));
    const { violations } = await accessibilityScan(page);
    expect(violations.filter((violation) => violation.id === LABEL_MISMATCH)).toEqual([]);
  });
}
