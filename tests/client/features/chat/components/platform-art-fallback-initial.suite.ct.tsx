// A speaker with no avatar image has their initial drawn as the art itself. In every style that draws art, the letter
// fills a stable share of its slot: between two fifths and four fifths of the slot's shorter side, for every speaker.

import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { AA_NORMAL_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
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

// Primaries a card or owner theme can carry: light, dark, mid and saturated, so the hue steps taken off each one are judged.
const CUSTOM_PRIMARIES = ["#f5e663", "#1a1a40", "#808080", "#ff00ff", "#00ffff", "#ffffff", "#000000"] as const;

/** Select a custom theme whose accent is `primary`; opening a style resets the selection, so this runs after it. */
async function selectPrimary(primary: string, chatStyle: ThemeChatStyle): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const theme = await caller.settings.createTheme({ name: `Primary ${primary} in ${chatStyle}`, override: { accent: primary }, css: "" });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: theme.id } });
}

/** Each rendered initial's contrast against the fill of the art slot that holds it, labelled with the colours read.
 *  The letter's own box spans the slot, so a pixel ring around it would sample what lies beyond the fill. */
async function letterContrasts(page: Page): Promise<readonly { readonly label: string; readonly ratio: number }[]> {
  const measured: { readonly label: string; readonly ratio: number }[] = [];
  for (const role of READING_ROLES) {
    const letters = page.locator(`${ROW}[data-role="${role}"] ${LETTER}`);
    await expect(letters.first()).toBeVisible();
    const pairs = await letters.evaluateAll((nodes) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) {
        throw new Error("No 2d context to resolve colours through");
      }
      // The engine converts every CSS colour syntax, oklch included, to the bytes the glyph is painted in.
      const bytes = (css: string): { r: number; g: number; b: number } => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = css;
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
        return { r, g, b };
      };
      return nodes.map((node) => {
        let slot: Element | null = node.parentElement;
        while (slot !== null && getComputedStyle(slot).backgroundColor === "rgba(0, 0, 0, 0)") {
          slot = slot.parentElement;
        }
        if (slot === null) {
          throw new Error("A fallback letter has no filled slot");
        }
        return { ink: bytes(getComputedStyle(node).color), fill: bytes(getComputedStyle(slot).backgroundColor) };
      });
    });
    for (const pair of pairs) {
      measured.push({ label: `${role}: ink ${JSON.stringify(pair.ink)} on ${JSON.stringify(pair.fill)}`, ratio: wcagContrastRatio(pair.ink, pair.fill) });
    }
  }
  return measured;
}

for (const primary of CUSTOM_PRIMARIES) {
  for (const chatStyle of ART_STYLES) {
    test(`${chatStyle} keeps its fallback initial legible over a theme primary of ${primary}`, async ({ corpus, mount, page }) => {
      await page.setViewportSize(DESKTOP);
      await openStyle(page, corpus, chatStyle);
      await selectPrimary(primary, chatStyle);
      await mount<typeof ChatRoomShellStory>(ROOM_STORY, roomStoryProps());
      const measured = await letterContrasts(page);
      expect(measured.length).toBeGreaterThan(0);
      for (const letter of measured) {
        expect(letter.ratio, `${chatStyle} ${letter.label}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      }
    });
  }
}
