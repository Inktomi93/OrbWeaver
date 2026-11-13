import { viewImageActionName } from "@orb/client/lib";
import { BLOB_ROUTE } from "@orb/contracts/assets";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { enlargedTextGeometry, PLATFORM_TEXT_SCALES, seedShellState, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nameShape } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { VARIANT_GENERATE_NAME, VARIANT_NEXT_NAME, VARIANT_PREV_NAME } from "#client/features/chat/lib/message-action-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROLES = ["user", "assistant"] as const;
const ART_FOCUS_LEAK = "data-art-focus-leak";
const IMAGE_ACTION = nameShape(viewImageActionName);
let root: Awaited<ReturnType<typeof createCorpusHarness>>;
let chatId: ChatId;
let messageIds: Record<(typeof ROLES)[number], MessageId>;

test.use({ hasTouch: true });

test.beforeAll(async () => {
  root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const pictured = (await caller.character.list({ limit: 100 })).items.find((character) => character.avatarHash !== null && character.avatarAssetId !== null);
  if (pictured === undefined) {
    throw new Error("Corpus needs an owned pictured character");
  }
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: room.id, limit: 6 });
    const user = messages.find((message) => message.role === "user" && message.personaId !== null);
    const assistant = messages.find((message) => message.role === "assistant" && message.characterId !== null && message.kind === "standard");
    if (user === undefined || user.personaId === null || assistant === undefined || assistant.characterId === null) {
      continue;
    }
    await caller.persona.update({ personaId: user.personaId, input: { avatarAssetId: pictured.avatarAssetId } });
    await caller.character.update({ characterId: assistant.characterId, input: { avatarAssetId: pictured.avatarAssetId } });
    chatId = room.id;
    messageIds = { user: user.id, assistant: assistant.id };
    return;
  }
  throw new Error("Corpus needs a room with pictured persona and character messages");
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

async function expectFailedArt(page: Page, style: "echo" | "whisper"): Promise<void> {
  for (const role of ROLES) {
    const row = page.locator(`[data-slot="message-row"][data-message-id="${messageIds[role]}"]`);
    await row.scrollIntoViewIfNeeded();
    const art = row.locator(style === "echo" ? '[data-slot="message-echo-art"]' : '[data-slot="message-band"]');
    await expect(art.locator('[data-voice="monogram"]')).toBeVisible();
    await expect(row.getByRole("button", { name: IMAGE_ACTION })).toHaveCount(0);
    await expect(row.locator('[data-slot="message-bubble"]')).toBeVisible();
  }
}

async function tapVisibleArt(art: Locator, touchTarget: Locator): Promise<void> {
  await art.scrollIntoViewIfNeeded();
  const bounds = await art.boundingBox();
  if (bounds === null) {
    throw new Error("The speaker art has no rendered box");
  }
  await expect(touchTarget).toHaveCount(1);
  const point = { x: bounds.width / 2, y: Math.min(bounds.height / 4, 20) };
  await expect
    .poll(() =>
      touchTarget.evaluate((element, position) => {
        const rect = element.getBoundingClientRect();
        const hit = element.ownerDocument.elementFromPoint(rect.x + position.x, rect.y + position.y);
        return hit !== null && element.contains(hit);
      }, point),
    )
    .toBe(true);
  await touchTarget.evaluate((element, attribute) => {
    element.addEventListener(
      "focus",
      () => {
        if (element.getAttribute("aria-hidden") === "true") {
          element.setAttribute(attribute, "true");
        }
      },
      { once: true },
    );
  }, ART_FOCUS_LEAK);
  await touchTarget.tap({ position: point });
  await expect(touchTarget).not.toHaveAttribute(ART_FOCUS_LEAK, "true");
}

function registerCase(style: "echo" | "whisper" | "ripple", width: number): void {
  test(`${style} at ${width}: each speaker has one accessible image control and art returns focus to it`, async ({ corpus, corpusMedia, mount, page }) => {
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    await caller.settings.updateUserSettingsSection({
      section: "appearance",
      patch: { chatStyle: style, showInChatAvatars: true, backgroundImageKind: "none" },
    });
    await page.setViewportSize({ width, height: 900 });
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
    });
    await corpusMedia();
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    for (const role of ROLES) {
      const row = page.locator(`[data-slot="message-row"][data-message-id="${messageIds[role]}"]`);
      await row.scrollIntoViewIfNeeded();
      const opener = row.getByRole("button", { name: IMAGE_ACTION });
      await expect(opener).toHaveCount(1);
      await opener.focus();
      await opener.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("button", { name: DIALOG_VERBS.close, exact: true })).toBeFocused();
      await expect.poll(() => dialog.getByRole("img").evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      const art = style === "ripple" ? opener : row.locator(style === "echo" ? '[data-slot="message-echo-art"]' : '[data-slot="message-band"]');
      await tapVisibleArt(art, style === "ripple" ? opener : row.locator('button[aria-hidden="true"]'));
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(opener).not.toHaveAttribute("aria-hidden", "true");
    }
    if (style !== "ripple") {
      await page.route(
        (url) => url.pathname.startsWith(`${BLOB_ROUTE}/`) && (url.searchParams.get("v") === "portrait" || url.searchParams.get("v") === "banner"),
        (route) => route.fulfill({ status: 404, body: "" }),
      );
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      await expectFailedArt(page, style);
    }
  });
}

for (const style of ["echo", "whisper", "ripple"] as const satisfies readonly ThemeChatStyle[]) {
  for (const width of [390, 1440]) {
    registerCase(style, width);
  }
}

// Echo's tile and its swipe foot declare one overlay together: the tile's unnamed pointer sheet under a foot chevron. A header or
// content control over the tile is no part of it.
const ECHO_DECLARED = new RegExp(
  `^button "" \\[.*\\] overlaps button "(?:${[VARIANT_PREV_NAME, VARIANT_NEXT_NAME, VARIANT_GENERATE_NAME].join("|")})" \\[.*\\], declared message-controls-over-art$`,
  "u",
);

function registerEchoGeometryCase(width: number, scale: number): void {
  test(`echo at ${width} and ${scale}x text: no message row control lies over another, and only the art and its foot are declared`, async ({
    browserName,
    corpus,
    corpusMedia,
    mount,
    page,
  }) => {
    test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    await caller.settings.updateUserSettingsSection({
      section: "appearance",
      patch: { chatStyle: "echo", showInChatAvatars: true, backgroundImageKind: "none" },
    });
    await page.setViewportSize({ width, height: 900 });
    await using _textSize = await setPlatformTextSize(page, scale);
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
    });
    await corpusMedia();
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    const rows = page.locator('[data-slot="message-row"]').filter({ has: page.locator('[data-slot="message-echo-art"]') });
    // The control for the clean read: the pictured rows render their tile.
    await expect(rows.first()).toBeVisible();
    for (const row of await rows.all()) {
      await row.scrollIntoViewIfNeeded();
      const geometry = await enlargedTextGeometry(row);
      expect(geometry.findings.filter((finding) => finding.includes(" overlaps "))).toEqual([]);
      expect(geometry.declaredOverlays.filter((pair) => !ECHO_DECLARED.test(pair))).toEqual([]);
    }
  });
}

for (const width of [390, 1440]) {
  for (const scale of PLATFORM_TEXT_SCALES.slice(1)) {
    registerEchoGeometryCase(width, scale);
  }
}
