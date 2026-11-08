// The persona switcher with a room open, on the production shell: the head reads label-then-name, the room block's two
// doors share a start edge, and a phone's persona rows stay at the touch floor instead of adding an inset on top of it.

import type { ChatId } from "@orb/kit/ids";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import type { AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import { namedGroupRoom, PHONE, routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const STORY = `${SHELL_STORIES}/AppShellStory`;
const DESKTOP = { width: 1440, height: 900 } as const;
const RESTAMP_DOOR = "Restamp my messages to this persona";
const MANAGE_DOOR = "Manage personas in Settings";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** Serve the corpus room and return what the test mounts and reads: the room, and the name of the viewer's seat persona there. */
async function serveRoom(page: Page, corpus: CorpusPlayback): Promise<{ readonly chatId: ChatId; readonly seatName: string }> {
  const caller = await root.internalCallerFor(root.ownerId);
  const room = namedGroupRoom((await caller.chat.listChats({ limit: 100 })).items);
  const detail = await caller.chat.getChat({ chatId: room.id });
  const seat = (await caller.persona.list()).find((persona) => persona.id === detail.viewerActivePersonaId);
  if (seat === undefined) {
    throw new Error("The corpus viewer has no seat persona in the room");
  }
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  await routeRoom(page, corpus, caller);
  return { chatId: room.id, seatName: seat.name };
}

function iconLeft(button: Locator): Promise<number> {
  return button
    .locator("svg")
    .first()
    .evaluate((icon) => icon.getBoundingClientRect().left);
}

test.describe("on a desktop", () => {
  test.use({ viewport: DESKTOP });

  test("the head puts its label above the persona's name and both room doors start at one edge", async ({ corpus, mount, page }) => {
    const { chatId, seatName } = await serveRoom(page, corpus);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId });
    await page
      .locator(".shell-rail-actions")
      .getByRole("button", { name: `Playing as ${seatName}`, exact: true })
      .click();
    const popup = page.getByRole("dialog", { name: "Account & personas", exact: true });
    const head = popup.locator('[data-slot="persona-who-head"]');
    const label = (await head.getByText("Playing as", { exact: true }).boundingBox())?.y ?? Number.NaN;
    const heading = (await head.getByText(seatName, { exact: true }).boundingBox())?.y ?? Number.NaN;
    expect(label).toBeLessThan(heading);

    const restamp = popup.getByRole("button", { name: RESTAMP_DOOR });
    const manage = popup.getByRole("button", { name: MANAGE_DOOR, exact: true });
    expect(await iconLeft(restamp)).toBeCloseTo(await iconLeft(manage), 0);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test("the You sheet's persona rows are the touch floor tall, with no inset stacked on it", async ({ corpus, mount, page }) => {
    await routeRoom(page, corpus, await root.internalCallerFor(root.ownerId));
    await mount<typeof AppShellStory>(STORY, {});
    await page.locator(".shell-rail").getByRole("button", { name: "You", exact: true }).click();
    const rows = page.locator('[data-slot="drawer-popup"] [data-slot="persona-switch-row"]');
    await expect(rows.first()).toBeVisible();
    const floor = await resolvedLength(page, `var(${TOKENS["size.control-md"].cssVar})`);

    expect(await rows.first().evaluate((row) => row.getBoundingClientRect().height)).toBeCloseTo(floor, 0);
  });
});
