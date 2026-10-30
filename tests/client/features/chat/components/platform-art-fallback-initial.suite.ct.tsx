// A speaker with no avatar image has their initial drawn as the art itself. In every style that draws art, the letter
// fills a stable share of its slot: between two fifths and four fifths of the slot's shorter side, for every speaker.

import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingRoom, READING_ROLES, TAIL_MESSAGES } from "./chat-style-reading.fixtures.ts";

const ROOM_STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROW = '[data-slot="message-row"]';
const LETTER = '[data-slot="text"][data-voice="monogram"]';
const SLOT_RATIO = { min: 0.4, max: 0.8 } as const;
const PHONE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

// The styles that draw the speaker as art rather than as a chip: the skin's own decoration or its sticky portrait.
const ART_STYLES = THEME_CHAT_STYLES.filter((style) => {
  const skin = MESSAGE_ROW_SKINS[style];
  const decoration = skin.bubbleDecoration?.({
    kind: "character",
    avatarHash: null,
    name: "Speaker",
    hueSeed: "speaker",
    role: "assistant",
    showInChatAvatars: true,
  });
  return decoration?.art !== undefined || decoration?.headerBand !== undefined || skin.avatarTreatment("character") === "sticky-portrait";
});

let root: ReadingRoom["root"];
let roomId: ChatId;

test.beforeAll(async () => {
  ({ root, roomId } = await createReadingRoom());
  const caller = await root.internalCallerFor(root.ownerId);
  const { messages } = await caller.chat.listMessages({ chatId: roomId, limit: TAIL_MESSAGES });
  for (const message of messages) {
    if (message.characterId !== null) {
      await caller.character.update({ characterId: message.characterId, input: { avatarAssetId: null } });
    }
    if (message.personaId !== null) {
      await caller.persona.update({ personaId: message.personaId, input: { avatarAssetId: null } });
    }
  }
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

/** Each letter's font size over the shorter side of the size container that holds it. */
async function letterRatios(page: Page, role: (typeof READING_ROLES)[number]): Promise<readonly number[]> {
  const letters = page.locator(`${ROW}[data-role="${role}"] ${LETTER}`);
  await expect(letters.first()).toBeVisible();
  return letters.evaluateAll((nodes) =>
    nodes.map((node) => {
      const slot = node.parentElement;
      if (slot === null) {
        throw new Error("A fallback letter has no slot");
      }
      const box = slot.getBoundingClientRect();
      return Number.parseFloat(getComputedStyle(node).fontSize) / Math.min(box.width, box.height);
    }),
  );
}

for (const viewport of [DESKTOP, PHONE]) {
  for (const chatStyle of ART_STYLES) {
    test(`${chatStyle} at ${viewport.width}px sizes every fallback initial to its art slot`, async ({ corpus, mount, page }) => {
      await page.setViewportSize(viewport);
      await openStyle(page, corpus, chatStyle);
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
      for (const role of READING_ROLES) {
        const ratios = await letterRatios(page, role);
        expect(ratios.length, `${chatStyle} ${role} draws its initial as art`).toBeGreaterThan(0);
        for (const ratio of ratios) {
          expect(ratio).toBeGreaterThanOrEqual(SLOT_RATIO.min);
          expect(ratio).toBeLessThanOrEqual(SLOT_RATIO.max);
        }
      }
    });
  }
}
