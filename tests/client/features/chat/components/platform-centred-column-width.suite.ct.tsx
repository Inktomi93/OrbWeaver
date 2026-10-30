// A centred chat style keeps one column width and one chip position whether a reply holds prose or a code block,
// at a desktop container wide enough for the reading measure.
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingRoom, TAIL_MESSAGES } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROW = '[data-slot="message-row"]';
const COLUMN = '[data-slot="message-content-column"]';
const CHIP = '[data-slot="avatar-root"]';
const PROSE = "The lamp burned low while the rain kept time on the shutters.";
const CODE_LINE = "const reading = await lamp.burnLow({ rain: shutters, time: keepTime, measure: 'a line long enough to outrun any reading column' });";
const WIDE_VIEWPORT = { width: 1920, height: 1080 } as const;

// The styles whose column the skin table centres: the production table is the list.
const CENTRED_STYLES = THEME_CHAT_STYLES.filter((style) => MESSAGE_ROW_SKINS[style].columnPlacement === "gutterCentred");

let root: ReadingRoom["root"];
let roomId: ChatId;
let proseId: MessageId;
let codeId: MessageId;

test.use({ viewport: WIDE_VIEWPORT });

test.beforeAll(async () => {
  ({ root, roomId, longReplyId: proseId } = await createReadingRoom());
  const caller = await root.internalCallerFor(root.ownerId);
  const { messages } = await caller.chat.listMessages({ chatId: roomId, limit: TAIL_MESSAGES });
  const last = messages.at(-1);
  if (last === undefined) {
    throw new Error("The room's tail holds no message");
  }
  codeId = last.id;
  await caller.chat.editMessage({ chatId: roomId, messageId: proseId, content: PROSE, timeZone: UTC_TIME_ZONE });
  await caller.chat.editMessage({ chatId: roomId, messageId: codeId, content: `${PROSE}\n\n\`\`\`ts\n${CODE_LINE}\n\`\`\``, timeZone: UTC_TIME_ZONE });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

interface Placement {
  readonly columnWidth: number;
  readonly columnX: number;
  readonly chipX: number | null;
}

async function placementOf(page: Page, id: MessageId): Promise<Placement> {
  const row = page.locator(`${ROW}[data-message-id="${id}"]`);
  const column = await row.locator(COLUMN).boundingBox();
  const chip = row.locator(CHIP).first();
  const chipBox = (await chip.count()) === 0 ? null : await chip.boundingBox();
  if (column === null) {
    throw new Error("The rendered row has no content column");
  }
  return { columnWidth: column.width, columnX: column.x, chipX: chipBox === null ? null : chipBox.x };
}

function roomStoryProps(): { readonly chatId: ChatId } {
  return { chatId: roomId };
}

async function openStyle(page: Page, corpus: CorpusPlayback, chatStyle: ThemeChatStyle): Promise<void> {
  await openReadingRoom(page, corpus, root, { chatStyle, art: false });
  await seedShellState(page, { activeSection: "chats" });
}

/** The prose reply's placement and the code reply's, once both rows are on screen. */
async function placements(page: Page): Promise<{ readonly prose: Placement; readonly code: Placement }> {
  await expect(page.locator(`${ROW}[data-message-id="${codeId}"] pre`)).toBeVisible();
  await expect(page.locator(`${ROW}[data-message-id="${proseId}"] ${COLUMN}`)).toBeVisible();
  return { prose: await placementOf(page, proseId), code: await placementOf(page, codeId) };
}

for (const chatStyle of CENTRED_STYLES) {
  test(`${chatStyle} keeps one column width and chip position for a prose row and a code row`, async ({ corpus, mount, page }) => {
    await openStyle(page, corpus, chatStyle);
    await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
    const { prose, code } = await placements(page);
    expect(code).toEqual(prose);
  });
}
