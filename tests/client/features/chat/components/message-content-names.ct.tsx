// A character's reply that frames nothing renders its markup in the main document, through the real transcript
// (`MessageListSurface`) over a corpus room. A name the reply gives an element names nothing of the page: an image named
// after a document method leaves the method in place, so the room still draws, and an id makes no global.
// @subject packages/ui/src/markdown/policy.ts
import { expect, test } from "@orb/testkit/ct-corpus";
import { openCardRoom, serveCardRoom } from "./_card-frame-room.ts";
import type { RoutedCardTextScaleStory } from "./_routed-card-text-scale-stories.tsx";

const STORY = "tests/client/features/chat/components/_routed-card-text-scale-stories/RoutedCardTextScaleStory";
const PROBE_ID = "orbProbe";
const PROBE_TEXT = "The lantern sways in the draught.";
// No panel, style element or style attribute: the reply renders in the main document, not a frame.
const REPLY = [`<img name="createElement" alt="lantern" src="/lantern.png">`, `<span id="${PROBE_ID}">${PROBE_TEXT}</span>`].join("\n\n");

test("a reply that names an element after a document method or a global still draws, and names neither", async ({ corpus, mount, page }) => {
  const room = await openCardRoom(REPLY, "static");
  await using root = room.root;
  await using _routes = await serveCardRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const row = page.locator('[data-slot="message-row"]').filter({ hasText: PROBE_TEXT });
  await expect(row).toBeVisible();
  // Positive control: the reply drew in the main document, its image included, so its names reached the page.
  await expect(row.locator('[data-slot="reply-frame"]')).toHaveCount(0);
  await expect(row.locator("img[alt='lantern']")).toHaveCount(1);
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- reads the property to prove a named image left it in place; the deprecated overload is never called.
  expect(await page.evaluate((id) => [typeof document.createElement, document.getElementById(id) === null, id in globalThis], PROBE_ID)).toEqual([
    "function",
    true,
    false,
  ]);
});
