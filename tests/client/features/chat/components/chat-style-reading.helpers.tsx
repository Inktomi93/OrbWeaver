import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";

export const TAIL_MESSAGES = 6;
export const READING_ROLES = ["user", "assistant"] as const;
const LONG_REPLY_PARAGRAPHS = 40;
const PIN_SCROLL_PX = 400;
const GAME_PROCEDURES = ["rpg.getGame", "rpg.listTurnToolCalls"] as const;
const FILLER = "The lamp burned low while the rain kept time on the shutters.";

export interface ReadingRoom {
  readonly root: Awaited<ReturnType<typeof createCorpusHarness>>;
  readonly roomId: ChatId;
  readonly longReplyId: MessageId;
  readonly longUserId: MessageId;
}

/** Extends actual room messages so the same speakers cross the sticky reading boundary in each suite. */
export async function createReadingRoom(): Promise<ReadingRoom> {
  const root = await createCorpusHarness();
  try {
    const caller = await root.internalCallerFor(root.ownerId);
    for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
      const { messages } = await caller.chat.listMessages({ chatId: row.id, limit: TAIL_MESSAGES });
      const replies = messages.filter((message) => message.role === "assistant");
      const spoken = new Set(messages.map((message) => message.role));
      const earlier = replies.at(-2);
      if (READING_ROLES.every((role) => spoken.has(role)) && messages.at(-1)?.role === "assistant" && earlier !== undefined) {
        const roomId = row.id;
        const longReplyId = earlier.id;
        const user = messages.findLast((message) => message.role === "user");
        if (user === undefined) {
          throw new Error("The corpus room has no user message");
        }
        const longUserId = user.id;
        const content = Array.from({ length: LONG_REPLY_PARAGRAPHS }, () => FILLER).join("\n\n");
        await caller.chat.editMessage({ chatId: row.id, messageId: user.id, content, timeZone: UTC_TIME_ZONE });
        await caller.chat.editMessage({ chatId: row.id, messageId: earlier.id, content, timeZone: UTC_TIME_ZONE });
        return { root, roomId, longReplyId, longUserId };
      }
    }
    throw new Error("No corpus room ends on a reply with an earlier reply and both roles in its tail");
  } catch (error) {
    await root[Symbol.asyncDispose]();
    throw error;
  }
}

/** The corpus viewer's first saved wallpaper, as the appearance fields that select it. */
function wallpaper(corpus: CorpusWire): Partial<AppearanceSettings> {
  const library = appearanceSettingsSchema.parse({
    backgroundLibrary: corpus.reads["settings.getUserSettings"][0]?.output.config.appearance.backgroundLibrary,
  }).backgroundLibrary;
  const entry = library[0];
  if (entry === undefined) {
    throw new Error("The corpus viewer has no saved wallpaper");
  }
  return {
    backgroundLibrary: library,
    backgroundImageKind: "asset",
    backgroundAssetId: entry.assetId,
    backgroundAssetHash: entry.assetHash,
    backgroundAssetMime: entry.mime,
  };
}

/** Open the room in `chatStyle`, over a wallpaper or not, at the glow elevation, which lifts every card that follows it. */
export async function openReadingRoom(
  page: Page,
  corpus: CorpusWire,
  root: ReadingRoom["root"],
  { chatStyle, art }: { readonly chatStyle: ThemeChatStyle; readonly art: boolean },
): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await caller.settings.updateUserSettingsSection({
    section: "appearance",
    patch: {
      ...appearanceSettingsSchema.parse({}),
      chatStyle,
      elevation: "glow",
      blurSurfaces: [],
      showInChatAvatars: true,
      messageActions: "hover",
      ...(art ? wallpaper(corpus) : { backgroundImageKind: "none" }),
    },
  });
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...GAME_PROCEDURES]),
  });
}

/** A colour token as `box`'s own scope paints it, read off a probe beside it, so a carried palette resolves alike. */
export function tokenColor(box: Locator, token: string, property: "background-color" | "color"): Promise<string> {
  return box.evaluate(
    (element, [name, prop]) => {
      const probe = element.ownerDocument.createElement("div");
      probe.style.setProperty(prop, `var(${name})`);
      element.parentElement?.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    [token, property] as const,
  );
}

/** Scrolls into the real message, then barriers on its observed pin state. */
export async function scrollIntoReadingMessage(row: Locator, sticky = true): Promise<void> {
  await row.evaluate((element, by) => {
    const scroller = element.closest('[data-slot="message-list-scroll"]');
    if (scroller === null) {
      throw new Error("The message has no transcript scrollport");
    }
    scroller.scrollTop += element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + by;
  }, PIN_SCROLL_PX);
  await expect.poll(() => row.locator('[data-slot="message-name-row"]').getAttribute("data-pinned")).toBe(sticky ? "" : null);
}

/** Native scroll input gives the reader the axis before the targeted reading-position drive. */
export async function beginReading(page: Page, scrollport: Locator): Promise<void> {
  const before = await scrollport.evaluate((element) => element.scrollTop);
  await scrollport.hover();
  await page.mouse.wheel(0, -PIN_SCROLL_PX);
  await expect.poll(() => scrollport.evaluate((element) => element.scrollTop)).toBeLessThan(before);
}
