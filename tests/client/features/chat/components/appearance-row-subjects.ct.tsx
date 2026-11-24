// Every chat-surface appearance invariant row names subjects the production transcript actually renders.
// The rated matrix judges these selectors on a live stage; a selector that no settled transcript can match
// leaves its cell with no verdict and stops every later cell. Here the production shell mounts a corpus room
// in the row's own chat style and each subject selector must find a rendered node.

import type { AppearanceSettings } from "@orb/contracts/settings";
import type { AppearanceHistoricalRow } from "@orb/kit/appearance-manifest";
import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { APPEARANCE_HISTORICAL_ROWS } from "#client/lib/appearance-invariant-manifest.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROOM_MESSAGES = 3;
const VIEWPORT = { width: 1440, height: 900 } as const;

/** The appearance each chat row is judged under in the matrix's own required assignment: the chat style that
 *  decides the row's header anatomy, plus the switch that mounts a subject the row names. Null for a row whose
 *  surface is not the transcript. */
const ROW_APPEARANCE: Record<AppearanceHistoricalRow["id"], Partial<AppearanceSettings> | null> = {
  "compact-portal-carried": null,
  "dark-name-time-short-bubble": { chatStyle: "bubble", showTimestamps: true },
  "light-art-scrim-glass-elevation": null,
  "mobile-compact-large-document": { chatStyle: "document" },
  "hover-pointer": { chatStyle: "bubble", messageActions: "hover" },
  "density-preview": null,
  "opposite-os-app-prepaint": null,
};

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
let roomId: ChatId;

test.beforeAll(async () => {
  root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: room.id, limit: ROOM_MESSAGES });
    if (messages.length === ROOM_MESSAGES) {
      roomId = room.id;
      return;
    }
  }
  throw new Error(`Corpus needs a room with at least ${String(ROOM_MESSAGES)} messages`);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

forEachNonEmpty(
  APPEARANCE_HISTORICAL_ROWS.filter((row) => row.surface === "chat"),
  "chat appearance invariant rows",
  (row) => {
    test(`${row.id}: every subject the row judges renders in the settled transcript`, async ({ corpus, mount, page }) => {
      const appearance = ROW_APPEARANCE[row.id];
      if (appearance === null) {
        throw new Error(`${row.id} is a chat row with no transcript appearance in ROW_APPEARANCE`);
      }
      await page.setViewportSize(VIEWPORT);
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { backgroundImageKind: "none", ...appearance } });
      await seedShellState(page, { activeSection: "chats" });
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
      });
      await mount<typeof ChatRoomShellStory>(STORY, { chatId: roomId });
      await expect(page.locator('[data-slot="message-list-scroll"]')).toBeVisible();
      for (const subject of row.subjects) {
        await expect.poll(async () => await page.locator(subject.selector).count(), `${row.id} subject ${subject.id}: ${subject.selector}`).toBeGreaterThan(0);
      }
    });
  },
);
