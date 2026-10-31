// Each chat style's phone text column at 390x844 (and, below, a few styles at 844x390) against the Moonlit Echoes reference, measured on the owner's
// SillyTavern with touch emulation (`.mes_text` width). A style matches within a few pixels, or keeps a difference whose
// recorded parts add up to it: the parts are the reason, and the measured column must land on Moonlit plus that
// difference, so a drift in either direction fails the case.

import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { LENGTH_BASE_PX } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingStyle, roomStoryProps } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PHONE = { width: 390, height: 844 } as const;
const FEW_PX = 4;
/** The recorded parts of a difference add up to it within this rounding. */
const PARTS_ROUNDING_PX = 1;

interface Part {
  /** Signed px this reason moves Orbweaver's column from Moonlit's. */
  readonly px: number;
  readonly why: string;
}

interface Reference {
  /** Moonlit's text column in CSS px: its `.mes_text` width less the padding the style adds beside the prose. */
  readonly moonlit: number;
  /** What Orbweaver measures: the prose block, or the content column for a train of pills. */
  readonly measure: "prose" | "column";
  /** The difference from Moonlit this style keeps, in px, as the sum of its recorded parts. */
  readonly difference: number;
  readonly parts: readonly Part[];
}

const AVATAR_CHIP: Part = { px: 32, why: "the identity chip is the 24px small rounded avatar, where Moonlit reserves a 56px gutter (owner ruling)" };

const MOONLIT_PORTRAIT: Record<ThemeChatStyle, Reference> = {
  flat: { moonlit: 278.5, measure: "prose", difference: 32, parts: [AVATAR_CHIP] },
  bubble: {
    moonlit: 267.2,
    measure: "prose",
    difference: -16,
    parts: [
      { px: -24, why: "the phone cap is four fifths of the column beside the 24px chip (275px card), where Moonlit takes four fifths of the row (299px)" },
      { px: 8, why: "the card pads 12px each side where Moonlit pads 16px" },
    ],
  },
  document: { moonlit: 360, measure: "prose", difference: 0, parts: [] },
  echo: {
    moonlit: 260.5,
    measure: "prose",
    difference: 8,
    parts: [{ px: 8, why: "the text side pads 12px (the card inset token) where Moonlit pads 20px; the 93.5px art side matches" }],
  },
  whisper: {
    moonlit: 342,
    measure: "prose",
    difference: 8,
    parts: [{ px: 8, why: "the card pads 12px each side where Moonlit pads 16px" }],
  },
  hush: {
    moonlit: 336,
    measure: "prose",
    difference: 8,
    parts: [
      { px: 14.4, why: "the card pads 12px each side where Moonlit pads 19.2px" },
      { px: -6.4, why: "the transcript column is 368px where Moonlit's card is 374.4px" },
    ],
  },
  ripple: {
    moonlit: 244.5,
    measure: "prose",
    difference: 5.5,
    parts: [{ px: 5.5, why: "the prose pads 12px each side of its stack (24px) where Moonlit's measured insets beside the 100px portrait total 29.5px" }],
  },
  tide: {
    moonlit: 336.6,
    measure: "column",
    difference: 0,
    parts: [],
  },
};

let root: ReadingRoom["root"];
let longReplyId: string;

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.beforeAll(async () => {
  ({ root, longReplyId } = await createReadingRoom());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

async function textColumnWidth(page: Page, measure: Reference["measure"]): Promise<number> {
  const row = page.locator(`[data-slot="message-row"][data-message-id="${longReplyId}"]`);
  await expect(row).toBeVisible();
  const target = measure === "prose" ? row.locator("p").first() : row.locator('[data-slot="message-content-column"]');
  return target.evaluate((element) => element.getBoundingClientRect().width);
}

for (const chatStyle of THEME_CHAT_STYLES) {
  test(`${chatStyle} keeps its phone text column within a few pixels of Moonlit, or its recorded difference`, async ({ corpus, mount, page }) => {
    const reference = MOONLIT_PORTRAIT[chatStyle];
    await openReadingStyle(page, corpus, chatStyle);
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    const width = await textColumnWidth(page, reference.measure);
    const partsSum = reference.parts.reduce((sum, part) => sum + part.px, 0);
    expect(Math.abs(partsSum - reference.difference), `${chatStyle}: the recorded parts do not add up to the difference`).toBeLessThanOrEqual(
      PARTS_ROUNDING_PX,
    );
    expect(
      Math.abs(width - reference.moonlit - reference.difference),
      `${chatStyle}: ${String(width)}px against Moonlit ${String(reference.moonlit)}px`,
    ).toBeLessThanOrEqual(FEW_PX);
  });
}

// LANDSCAPE, 844x390. The shell enters its desktop rail regime at this width, so the room is narrower than Moonlit's full-width
// row, and bubble prose rides the reading measure. The shell's share is measured here (the row's width less the viewport's),
// not typed; the other parts are the styles' own insets. Moonlit measured echo, ripple and tide in landscape too, but their
// columns follow the card anatomy and are not pinned here; whisper and hush were not measured in landscape. Bubble is not
// pinned either: its card hugs the fixture's short lines, so the room's text never reaches the reading cap that would explain it.
const LANDSCAPE = { width: 844, height: 390 } as const;
/** Moonlit's landscape `.mes_text` widths, from the same note as the portrait values. */
const MOONLIT_LANDSCAPE = { flat: 732.5, document: 814 } as const;
/** Moonlit's document text sits 30px short of the viewport (844 against 814). */
const MOONLIT_DOCUMENT_MARGIN_PX = LANDSCAPE.width - MOONLIT_LANDSCAPE.document;

async function readLandscape(page: Page): Promise<{ readonly row: number; readonly column: number; readonly prose: number }> {
  const row = page.locator(`[data-slot="message-row"][data-message-id="${longReplyId}"]`);
  await expect(row).toBeVisible();
  return row.evaluate((element) => ({
    row: element.getBoundingClientRect().width,
    column: element.querySelector('[data-slot="message-content-column"]')?.getBoundingClientRect().width ?? Number.NaN,
    prose: element.querySelector("p")?.getBoundingClientRect().width ?? Number.NaN,
  }));
}

test.describe("landscape", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true, isMobile: true });

  test("flat is Moonlit's column less the shell's share, plus the avatar chip", async ({ corpus, mount, page }) => {
    await openReadingStyle(page, corpus, "flat");
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    const facts = await readLandscape(page);
    const shell = facts.row - LANDSCAPE.width;
    expect(Math.abs(facts.prose - (MOONLIT_LANDSCAPE.flat + shell + AVATAR_CHIP.px)), `flat: ${String(facts.prose)}px`).toBeLessThanOrEqual(FEW_PX);
  });

  test("document is Moonlit's column less the shell's share, the track step and its page inset, plus Moonlit's own margin", async ({ corpus, mount, page }) => {
    await openReadingStyle(page, corpus, "document");
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    const facts = await readLandscape(page);
    const shell = facts.row - LANDSCAPE.width;
    const trackStep = facts.column - facts.row;
    const pageInset = -2 * LENGTH_BASE_PX["spacing.gutter"];
    const expected = MOONLIT_LANDSCAPE.document + shell + trackStep + pageInset + MOONLIT_DOCUMENT_MARGIN_PX;
    expect(Math.abs(facts.prose - expected), `document: ${String(facts.prose)}px`).toBeLessThanOrEqual(FEW_PX);
  });
});
