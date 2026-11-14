// @subject packages/client/src/features/chat/components/message-row-header.tsx
// A speaker's name too long to sit beside the avatar chip in a message header wraps inside its own box and keeps the chip on its first
// line, in every chat style that seats the chip in the header, for both the reader's own row and a character's, at the narrowest phone
// with enlarged text.

import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROW = '[data-slot="message-row"]';
const HEADER = '[data-slot="message-name-row"]';
const PARTS = { chip: '[data-slot="avatar-root"]', attribution: '[data-slot="message-attribution"]', text: '[data-slot="text"]' } as const;
const LONG_NAME = "Seraphina Evangeline Montgomery-Throckmorton the Third of Westmarch";
const ENLARGED_TEXT = 1.25;
const ROLES = ["user", "assistant"] as const;

/** How far the name's first line sits from the chip's box (zero when they share a line), and how far any name line spills past its box. */
function headerGeometry(header: Element, parts: typeof PARTS): { readonly lineGap: number; readonly spill: number; readonly lines: number } {
  const chip = header.querySelector(parts.chip)?.getBoundingClientRect();
  const attribution = header.querySelector(parts.attribution);
  const text = attribution?.querySelector(parts.text);
  if (chip === undefined || attribution === null || text === null || text === undefined) {
    throw new Error("The header has no chip or no speaker name");
  }
  const box = attribution.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(text);
  const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
  const first = lines[0];
  if (first === undefined) {
    throw new Error("The speaker name painted no line");
  }
  return {
    lineGap: Math.max(0, first.top - chip.bottom, chip.top - first.bottom),
    spill: Math.max(0, ...lines.map((rect) => Math.max(box.left - rect.left, rect.right - box.right))),
    lines: lines.length,
  };
}

async function headerOf(row: Locator): Promise<Locator> {
  await row.evaluate((node) => node.scrollIntoView({ block: "center" }));
  const header = row.locator(HEADER).first();
  await expect(header.locator(PARTS.chip)).toHaveCount(1);
  return header;
}

forEachNonEmpty(
  THEME_CHAT_STYLES.filter((style) => MESSAGE_ROW_SKINS[style].chipPlacement === "header"),
  "chat styles that seat the avatar chip in the message header",
  (chatStyle) => {
    test.describe(`${chatStyle} long speaker name`, () => {
      test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

      test("the chip shares a line with the first line of the name, which wraps inside its own box", async ({ corpus, mount, page }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        const messageIds = new Map<(typeof ROLES)[number], MessageId>();
        let chatId: ChatId | undefined;
        for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
          const { messages } = await caller.chat.listMessages({ chatId: room.id, limit: 6 });
          const user = messages.find((message) => message.role === "user" && message.personaId !== null);
          const assistant = messages.find((message) => message.role === "assistant" && message.characterId !== null && message.kind === "standard");
          if (user === undefined || user.personaId === null || assistant === undefined || assistant.characterId === null) {
            continue;
          }
          await caller.persona.update({ personaId: user.personaId, input: { name: LONG_NAME } });
          await caller.character.update({ characterId: assistant.characterId, input: { name: LONG_NAME } });
          chatId = room.id;
          messageIds.set("user", user.id).set("assistant", assistant.id);
          break;
        }
        if (chatId === undefined) {
          throw new Error("Corpus needs a room with a persona message and a character message");
        }
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { chatStyle, showInChatAvatars: true, backgroundImageKind: "none" } });
        await seedShellState(page, { activeSection: "chats" });
        await routeTrpc(page, {
          ...createShellAmbientReads(corpus, root.ownerId),
          ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
        });
        await mount<typeof ChatRoomShellStory>(STORY, { chatId });
        await setRootFontScale(page, channelName("fontScale"), ENLARGED_TEXT);

        for (const role of ROLES) {
          const header = await headerOf(page.locator(`${ROW}[data-message-id="${messageIds.get(role) ?? ""}"]`));
          // The name is long enough to need a second line, so the cell proves a wrapped name rather than one that happened to fit.
          await expect
            .poll(() => header.evaluate(headerGeometry, PARTS).then((geometry) => geometry.lines), { message: `${role} name wraps` })
            .toBeGreaterThan(1);
          await expect
            .poll(() => header.evaluate(headerGeometry, PARTS).then(({ lineGap, spill }) => ({ lineGap, spill })), { message: `${role} chip line, name spill` })
            .toEqual({ lineGap: 0, spill: 0 });
        }
      });
    });
  },
);
