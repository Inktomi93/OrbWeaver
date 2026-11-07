import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, emulateSoftKeyboard, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const SETTINGS_READS = [
  "chat.getGroupConfig",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "chat.listEffectiveRegex",
  "regex.listForChat",
  "automation.listRules",
] as const;
const VISIBLE_DRAFT_LINES = 4;
const ROOT_FONT_PX = [16, 20] as const;
const LONG_DRAFT = Array.from({ length: 60 }, (_unused, index) => `line ${index}`).join("\n");

for (const rootFontPx of ROOT_FONT_PX) {
  test(`a long draft scrolls after four lines at a ${rootFontPx}px root`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
    const room = corpus.reads["chat.getChat"].find(
      ({ output }) => output.participants.filter((participant) => participant.kind === "character").length === 1,
    )?.output;
    if (room === undefined) {
      throw new Error("Composer case needs the corpus solo room");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...SETTINGS_READS, "rpg.getGame", "rpg.listTurnToolCalls"]),
    });
    const chatId = (await caller.chat.getChat({ chatId: room.id })).id;
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    await page.evaluate((px) => {
      document.documentElement.style.fontSize = `${px}px`;
    }, rootFontPx);
    const input = page.locator('[data-slot="composer-input"]').getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
    await input.fill(LONG_DRAFT);
    const measured = await input.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        height: node.getBoundingClientRect().height,
        line: Number.parseFloat(style.lineHeight),
        chrome:
          Number.parseFloat(style.paddingTop) +
          Number.parseFloat(style.paddingBottom) +
          Number.parseFloat(style.borderTopWidth) +
          Number.parseFloat(style.borderBottomWidth),
        range: node.scrollHeight - node.clientHeight,
      };
    });
    expect(measured.height).toBeCloseTo(VISIBLE_DRAFT_LINES * measured.line + measured.chrome, 0);
    expect(measured.range).toBeGreaterThan(0);
    await input.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect.poll(() => input.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  });
}

// The ceiling is a custom property the stylesheet can lower, so the short-room rule still caps a wrapped field at large text.
const PHONE = { width: 390, height: 844 } as const;
const SIX_LINES = Array.from({ length: 6 }, (_unused, index) => `line ${index}`).join("\n");
const LARGE_TEXT = [
  { label: "portrait 100%", rootPx: 16, viewport: PHONE, keyboard: 340 },
  { label: "portrait 200%", rootPx: 32, viewport: PHONE, keyboard: 340 },
  { label: "portrait 300%", rootPx: 48, viewport: PHONE, keyboard: 340 },
  { label: "narrow portrait 200%", rootPx: 32, viewport: { width: 320, height: 568 }, keyboard: 340 },
  { label: "narrow portrait 300%", rootPx: 48, viewport: { width: 320, height: 568 }, keyboard: 340 },
  { label: "landscape 200%", rootPx: 32, viewport: { width: 844, height: 390 }, keyboard: 190 },
  { label: "small landscape 200%", rootPx: 32, viewport: { width: 568, height: 320 }, keyboard: 160 },
] as const;

for (const text of LARGE_TEXT) {
  test(`a six-line draft keeps Send on screen above the keyboard at ${text.label} text`, async ({ corpus, mount, page }, testInfo) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
    const room = corpus.reads["chat.getChat"].find(
      ({ output }) => output.participants.filter((participant) => participant.kind === "character").length === 1,
    )?.output;
    if (room === undefined) {
      throw new Error("Composer case needs the corpus solo room");
    }
    await page.setViewportSize(text.viewport);
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...SETTINGS_READS, "rpg.getGame", "rpg.listTurnToolCalls"]),
    });
    const chatId = (await caller.chat.getChat({ chatId: room.id })).id;
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    await page.evaluate((px) => {
      document.documentElement.style.fontSize = `${px}px`;
    }, text.rootPx);
    await emulateSoftKeyboard(page, text.keyboard);
    const composer = page.locator('[data-slot="composer-input"]');
    await composer.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true }).fill(SIX_LINES);
    const send = composer.getByRole("button", { name: CHAT_SEND_NAME, exact: true });
    await expect(send).toBeVisible();
    const view = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
    const sendBox = await send.boundingBox();
    if (sendBox === null) {
      throw new Error("Composer boxes did not resolve");
    }
    expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(view);
    const field = composer.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
    const fieldBox = await field.boundingBox();
    const roomBox = await page.locator('[data-slot="chat-room-surface"]').boundingBox();
    expect(fieldBox?.y).toBeGreaterThanOrEqual(roomBox?.y ?? Number.NaN);
    expect((fieldBox?.y ?? Number.NaN) + (fieldBox?.height ?? Number.NaN)).toBeLessThanOrEqual(view);
    expect(sendBox.y).toBeGreaterThanOrEqual(roomBox?.y ?? Number.NaN);
    for (const box of [fieldBox, sendBox]) {
      expect(box?.x).toBeGreaterThanOrEqual(roomBox?.x ?? Number.NaN);
      expect((box?.x ?? Number.NaN) + (box?.width ?? Number.NaN)).toBeLessThanOrEqual((roomBox?.x ?? Number.NaN) + (roomBox?.width ?? Number.NaN));
    }
    await expect(field).toBeFocused();
    for (const control of [field, send]) {
      await expect
        .poll(() =>
          control.evaluate((node) => {
            const box = node.getBoundingClientRect();
            return [box.top + 2, box.bottom - 2].every((y) => node.contains(document.elementFromPoint(box.x + box.width / 2, y)));
          }),
        )
        .toBe(true);
    }
    const screenshot = testInfo.outputPath("composer.png");
    await page.screenshot({ path: screenshot, scale: "css", clip: { x: 0, y: 0, width: text.viewport.width, height: view } });
    await testInfo.attach("keyboard-composer", { path: screenshot, contentType: "image/png" });
    const topbar = page.locator(".shell-topbar");
    await expect(topbar).toBeVisible({ visible: text.rootPx === 16 });
    const edgeCount = await page.locator(".shell-panel-edge").count();
    await expect(page.locator(".shell-panel-edge:visible")).toHaveCount(text.rootPx === 16 ? edgeCount : 0);
    await field.blur();
    await expect(topbar).toBeVisible();
    await expect(page.locator(".shell-panel-edge:visible")).toHaveCount(edgeCount);
    await field.focus();
    await expect(topbar).toBeVisible({ visible: text.rootPx === 16 });
    await emulateSoftKeyboard(page, 0);
    await expect(topbar).toBeVisible();
    await expect(page.locator(".shell-panel-edge:visible")).toHaveCount(edgeCount);
    await expect(field).toHaveValue(SIX_LINES);
  });
}

test.use({ hasTouch: true, isMobile: true });
