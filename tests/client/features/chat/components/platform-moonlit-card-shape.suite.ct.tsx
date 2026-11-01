// The card shapes Moonlit Echoes draws, from its theme source (token descriptions cite the commit): a Bubble card's
// asymmetric corners and 80% cap, Tide's 18px pills and 70% (90% on a phone) column, the timestamp under the name on a phone
// outside echo, and Ripple's rule under its header and its portrait fading into the card.

import { CHAT_MESSAGE_LIST_MAX_LIMIT } from "@orb/contracts/chat";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingStyle, roomStoryProps } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const DESKTOP = { width: 1280, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const ROW = '[data-slot="message-row"]';
const CARD = '[data-slot="message-bubble"]';

let root: ReadingRoom["root"];

test.beforeAll(async () => {
  ({ root } = await createReadingRoom());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test.describe("desktop", () => {
  test.use({ viewport: DESKTOP, hasTouch: true });

  test("a bubble card takes the speaker's asymmetric corners, mirrored for the user", async ({ corpus, mount, page }) => {
    await openReadingStyle(page, corpus, "bubble");
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    await expect(page.locator(`${ROW} ${CARD}`).first()).toBeVisible();
    const corners = await page.locator(ROW).evaluateAll((rows) =>
      rows.flatMap((row) => {
        const card = row.querySelector('[data-slot="message-bubble"]');
        if (card === null) {
          return [];
        }
        const style = getComputedStyle(card);
        return [
          {
            role: row.getAttribute("data-role"),
            radii: [style.borderStartStartRadius, style.borderStartEndRadius, style.borderEndEndRadius, style.borderEndStartRadius].map(Number.parseFloat),
          },
        ];
      }),
    );
    const sharp = LENGTH_BASE_PX["radius.bubble-sharp"];
    const round = LENGTH_BASE_PX["radius.bubble-round"];
    const tail = LENGTH_BASE_PX["radius.bubble-tail"];
    const assistant = corners.filter((corner) => corner.role === "assistant");
    const user = corners.filter((corner) => corner.role === "user");
    expect(assistant.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
    for (const corner of assistant) {
      expect(corner.radii).toEqual([sharp, round, round, tail]);
    }
    for (const corner of user) {
      expect(corner.radii).toEqual([round, sharp, tail, round]);
    }
  });

  for (const [chatStyle, shareToken, capToken] of [
    ["bubble", "reading.bubble-share", TOKENS["reading.bubble-share-cap"].cssVar],
    ["tide", "reading.tide-share", TOKENS["reading.tide-share-cap"].cssVar],
  ] as const) {
    test(`${chatStyle} caps at its share of the column, never past the reading measure`, async ({ corpus, mount, page }) => {
      await openReadingStyle(page, corpus, chatStyle);
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
      // A tide row that splits into a train of pills carries the cap on its column.
      const row = page
        .locator(ROW)
        .filter({ has: page.locator(chatStyle === "tide" ? '[data-slot="message-bubble-train"]' : CARD) })
        .first();
      await expect(row).toBeVisible();
      const measured = await row.evaluate((element, cap) => {
        const column = element.querySelector('[data-slot="message-content-column"]');
        const target = element.querySelector('[data-slot="message-bubble"]');
        if (column === null || target === null) {
          throw new Error("the row has no column or card");
        }
        const probe = document.createElement("div");
        probe.style.maxInlineSize = `var(${cap})`;
        column.append(probe);
        const expected = getComputedStyle(probe).maxInlineSize;
        probe.remove();
        // A tide row's cap sits on its column, which its pills fill; a bubble's sits on the card.
        const holder = column.querySelector('[data-slot="message-bubble-train"]') === null ? target : column;
        return {
          declared: getComputedStyle(holder).maxInlineSize,
          expected,
          width: holder.getBoundingClientRect().width,
          row: element.getBoundingClientRect().width,
        };
      }, capToken);
      const share = Number.parseFloat(TOKENS[shareToken].value) / 100;
      expect(measured.declared, chatStyle).toBe(measured.expected);
      expect(measured.width, chatStyle).toBeLessThanOrEqual(measured.row * share + 1);
    });
  }

  test("a tide pill is the pill radius for both speakers", async ({ corpus, mount, page }) => {
    await openReadingStyle(page, corpus, "tide");
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    await expect(page.locator(`${ROW} ${CARD}`).first()).toBeVisible();
    const radii = await page.locator(`${ROW} ${CARD}`).evaluateAll((cards) =>
      cards.map((card) => {
        const style = getComputedStyle(card);
        return [style.borderStartStartRadius, style.borderStartEndRadius, style.borderEndEndRadius, style.borderEndStartRadius].map(Number.parseFloat);
      }),
    );
    const pill = LENGTH_BASE_PX["radius.pill"];
    for (const corners of radii) {
      expect(corners).toEqual([pill, pill, pill, pill]);
    }
  });

  test("ripple draws a rule under its header and fades its portrait into the card; no other skin does", async ({ corpus, mount, page }) => {
    const ruled: string[] = [];
    for (const chatStyle of THEME_CHAT_STYLES) {
      if (!MESSAGE_ROW_SKINS[chatStyle].actionsRow.identity) {
        continue;
      }
      await openReadingStyle(page, corpus, chatStyle);
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
      const header = page.locator(`${ROW} [data-slot="message-name-row"]`).first();
      await expect(header).toBeVisible();
      if ((await header.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderBlockEndWidth))) > 0) {
        ruled.push(chatStyle);
      }
    }
    const want = THEME_CHAT_STYLES.filter((chatStyle) => MESSAGE_ROW_SKINS[chatStyle].headerRule);
    expect(ruled.sort()).toEqual([...want].sort());
    expect(want).toEqual(["ripple"]);

    await openReadingStyle(page, corpus, "ripple");
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    await expect(page.locator(`${ROW} [data-slot="avatar-root"]`).first()).toBeVisible();
    const masks = await page.locator(ROW).evaluateAll((rows) =>
      rows.flatMap((row) => {
        const portrait = row.querySelector('[data-slot="avatar-root"]');
        const card = row.querySelector('[data-slot="message-bubble"]');
        if (portrait === null || card === null) {
          return [];
        }
        const rect = portrait.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        return [{ mask: getComputedStyle(portrait).maskImage, onStart: Math.abs(rect.left - cardRect.left) < Math.abs(rect.right - cardRect.right) }];
      }),
    );
    expect(masks.length).toBeGreaterThan(0);
    for (const entry of masks) {
      // The fade runs toward the text: to the right of a start-side portrait, to the left of an end-side one.
      expect(entry.mask).toMatch(entry.onStart ? /linear-gradient\((?:90deg|to right),/u : /linear-gradient\((?:270deg|-90deg|to left),/u);
    }
  });
});

test.describe("message number", () => {
  test.use({ viewport: DESKTOP, hasTouch: true });

  async function numberFacts(
    page: Page,
  ): Promise<{ readonly place: "metadata" | "portrait" | "absent"; readonly gap: number; readonly offCentre: number; readonly text: string | null }> {
    // The last reply is fully in view; a row above it may sit under the transcript's top edge.
    const row = page.locator(ROW).last();
    await expect(row).toBeVisible();
    return row.evaluate((element) => {
      const number = element.querySelector('[data-slot="message-metadata-id"]');
      const portrait = element.querySelector('[data-slot="avatar-root"]')?.getBoundingClientRect();
      if (number === null) {
        return { place: "absent" as const, gap: Number.NaN, offCentre: Number.NaN, text: null };
      }
      const box = number.getBoundingClientRect();
      return {
        place: number.closest('[data-slot="message-metadata-row"]') === null ? ("portrait" as const) : ("metadata" as const),
        gap: portrait === undefined ? Number.NaN : box.top - portrait.bottom,
        offCentre: portrait === undefined ? Number.NaN : Math.abs(box.left + box.width / 2 - (portrait.left + portrait.width / 2)),
        text: number.textContent,
      };
    });
  }

  /** The whole room read as the viewer: the last row's number is how many rows the room holds. */
  async function lastRowNumber(): Promise<string> {
    const caller = await root.internalCallerFor(root.ownerId);
    const { messages, previousCursor } = await caller.chat.listMessages({ ...roomStoryProps(), limit: CHAT_MESSAGE_LIST_MAX_LIMIT });
    expect(previousCursor).toBeNull();
    return `#${messages.length}`;
  }

  test("ripple seats the message number under its portrait, centred on it", async ({ corpus, mount, page }) => {
    await openReadingStyle(page, corpus, "ripple", { showMessageId: true });
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    const facts = await numberFacts(page);
    expect(facts.place).toBe("portrait");
    expect(facts.text).toBe(await lastRowNumber());
    // Capture 194745 puts it a field step (about 6px) under the portrait, centred on it.
    expect(facts.offCentre).toBeLessThanOrEqual(1);
    expect(Math.abs(facts.gap - LENGTH_BASE_PX["spacing.field"])).toBeLessThanOrEqual(1);
  });

  test("another style keeps the message number in the metadata row", async ({ corpus, mount, page }) => {
    await openReadingStyle(page, corpus, "bubble", { showMessageId: true });
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    const facts = await numberFacts(page);
    expect(facts.place).toBe("metadata");
    expect(facts.text).toBe(await lastRowNumber());
  });
});

test.describe("phone", () => {
  test.use({ viewport: PHONE, hasTouch: true });

  forEachNonEmpty(
    THEME_CHAT_STYLES.filter((style) => MESSAGE_ROW_SKINS[style].actionsRow.identity),
    "chat styles with an identity row",
    (chatStyle) => {
      // Moonlit stacks the timestamp under the name on a phone in every style but echo.
      const stacked = chatStyle !== "echo";
      test(`${chatStyle} puts the timestamp ${stacked ? "under" : "beside"} the name on a phone`, async ({ corpus, mount, page }) => {
        await openReadingStyle(page, corpus, chatStyle);
        await seedShellState(page, { activeSection: "chats" });
        await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
        const header = page.locator(`${ROW} [data-slot="message-name-row"]`).first();
        await expect(header).toBeVisible();
        const geometry = await header.evaluate((element) => {
          const name = element.querySelector('[data-slot="message-attribution"]')?.getBoundingClientRect();
          const stamp = element.querySelector('[data-slot="message-metadata-timestamp"]')?.getBoundingClientRect();
          if (name === undefined || stamp === undefined) {
            throw new Error("the header has no name or timestamp");
          }
          return { under: stamp.top >= name.bottom - 1 };
        });
        expect(geometry.under).toBe(stacked);
      });
    },
  );
});
