// Earlier messages has one home, the transcript's scroll content, in every regime and chat style. Pressing it keeps the
// reader's row exactly where it was, on rows far shorter than their estimate: the case that loses a late-mounted row's delta.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState, settledBox } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusHarness, createCorpusProviderExecution } from "@orb/testkit/node/composed";
import { CHAT_EARLIER_MESSAGES_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { PHONE, routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const WITNESS_ROWS = 115;
const DESKTOP = { width: 1280, height: 900 } as const;
const LANDSCAPE_PHONE = { width: 844, height: 390 } as const;

interface Cell {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly chatStyle: ThemeChatStyle;
  readonly coarse: boolean;
}

const CELLS: readonly Cell[] = [
  ...THEME_CHAT_STYLES.map((chatStyle) => ({ viewport: PHONE, chatStyle, coarse: true })),
  { viewport: DESKTOP, chatStyle: "document", coarse: false },
  { viewport: DESKTOP, chatStyle: "flat", coarse: false },
  { viewport: LANDSCAPE_PHONE, chatStyle: "document", coarse: true },
];

type Caller = Awaited<ReturnType<Awaited<ReturnType<typeof createCorpusHarness>>["internalCallerFor"]>>;

/** A room paged with one-sentence rows in `chatStyle`, and the oldest row its first page shows. */
async function preparePagedRoom(caller: Caller, chatStyle: ThemeChatStyle): Promise<{ readonly chatId: ChatId; readonly oldestShown: MessageId }> {
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus has no room");
  }
  for (let index = 0; index < WITNESS_ROWS; index++) {
    await caller.chat.commitMessage({
      chatId: room.id,
      content: `History pager witness ${index + 1}. The observatory lantern burns through the rain.`,
      timeZone: UTC_TIME_ZONE,
    });
  }
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({ chatStyle, backgroundImageKind: "none" }) });
  const oldest = (await caller.chat.listMessages({ chatId: room.id })).messages[0];
  if (oldest === undefined) {
    throw new Error("The room's tail is empty");
  }
  return { chatId: room.id, oldestShown: oldest.id };
}

for (const cell of CELLS) {
  test.describe(`${String(cell.viewport.width)}x${String(cell.viewport.height)} ${cell.chatStyle}`, () => {
    test.use({ viewport: cell.viewport, hasTouch: cell.coarse, isMobile: cell.coarse });

    test("Earlier messages renders once, inside the transcript, and a press moves the reader's row by nothing", async ({ corpus, mount, page }) => {
      const provider = createCorpusProviderExecution({
        modelIds: [CORPUS_EMBED_MODEL],
        embedding: CORPUS_EMBEDDING_VECTOR,
        chatText: "",
        structuredReplies: new Map(),
        images: [],
      });
      await using root = await createCorpusHarness(undefined, { providerFetch: provider.execute });
      const caller = await root.internalCallerFor(root.ownerId);
      const { chatId, oldestShown } = await preparePagedRoom(caller, cell.chatStyle);
      await routeShell(page, corpus, caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "chat.listMessageVariants", "rpg.getGame", "rpg.listTurnToolCalls"]);
      await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
      const list = page.locator('[data-slot="message-list-scroll"]');
      const earlier = list.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true, includeHidden: true });
      await expect(earlier).toBeAttached();
      await expect(page.getByRole("button", { name: CHAT_EARLIER_MESSAGES_NAME, exact: true, includeHidden: true })).toHaveCount(1);
      await expect(earlier).not.toBeInViewport();
      await list.evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect(earlier).toBeInViewport({ ratio: 1 });
      const reading = list.locator(`[data-slot="message-row"][data-message-id="${oldestShown}"]`);
      const before = await settledBox(reading);
      await earlier.click();
      await expect(list.locator(`[data-slot="message-list-row"]:has([data-message-id="${oldestShown}"])`)).not.toHaveAttribute("data-index", "0");
      const after = await settledBox(reading);
      await test.info().attach("anchor-shift", { body: JSON.stringify({ before: before.y, after: after.y }), contentType: "application/json" });
      expect(after.y - before.y).toBe(0);
    });
  });
}
