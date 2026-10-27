import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

export const TAIL_MESSAGES = 6;
export const READING_ROLES = ["user", "assistant"] as const;
const LONG_REPLY_PARAGRAPHS = 40;
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
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...GAME_PROCEDURES]),
  });
}
