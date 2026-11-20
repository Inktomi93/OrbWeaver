// The transcript reflows at the largest browser text size on a phone: on every chat style neither its scroller nor a scroll box
// inside it (the history pager's plate) scrolls sideways, and when one does the case names the box that holds it wider.

import { CHAT_MESSAGE_LIST_MAX_LIMIT } from "@orb/contracts/chat";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { PLATFORM_TEXT_SCALES, seedShellState, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { seedTranscript } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_EARLIER_MESSAGES_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { CHAT_HISTORY_BEGINNING } from "#client/features/chat/lib/transcript-copy.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingStyle } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PHONE = { width: 390, height: 844 } as const;
const LARGEST_TEXT = Math.max(...PLATFORM_TEXT_SCALES);
// A box ends past a port only beyond the subpixel a centred track rounds to.
const PORT_SLACK_PX = 1;
// One row past the largest page the transcript can ask for, so the tail page always has an earlier one and the pager shows.
const HISTORY_ROWS = CHAT_MESSAGE_LIST_MAX_LIMIT + 1;
const SCROLLER = '[data-slot="message-list-scroll"]';

let root: ReadingRoom["root"];
let historyRoomId: ChatId | undefined;

// The cases read the room through this, so a loop of cases never closes over the suite's own `let`.
function historyRoom(): { readonly chatId: ChatId } {
  if (historyRoomId === undefined) {
    throw new Error("The history room is built in the suite's beforeAll");
  }
  return { chatId: historyRoomId };
}

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.beforeAll(async () => {
  ({ root } = await createReadingRoom());
  const caller = await root.internalCallerFor(root.ownerId);
  const [card] = (await caller.character.list({})).items;
  if (card === undefined) {
    throw new Error("The corpus needs a character to seat in the history room");
  }
  // A long history is bulk data, so the native chat import writes it in one call.
  historyRoomId = (
    await seedTranscript(root, {
      ownerId: root.ownerId,
      characterHandles: [card.handle],
      lines: Array.from({ length: HISTORY_ROWS }, (_, index) => ({
        ...(index % 2 === 0 ? { role: "assistant", speakerHandle: card.handle } : { role: "user" }),
        content: `Reflow witness ${String(index + 1)}. The lamp burned low while the rain kept time on the shutters.`,
      })),
    })
  ).chatId;
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

interface BoxOverflow {
  readonly box: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  /** The deepest boxes whose end edge passes this box's port, each by its slot or tag and its overhang. */
  readonly widening: readonly string[];
}

/** The transcript scroller and every box inside it that scrolls on the inline axis, each with what holds it wider than its port. */
function readOverflow(page: Page): Promise<BoxOverflow[]> {
  return page.locator(SCROLLER).evaluate((scroller, slack) => {
    const nameOf = (element: Element): string => element.getAttribute("data-slot") ?? element.tagName.toLowerCase();
    const scrolls = (element: Element): boolean => ["auto", "scroll"].includes(getComputedStyle(element).overflowX);
    return [scroller, ...Array.from(scroller.querySelectorAll("*")).filter(scrolls)].map((box) => {
      const portEnd = box.getBoundingClientRect().left + box.clientLeft + box.clientWidth;
      const past = Array.from(box.querySelectorAll("*")).filter((element) => element.getBoundingClientRect().right > portEnd + slack);
      const deepest = past.filter((element) => !past.some((other) => other !== element && element.contains(other)));
      return {
        box: nameOf(box),
        scrollWidth: box.scrollWidth,
        clientWidth: box.clientWidth,
        widening: deepest.map((element) => `${nameOf(element)} ends ${String(Math.round(element.getBoundingClientRect().right - portEnd))}px past the port`),
      };
    });
  }, PORT_SLACK_PX);
}

/** Every box that scrolls sideways or is widened, with the box it is in; empty when the transcript reflows. */
function sideways(boxes: readonly BoxOverflow[]): string[] {
  return boxes.flatMap((read) =>
    read.scrollWidth > read.clientWidth || read.widening.length > 0
      ? [`${read.box} scrolls ${String(read.scrollWidth - read.clientWidth)}px sideways: ${read.widening.join("; ")}`]
      : [],
  );
}

async function openHistoryRoom(page: Page, corpus: Parameters<typeof openReadingStyle>[1], chatStyle: ThemeChatStyle): Promise<void> {
  await openReadingStyle(page, corpus, chatStyle);
  await seedShellState(page, { activeSection: "chats" });
}

for (const chatStyle of THEME_CHAT_STYLES) {
  test(`${chatStyle} at a 390 phone and the largest text keeps its transcript and its history pager inside their ports`, async ({ corpus, mount, page }) => {
    await using textSize = await setPlatformTextSize(page, LARGEST_TEXT);
    await openHistoryRoom(page, corpus, chatStyle);
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, historyRoom());
    await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible();
    expect(await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeCloseTo(textSize.standardFontPx, 0);
    const earlier = page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true });
    expect(sideways(await readOverflow(page)), `${chatStyle} with earlier pages to load`).toStrictEqual([]);
    // Page to the room's first row: the pager then reads its end of history on screen.
    const beginning = page.getByText(CHAT_HISTORY_BEGINNING, { exact: false });
    for (let press = 0; press < HISTORY_ROWS && !(await beginning.isVisible()); press++) {
      await earlier.click();
      await expect(earlier).not.toHaveAttribute("aria-busy", "true");
    }
    await expect(beginning).toBeVisible();
    const boxes = await readOverflow(page);
    expect(boxes.length, "the read found no transcript scroller, so it proves nothing").toBeGreaterThan(0);
    expect(sideways(boxes), `${chatStyle} at the beginning of history`).toStrictEqual([]);
  });
}
