// @subject packages/client/src/features/chat/components/room-overrides-form.tsx
// @subject packages/client/src/features/chat/components/injections-manager.tsx
// @subject packages/client/src/features/chat/components/reasoning-block.tsx
// A disclosure trigger that holds a row (a field name and its state word, an injection's label and its summary, a reasoning label) keeps that row inside
// the trigger and the trigger inside the screen at every browser text size on a phone, so the pane never scrolls sideways.
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { CHAT_ADD_INJECTION_NAME, CHAT_INJECTIONS_SECTION_LABEL } from "#client/features/chat/lib/chat-settings-names.ts";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";
import type { StreamingReplyStory } from "./_ghost-macro-stories.tsx";
import { GHOST_ROOM_PROCEDURES, soloRoom } from "./ghost-room.fixtures.ts";
import { hostedRoom } from "./hosted-room.fixtures.ts";

const TAB_STORY = "tests/client/features/chat/components/_chat-forks-stories/ChatContextTabStory";
const REPLY_STORY = "tests/client/features/chat/components/_ghost-macro-stories/StreamingReplyStory";
const PHONE = { width: 390, height: 844 } as const;
const TRIGGER = '[data-slot="collapsible-trigger"]';
const TAB_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listForks",
  "chat.listChatInjections",
  "chat.setChatInjection",
  "chat.deleteChatInjection",
  "chat.setRoomOverrides",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
] as const;

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

/** Each trigger's name with how far its content ends past the trigger's inline end edge, and how far the trigger ends past the screen's. */
async function triggerReach(triggers: Locator): Promise<{ readonly name: string; readonly content: number; readonly screen: number }[]> {
  return await triggers.evaluateAll((nodes) =>
    nodes.map((trigger) => {
      const edge = trigger.getBoundingClientRect().right;
      const content = Math.max(0, ...[...trigger.querySelectorAll("*")].map((part) => part.getBoundingClientRect().right - edge));
      return {
        name: (trigger.getAttribute("aria-label") ?? trigger.textContent).trim().slice(0, 40),
        content,
        screen: Math.max(0, edge - innerWidth),
      };
    }),
  );
}

for (const scale of PLATFORM_TEXT_SCALES) {
  test.describe(`at ${String(scale * 100)}% text`, () => {
    test("the room override and injection triggers hold their rows", async ({ browserName, mount, page }) => {
      test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
      await using _textSize = await setPlatformTextSize(page, scale);
      await using root = await createCorpusHarness();
      const { chatId } = await hostedRoom(root, page, TAB_PROCEDURES);
      await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId, width: PHONE.width });
      await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_INJECTIONS_SECTION_LABEL)}`, "u") }).click();
      await page.getByRole("button", { name: CHAT_ADD_INJECTION_NAME, exact: true }).click();
      // A just-added row has no content, so its trigger carries the badge that says it is not delivered.
      const triggers = page.getByRole("group", { name: "Chat context host", exact: true }).locator(TRIGGER);
      const notDelivered = page.getByText("Not delivered: no content", { exact: true });
      await expect(notDelivered).toBeVisible();
      const reach = await triggerReach(triggers);
      // The control: the override rows and the injection row are among the triggers judged.
      expect(reach.length).toBeGreaterThan(3);
      for (const trigger of reach) {
        expect(trigger.content, trigger.name).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
        expect(trigger.screen, trigger.name).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      }
    });

    test("a live reply's reasoning trigger holds its label", async ({ browserName, corpusMedia, mount, page }) => {
      test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
      await using _textSize = await setPlatformTextSize(page, scale);
      await using root = await createCorpusHarness();
      const { chatId, characterId } = await soloRoom(root);
      const owner = await root.internalCallerFor(root.ownerId);
      await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
      await routeTrpc(page, serveCorpusProcedures(owner, GHOST_ROOM_PROCEDURES));
      await corpusMedia();
      await mount<typeof StreamingReplyStory>(REPLY_STORY, {
        chatId,
        speakerCharacterId: characterId,
        streamedText: "I should weigh what she said before answering.",
        streamLabel: "Stream a reply",
        kind: "reasoning",
        hostWidth: PHONE.width,
      });
      await page.getByRole("button", { name: "Stream a reply", exact: true }).click();
      const trigger = page.getByRole("button", { name: /^Thinking/u });
      await expect(trigger).toBeVisible();
      const [reach] = await triggerReach(trigger);
      expect(reach?.content ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      expect(reach?.screen ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    });
  });
}
