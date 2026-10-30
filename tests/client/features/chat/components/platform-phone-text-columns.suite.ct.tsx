// Each chat style's phone text column at 390x844 against the Moonlit Echoes reference, measured on the owner's
// SillyTavern with touch emulation (`.mes_text` width). A style matches within a few pixels, or keeps a difference whose
// recorded parts add up to it: the parts are the reason, and the measured column must land on Moonlit plus that
// difference, so a drift in either direction fails the case.

import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingRoom } from "./chat-style-reading.fixtures.ts";

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
    difference: -19,
    parts: [
      { px: -30, why: "the chip and its gap sit outside the card, where Moonlit draws its avatar inside a full-width card" },
      { px: 14.4, why: "the card pads 12px each side where Moonlit pads 19.2px" },
      { px: -3, why: "the speaker stripe is 3px" },
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
    difference: 7.4,
    parts: [{ px: 7.4, why: "the train fills the 344px column beside the chip, where Moonlit's pill column is 90% of the 374px row" }],
  },
};

let root: ReadingRoom["root"];
let roomId: ChatId;
let longReplyId: string;

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test.beforeAll(async () => {
  ({ root, roomId, longReplyId } = await createReadingRoom());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

async function openStyle(page: Page, corpus: CorpusPlayback, chatStyle: ThemeChatStyle): Promise<void> {
  await openReadingRoom(page, corpus, root, { chatStyle, art: false });
  await seedShellState(page, { activeSection: "chats" });
}

function roomStoryProps(): { readonly chatId: ChatId } {
  return { chatId: roomId };
}

async function textColumnWidth(page: Page, measure: Reference["measure"]): Promise<number> {
  const row = page.locator(`[data-slot="message-row"][data-message-id="${longReplyId}"]`);
  await expect(row).toBeVisible();
  const target = measure === "prose" ? row.locator("p").first() : row.locator('[data-slot="message-content-column"]');
  return target.evaluate((element) => element.getBoundingClientRect().width);
}

for (const chatStyle of THEME_CHAT_STYLES) {
  test(`${chatStyle} keeps its phone text column within a few pixels of Moonlit, or its recorded difference`, async ({ corpus, mount, page }) => {
    const reference = MOONLIT_PORTRAIT[chatStyle];
    await openStyle(page, corpus, chatStyle);
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
