// @subject packages/client/src/features/chat/components/message-row-header.tsx
// A speaker's name too long to sit beside the avatar chip in a message header wraps inside its own box and keeps the chip beside it, in every chat style that seats the chip in the header,
// for both the reader's own row and a character's, at the narrowest phone with enlarged text.

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

/** How far the chip's box sits from the block of name lines vertically (zero when the chip is beside the name, whatever its alignment), and how far any name line spills past its box. */
function headerGeometry(header: Element, parts: typeof PARTS): { readonly rowGap: number; readonly spill: number; readonly lines: number } {
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
  const last = lines.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("The speaker name painted no line");
  }
  return {
    rowGap: Math.max(0, first.top - chip.bottom, chip.top - last.bottom),
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

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** A room's persona and character speakers, both pictured and renamed long. A speaker with no picture paints the initials fallback in echo's and whisper's art slot and no chip. */
async function renameSpeakers(
  caller: Awaited<ReturnType<Root["internalCallerFor"]>>,
): Promise<{ readonly chatId: ChatId; readonly messageIds: Map<(typeof ROLES)[number], MessageId> }> {
  const pictured = (await caller.character.list({ limit: 100 })).items.find((character) => character.avatarHash !== null && character.avatarAssetId !== null);
  if (pictured === undefined) {
    throw new Error("Corpus needs an owned pictured character");
  }
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: room.id, limit: 6 });
    const user = messages.find((message) => message.role === "user" && message.personaId !== null);
    const assistant = messages.find((message) => message.role === "assistant" && message.characterId !== null && message.kind === "standard");
    if (user === undefined || user.personaId === null || assistant === undefined || assistant.characterId === null) {
      continue;
    }
    const input = { name: LONG_NAME, avatarAssetId: pictured.avatarAssetId };
    await caller.persona.update({ personaId: user.personaId, input });
    await caller.character.update({ characterId: assistant.characterId, input });
    return { chatId: room.id, messageIds: new Map<(typeof ROLES)[number], MessageId>().set("user", user.id).set("assistant", assistant.id) };
  }
  throw new Error("Corpus needs a room with a persona message and a character message");
}

forEachNonEmpty(
  THEME_CHAT_STYLES.filter((style) => MESSAGE_ROW_SKINS[style].chipPlacement === "header"),
  "chat styles that seat the avatar chip in the message header",
  (chatStyle) => {
    test.describe(`${chatStyle} long speaker name`, () => {
      test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

      test("the chip stays beside the name, which wraps inside its own box", async ({ corpus, corpusMedia, mount, page }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        const { chatId, messageIds } = await renameSpeakers(caller);
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { chatStyle, showInChatAvatars: true, backgroundImageKind: "none" } });
        await seedShellState(page, { activeSection: "chats" });
        await routeTrpc(page, {
          ...createShellAmbientReads(corpus, root.ownerId),
          ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
        });
        await corpusMedia();
        await mount<typeof ChatRoomShellStory>(STORY, { chatId });
        await setRootFontScale(page, channelName("fontScale"), ENLARGED_TEXT);

        for (const role of ROLES) {
          const header = await headerOf(page.locator(`${ROW}[data-message-id="${messageIds.get(role) ?? ""}"]`));
          // The name is long enough to need a second line, so the cell proves a wrapped name rather than one that happened to fit.
          await expect
            .poll(() => header.evaluate(headerGeometry, PARTS).then((geometry) => geometry.lines), { message: `${role} name wraps` })
            .toBeGreaterThan(1);
          await expect
            .poll(() => header.evaluate(headerGeometry, PARTS).then(({ rowGap, spill }) => ({ rowGap, spill })), {
              message: `${role} chip beside name, name spill`,
            })
            .toEqual({ rowGap: 0, spill: 0 });
        }
      });
    });
  },
);
