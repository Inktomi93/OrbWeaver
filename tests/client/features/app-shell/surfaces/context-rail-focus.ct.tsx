// @subject packages/client/src/features/app-shell/components/context-rail.tsx
// The game state rail's overflow fade paints over its cells, so a cell the keyboard moves to scrolls clear of the fade.

import { contextToggleLabel, GAME_STRIP_LABEL } from "@orb/client/lib";
import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { AppShellRoomStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const GAME_PROCEDURES = [
  ...SECTION_PROCEDURES,
  ...ROOM_PROCEDURES,
  "rpg.getGame",
  "rpg.listTurnToolCalls",
  "rpg.getTrackerView",
  "rpg.getConfigView",
  "rpg.listJournal",
  "rpg.revealHidden",
] as const;
// A docked context pane narrow enough that the rail's cells overflow it.
const VIEWPORT = { width: 1024, height: 800 } as const;
// Layout boxes land on fractional pixels; a ring this close to the fade still reads as clear of it.
const EDGE_TOLERANCE_PX = 0.5;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
let gameRoomId: ChatId;

test.use({ viewport: VIEWPORT });

test.beforeAll(async () => {
  root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  gameRoomId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId: gameRoomId, mode: "lite", ruleset: "d20" });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** How far the focused cell's box reaches under each visible fade; zero when it is clear of both. */
async function reachUnderFades(rail: Locator, cell: Locator): Promise<number> {
  const box = await cell.boundingBox();
  if (box === null) {
    throw new Error("The focused cell has no box");
  }
  let reach = 0;
  for (const fade of await rail.locator('[data-slot="context-rail-fade"]').all()) {
    const fadeBox = await fade.boundingBox();
    const edge = await fade.getAttribute("data-edge");
    if (fadeBox !== null) {
      reach = Math.max(reach, edge === "end" ? box.x + box.width - fadeBox.x : fadeBox.x + fadeBox.width - box.x);
    }
  }
  return reach;
}

test("a cell reached by the keyboard sits clear of the rail's overflow fade", async ({ corpus, mount, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), GAME_PROCEDURES);
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "docked" } } });
  await mount<typeof AppShellRoomStory>(`${SHELL_STORIES}/AppShellRoomStory`, { chatId: gameRoomId });
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  const rail = page.locator('[data-slot="context-rail"]');
  const cells = rail.getByRole("toolbar", { name: GAME_STRIP_LABEL, exact: true }).getByRole("button");
  await expect(cells.first()).toBeVisible();
  await expect(rail, "the rail must overflow for its fade to show").toHaveAttribute("data-overflow-end", "true");
  await cells.first().focus();
  const count = await cells.count();
  let checked = 0;
  for (let index = 1; index < count; index += 1) {
    await page.keyboard.press("ArrowRight");
    const cell = cells.nth(index);
    await expect(cell).toBeFocused();
    await expect.poll(() => reachUnderFades(rail, cell), { message: `cell ${String(index)} reaches under a fade` }).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
    checked += 1;
  }
  for (let index = count - 2; index >= 0; index -= 1) {
    await page.keyboard.press("ArrowLeft");
    const cell = cells.nth(index);
    await expect(cell).toBeFocused();
    await expect.poll(() => reachUnderFades(rail, cell), { message: `cell ${String(index)} reaches under a fade` }).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
    checked += 1;
  }
  expect(checked).toBe(2 * (count - 1));
});
