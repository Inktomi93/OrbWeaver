// @subject packages/client/src/features/chat/components/home-quick-picks-tile-body.tsx
// Home's Start with tile states an empty character library by where it stands: at shelf weight on the shelf (a label line,
// its door and a gloss, no centred island) while the house has a room, and as the pane's empty state in the hearth while it
// has none (UI-Density-Law §3.3).

import { QUICK_PICKS_TILE_ID } from "@orb/client/state";
import { HOME_QUICK_PICKS_LIMIT } from "@orb/contracts/character";
import { HOME_RECENT_CHATS_LIMIT } from "@orb/contracts/chat";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { HOME_QUICK_PICKS_CREATE_NAME, HOME_QUICK_PICKS_EMPTY_TITLE } from "#client/features/chat/lib/chat-surface-names.ts";
import type { HomeGridRefStory } from "./_grid-ref-stories.tsx";

const SHELF = "[data-home-shelf]";
const EMPTY_STATE = '[data-slot="empty-state-root"]';
const STORY = "tests/client/features/home/surfaces/_grid-ref-stories/HomeGridRefStory";

test("with a room and no character, the tile states its emptiness at shelf weight on the shelf", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const characters = await caller.character.list({ limit: HOME_QUICK_PICKS_LIMIT });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "chat.getChat"]),
    "character.list": (input) => {
      expect(input).toEqual({ limit: HOME_QUICK_PICKS_LIMIT });
      return { ...characters, items: [], totalCount: 0 };
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount<typeof HomeGridRefStory>(STORY, { width: 1440 });
  const tile = page.locator(`${SHELF} [data-home-tile="${QUICK_PICKS_TILE_ID}"]`);
  await expect(tile.getByText(HOME_QUICK_PICKS_EMPTY_TITLE, { exact: true })).toBeVisible();
  await expect(tile.getByRole("button", { name: HOME_QUICK_PICKS_CREATE_NAME, exact: true })).toBeVisible();
  await expect(tile.locator(EMPTY_STATE)).toHaveCount(0);
});

test("with no room and no character, the tile draws the empty state in the hearth", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const characters = await caller.character.list({ limit: HOME_QUICK_PICKS_LIMIT });
  const rooms = await caller.chat.listChats({ limit: HOME_RECENT_CHATS_LIMIT });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "chat.getChat"]),
    "character.list": (input) => {
      expect(input).toEqual({ limit: HOME_QUICK_PICKS_LIMIT });
      return { ...characters, items: [], totalCount: 0 };
    },
    "chat.listChats": (input) => {
      expect(input).toEqual({ limit: HOME_RECENT_CHATS_LIMIT });
      return { ...rooms, items: [], totalCount: 0 };
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount<typeof HomeGridRefStory>(STORY, { width: 1440 });
  const tile = page.locator(`[data-home-tile="${QUICK_PICKS_TILE_ID}"]`);
  await expect(tile.locator(EMPTY_STATE)).toBeVisible();
  await expect(tile.getByText(HOME_QUICK_PICKS_EMPTY_TITLE, { exact: true })).toBeVisible();
  await expect(tile.getByRole("button", { name: HOME_QUICK_PICKS_CREATE_NAME, exact: true })).toBeVisible();
  await expect(page.locator(`${SHELF} [data-home-tile="${QUICK_PICKS_TILE_ID}"]`)).toHaveCount(0);
});
