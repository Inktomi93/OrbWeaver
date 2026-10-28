import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { actionGroupGeometry, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const STYLES = ["document", "flat", "bubble"] as const satisfies readonly ThemeChatStyle[];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;
const PARAGRAPHS = 40;
const MENU_TRIGGER = 'button[aria-haspopup="menu"]';
const CONTENT = Array.from(
  { length: PARAGRAPHS },
  (_, index) =>
    `Reading witness ${index + 1}. The lantern lit every word of the northern expedition's account while rain tapped against the observatory windows.`,
).join("\n\n");

async function prepareReadingRows(caller: Caller): Promise<{ chatId: ChatId; messageIds: readonly MessageId[] }> {
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    const chat = await caller.chat.getChat({ chatId: room.id });
    const { messages } = await caller.chat.listMessages({ chatId: room.id, limit: 6 });
    const reply = messages.filter((message) => message.role === "assistant").at(-2);
    const tail = messages.at(-1);
    const user = messages.find((message) => message.role === "user");
    if (
      tail?.role === "assistant" &&
      user !== undefined &&
      chat.viewerIsHost &&
      reply?.role === "assistant" &&
      reply.characterId !== null &&
      !reply.excludedFromPrompt
    ) {
      await caller.chat.editMessage({ chatId: room.id, messageId: reply.id, content: CONTENT, timeZone: UTC_TIME_ZONE });
      await caller.chat.editMessage({ chatId: room.id, messageId: user.id, content: CONTENT, timeZone: UTC_TIME_ZONE });
      await caller.chat.editMessage({ chatId: room.id, messageId: tail.id, content: CONTENT, timeZone: UTC_TIME_ZONE });
      return { chatId: room.id, messageIds: [user.id, reply.id] };
    }
  }
  throw new Error("The corpus has no hosted room ending in a character reply");
}

async function backgroundAlpha(target: Locator): Promise<number> {
  return await target.evaluate((node) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("The browser cannot resolve the header's painted alpha");
    }
    context.fillStyle = getComputedStyle(node).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const alpha = context.getImageData(0, 0, 1, 1).data[3];
    if (alpha === undefined) {
      throw new Error("The browser returned no painted alpha sample");
    }
    return alpha;
  });
}

async function expectDocumentRest(row: Locator): Promise<void> {
  const header = row.locator('[data-slot="message-name-row"]');
  const prose = row
    .locator("p")
    .filter({ hasText: /^Reading witness /u })
    .first();
  const [chip, reading, page, column] = await Promise.all([
    header.boundingBox(),
    prose.boundingBox(),
    row.locator('[data-slot="message-bubble"]').boundingBox(),
    row.locator('[data-slot="message-content-column"]').boundingBox(),
  ]);
  if (chip === null || reading === null || page === null || column === null) {
    throw new Error("Document's at-rest page and trailing actions need rendered bounds");
  }
  expect(chip.width).toBeLessThan(reading.width);
  expect(chip.x).toBeGreaterThan(reading.x);
  expect(Math.abs(page.width - column.width)).toBeLessThanOrEqual(1);
  expect(await backgroundAlpha(row.locator('[data-slot="message-bubble"]'))).toBe(0);
}

async function expectNamedRest(row: Locator): Promise<void> {
  await expect(row.locator('[data-slot="message-attribution"]')).toBeVisible();
}

async function expectQuietDocumentBand(row: Locator): Promise<void> {
  const header = row.locator('[data-slot="message-name-row"]');
  const menu = header.locator(MENU_TRIGGER);
  const height = await row.evaluate((node) => node.getBoundingClientRect().height);
  await menu.evaluate((node: HTMLButtonElement) => node.blur());
  await row.page().mouse.move(0, 0);
  await expect(header).toHaveCSS("opacity", "0");
  await menu.focus();
  await expect(header).toHaveCSS("opacity", "1");
  expect(await row.evaluate((node) => node.getBoundingClientRect().height)).toBe(height);
}

async function expectNamedBand(row: Locator): Promise<void> {
  await expect(row.locator('[data-slot="message-name-row"]')).toHaveCSS("opacity", "1");
}

async function expectPinnedStrip(row: Locator, scrollport: Locator, expectReveal: (row: Locator) => Promise<void>): Promise<number> {
  const header = row.locator('[data-slot="message-name-row"]');
  await expect(header).toHaveAttribute("data-pinned", "");
  const facts = await row.evaluate((node) => {
    const bar = node.querySelector('[data-slot="message-name-row"]');
    const prose = Array.from(node.querySelectorAll("p")).filter((paragraph) => paragraph.textContent.startsWith("Reading witness "));
    const first = prose[0];
    if (bar === null || first === undefined) {
      throw new Error("The actual reading row has no header or witness paragraphs");
    }
    const band = bar.getBoundingClientRect();
    const reading = first.getBoundingClientRect();
    const lines = prose.flatMap((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      return Array.from(range.getClientRects());
    });
    return {
      band: band.toJSON(),
      reading: reading.toJSON(),
      coveredLines: lines.filter((line) => line.bottom > band.top && line.top < band.bottom).length,
    };
  });
  await test.info().attach("pinned-reading-strip", { body: JSON.stringify(facts), contentType: "application/json" });
  expect(facts.coveredLines).toBeGreaterThan(0);
  expect(facts.band.left).toBeLessThanOrEqual(facts.reading.left + 1);
  expect(facts.band.right).toBeGreaterThanOrEqual(facts.reading.right - 1);
  const controls = await header.getByRole("button").all();
  const geometry = await actionGroupGeometry(scrollport, controls);
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  const menu = header.locator(MENU_TRIGGER);
  await expect(menu).toHaveCount(1);
  await expect(menu).toHaveAccessibleName(/\S/u);
  await expectReveal(row);
  await menu.click();
  const popup = row.page().getByRole("menu");
  await expect(popup).toBeVisible();
  await expect(popup).toBeFocused();
  await row.page().keyboard.press("Escape");
  await expect(menu).toBeFocused();
  return await backgroundAlpha(header);
}

function expectOpaqueBand(alpha: number): void {
  expect(alpha).toBe(255);
}
function expectExistingCard(alpha: number): void {
  expect(alpha).toBeGreaterThan(0);
}

async function expectRowEndRelease(row: Locator, scrollport: Locator): Promise<void> {
  await row.evaluate((node) => {
    const port = node.closest('[data-slot="message-list-scroll"]');
    if (port === null) {
      throw new Error("The reading row lost its production scrollport");
    }
    port.scrollTop += node.getBoundingClientRect().bottom - port.getBoundingClientRect().top + 2;
  });
  await expect
    .poll(async () => {
      const band = await row.locator('[data-slot="message-name-row"]').boundingBox();
      const port = await scrollport.boundingBox();
      return band === null || (port !== null && band.y + band.height <= port.y);
    })
    .toBe(true);
}

async function exerciseReadingRow(row: Locator, scrollport: Locator, style: ThemeChatStyle, messageId: MessageId): Promise<void> {
  const page = row.page();
  const header = row.locator('[data-slot="message-name-row"]');
  await expect(row.locator("p").filter({ hasText: /^Reading witness /u })).toHaveCount(PARAGRAPHS);
  const menu = header.locator(MENU_TRIGGER);
  await expect(menu).toHaveCount(1);
  await expect(menu).toHaveAccessibleName(/\S/u);
  await menu.focus();
  await page.keyboard.press("PageUp");
  await row.evaluate((node) => {
    const port = node.closest('[data-slot="message-list-scroll"]');
    if (port === null) {
      throw new Error("The message is not inside its production scrollport");
    }
    port.scrollTop += node.getBoundingClientRect().top - port.getBoundingClientRect().top - port.clientHeight / 4;
  });
  await expect(header).not.toHaveAttribute("data-pinned", "");
  const identityCount = style === "document" ? 0 : 1;
  await expect(row.locator('[data-slot="message-attribution"]')).toHaveCount(identityCount);
  await expect(row.locator('[data-slot="message-metadata-timestamp"]')).toHaveCount(identityCount);
  await expect(row.locator('[data-slot="avatar-root"]')).toHaveCount(identityCount);
  const expectRest = style === "document" ? expectDocumentRest : expectNamedRest;
  await expectRest(row);
  await row
    .locator("p")
    .filter({ hasText: /^Reading witness /u })
    .nth(10)
    .evaluate((paragraph) => {
      const port = paragraph.closest('[data-slot="message-list-scroll"]');
      if (port === null) {
        throw new Error("The paragraph is not inside its production scrollport");
      }
      port.scrollTop += paragraph.getBoundingClientRect().top - port.getBoundingClientRect().top + 2;
    });
  const alpha = await expectPinnedStrip(row, scrollport, style === "document" ? expectQuietDocumentBand : expectNamedBand);
  const expectPaint = style === "bubble" ? expectExistingCard : expectOpaqueBand;
  expectPaint(alpha);
  await expect(row.locator('[data-slot="message-attribution"]')).toHaveCount(identityCount);
  await expect(row.locator('[data-slot="message-metadata-timestamp"]')).toHaveCount(identityCount);
  await expect(row.locator('[data-slot="avatar-root"]')).toHaveCount(identityCount);
  await page.screenshot({ path: test.info().outputPath(`${style}-${messageId}-pinned.png`) });
  await expectRowEndRelease(row, scrollport);
  await page.screenshot({ path: test.info().outputPath(`${style}-${messageId}-released.png`) });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}x${viewport.height} coarse reading`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    for (const style of STYLES) {
      test(`${style} pins a complete reading strip without changing its identity policy`, async ({ corpus, page, mount }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        const reply = await prepareReadingRows(caller);
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
        await caller.settings.updateUserSettingsSection({
          section: "appearance",
          patch: appearanceSettingsSchema.parse({
            chatStyle: style,
            showInChatAvatars: true,
            showTimestamps: true,
            blurSurfaces: [],
            backgroundImageKind: "none",
          }),
        });
        await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
        await routeTrpc(page, {
          ...createShellAmbientReads(corpus, root.ownerId),
          ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
        });
        await mount<typeof ChatRoomShellStory>(STORY, { chatId: reply.chatId });
        const scrollport = page.locator('[data-slot="message-list-scroll"]');
        for (const messageId of reply.messageIds) {
          await scrollport.evaluate((node) => {
            node.scrollTop = 0;
          });
          await expect.poll(() => scrollport.evaluate((node) => node.scrollTop)).toBe(0);
          const row = page.locator(`[data-slot="message-row"][data-message-id="${messageId}"]`);
          await exerciseReadingRow(row, scrollport, style, messageId);
        }
      });
    }
  });
}
