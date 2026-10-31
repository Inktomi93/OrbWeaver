// The immersive styles (echo, whisper, hush, ripple) draw every row as one full-width card, so card widths do not
// jump between a short reply and a long one, and hush's card is filled and rounded as Moonlit Echoes draws it.

import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { LENGTH_BASE_PX } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingStyle, roomStoryProps } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const BUBBLE = '[data-slot="message-bubble"]';
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/** Moonlit Echoes' whisper band against its card at 1920 (`194600` in `reports/moonlit-reference/`: 464px of a 932px card), and the rounding a few pixels allow. */
const MOONLIT_WHISPER_BAND_SHARE = 0.5;
const SHARE_TOLERANCE = 0.03;
const FEW_PX = 4;

// The styles that draw identity as art or a stripe: the skin table's own decoration or its sticky portrait.
const IMMERSIVE_STYLES = THEME_CHAT_STYLES.filter((style) => {
  const skin = MESSAGE_ROW_SKINS[style];
  return skin.bubbleDecoration !== undefined || skin.avatarTreatment("character") === "sticky-portrait";
});

let root: ReadingRoom["root"];

test.use({ hasTouch: true });

test.beforeAll(async () => {
  ({ root } = await createReadingRoom());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The width of every rendered message card, one per row: a short reply and a long one, both speakers. */
async function cardWidths(page: Page): Promise<readonly number[]> {
  const cards = page.locator(`[data-slot="message-row"] ${BUBBLE}`);
  await expect(cards.first()).toBeVisible();
  return cards.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)));
}

for (const viewport of WIDTHS) {
  for (const chatStyle of IMMERSIVE_STYLES) {
    test(`${chatStyle} at ${viewport.width}px draws every row as one card width`, async ({ corpus, mount, page }) => {
      await page.setViewportSize(viewport);
      await openReadingStyle(page, corpus, chatStyle);
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
      const widths = await cardWidths(page);
      expect(widths.length).toBeGreaterThan(1);
      expect(new Set(widths).size, `card widths ${widths.join(", ")}`).toBe(1);
    });
  }
}

test("hush draws a filled, rounded card for each row", async ({ corpus, mount, page }) => {
  await page.setViewportSize(WIDTHS[1]);
  await openReadingStyle(page, corpus, "hush");
  await seedShellState(page, { activeSection: "chats" });
  await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
  const card = page.locator(`[data-slot="message-row"] ${BUBBLE}`).first();
  await expect(card).toBeVisible();
  const paint = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return { fill: style.backgroundColor, radius: Number.parseFloat(style.borderStartStartRadius) };
  });
  expect(paint.fill).not.toBe(TRANSPARENT);
  expect(paint.radius).toBeGreaterThan(0);
});

test("a whisper band sits at the card's top right, half its width, and dissolves toward the left", async ({ corpus, mount, page }) => {
  await page.setViewportSize(WIDTHS[1]);
  await openReadingStyle(page, corpus, "whisper");
  await seedShellState(page, { activeSection: "chats" });
  await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
  const row = page
    .locator('[data-slot="message-row"]')
    .filter({ has: page.locator('[data-slot="message-band"]') })
    .first();
  await expect(row).toBeVisible();
  const geometry = await row.evaluate((element) => {
    const card = element.querySelector('[data-slot="message-bubble"]')?.getBoundingClientRect();
    const band = element.querySelector('[data-slot="message-band"]');
    const box = band?.getBoundingClientRect();
    if (card === undefined || band === null || box === undefined) {
      throw new Error("the whisper row has no card or band");
    }
    return {
      share: box.width / card.width,
      rightGap: card.right - box.right,
      topGap: box.top - card.top,
      fade: getComputedStyle(band).backgroundImage,
    };
  });
  expect(Math.abs(geometry.share - MOONLIT_WHISPER_BAND_SHARE)).toBeLessThanOrEqual(SHARE_TOLERANCE);
  expect(Math.abs(geometry.rightGap)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.topGap)).toBeLessThanOrEqual(1);
  expect(geometry.fade).toMatch(/linear-gradient\((?:270deg|-90deg|to left),/u);
});

for (const viewport of WIDTHS) {
  test(`an echo card keeps its minimum height at rest at ${viewport.width}px`, async ({ corpus, mount, page }) => {
    await page.setViewportSize(viewport);
    await openReadingStyle(page, corpus, "echo");
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    const cards = page.locator(`[data-slot="message-row"] ${BUBBLE}`);
    await expect(cards.first()).toBeVisible();
    const heights = await cards.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    const floor = LENGTH_BASE_PX["immersive.echo-min-height"];
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(floor - 1);
    // A reply this short is what the floor is for, so on a desktop the shortest card sits on it, not above it.
    const ceiling = viewport.width >= WIDTHS[1].width ? floor + FEW_PX : Number.POSITIVE_INFINITY;
    expect(Math.min(...heights)).toBeLessThanOrEqual(ceiling);
  });
}

for (const chatStyle of ["hush", "whisper"] as const) {
  test(`${chatStyle} marks each card with a short speaker tick at its end edge`, async ({ corpus, mount, page }) => {
    await page.setViewportSize(WIDTHS[1]);
    await openReadingStyle(page, corpus, chatStyle);
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    const card = page.locator(`[data-slot="message-row"] ${BUBBLE}`).first();
    await expect(card).toBeVisible();
    const tick = await card.evaluate((element) => {
      const mark = getComputedStyle(element, "::after");
      return {
        width: Number.parseFloat(mark.width),
        height: Number.parseFloat(mark.height),
        top: Number.parseFloat(mark.insetBlockStart),
        end: Number.parseFloat(mark.insetInlineEnd),
        position: mark.position,
        cardHeight: element.getBoundingClientRect().height,
      };
    });
    expect(tick.position).toBe("absolute");
    expect(tick.width).toBe(LENGTH_BASE_PX["immersive.stripe-width"]);
    expect(tick.height).toBe(LENGTH_BASE_PX["immersive.tick-length"]);
    expect(tick.top).toBe(LENGTH_BASE_PX["immersive.tick-offset"]);
    expect(tick.end).toBe(0);
    expect(tick.top + tick.height).toBeLessThanOrEqual(tick.cardHeight);
  });
}
