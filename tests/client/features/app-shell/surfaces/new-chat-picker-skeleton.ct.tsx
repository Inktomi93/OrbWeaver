// The New chat picker's skeleton holds the box of the picker that replaces it, so the dialog does not jump when the library arrives. Every cell is a
// device's first-ever open: no box is remembered yet, so the declared box is all the skeleton has. The library is longer than a page, so the picker's
// footer is there at load. A library with saved rosters adds a door row above the picker, so a cell with rosters opens on a device that has cached the
// roster list (the shell warms it at boot) and the declared box carries the row. A stacked or landscape dialog hides that row, and its declared box
// drops it again. A landscape phone's picker takes whatever room the dialog leaves, and at enlarged text its list stays a window the dialog scrolls past
// to Start rather than growing to the whole library.
import { BLANK_CHAT_NAME } from "@orb/client/lib";
import { LAYOUT_SUBPIXEL_PX, pressableWhole, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, holdCorpusProcedure, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { AppShellModalStory, AppShellWarmRostersNewChatStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellModalStory`;

const RESERVED = "[data-reserve-key]";
const COMMAND_ROOT = '[data-slot="command-root"]';
const LIST = "[cmdk-list]";
const ACTIONS = '[data-slot="new-chat-actions"]';
const DECLARED_BOX = `var(${TOKENS["height.picker-box"].cssVar})`;
const DECLARED_BOX_WITH_DOOR = `calc(${DECLARED_BOX} + var(${TOKENS["height.picker-door-row"].cssVar}))`;
const WARM_STORY = `${SHELL_STORIES}/AppShellWarmRostersNewChatStory`;
const REST_FACTOR = 3;

// Rosters are a library fact: a cell without them removes them, a cell with them opens warm. The stacked step (a dialog short and narrow in the container,
// reached by 300% text on a phone or a desktop) hides the door row, so the declared box must not carry it there.
const PORTRAIT_CASES = [
  { rosters: false, factor: 1 },
  { rosters: true, factor: 1 },
  { rosters: true, factor: 3 },
] as const;

// A landscape phone is the short regime at every text size, so each size is a cell there.
const LANDSCAPE_CASES = [
  { rosters: false, factor: 1 },
  { rosters: true, factor: 1 },
  { rosters: false, factor: 2 },
  { rosters: true, factor: 2 },
  { rosters: false, factor: 3 },
  { rosters: true, factor: 3 },
] as const;

const CELLS = [
  { name: "desktop", width: 1440, height: 900, coarse: false, cases: PORTRAIT_CASES },
  { name: "coarse portrait", width: 390, height: 844, coarse: true, cases: PORTRAIT_CASES },
  { name: "coarse landscape", width: 844, height: 390, coarse: true, cases: LANDSCAPE_CASES },
  { name: "coarse small landscape", width: 568, height: 320, coarse: true, cases: LANDSCAPE_CASES },
  // A short desktop window at enlarged text is a tiny dialog with a fine pointer and no landscape regime; a wide one keeps the door row in the box.
  {
    name: "short desktop",
    width: 1440,
    height: 560,
    coarse: false,
    cases: [
      { rosters: false, factor: 3 },
      { rosters: true, factor: 3 },
    ],
  },
  {
    name: "wide short desktop",
    width: 1920,
    height: 480,
    coarse: false,
    cases: [
      { rosters: false, factor: 2 },
      { rosters: true, factor: 2 },
    ],
  },
] as const;

for (const cell of CELLS) {
  for (const { rosters, factor } of cell.cases) {
    test.describe(`on a ${cell.name} screen at ${String(factor * 100)}% text, ${rosters ? "with" : "without"} saved rosters`, () => {
      test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.coarse, isMobile: cell.coarse });

      test("the dialog and the picker keep their height from the skeleton to the list", async ({ corpus, mount, page }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        if (!rosters) {
          for (const roster of await caller.rosterPreset.list()) {
            await caller.rosterPreset.remove({ presetId: roster.id });
          }
        }
        const held = holdCorpusProcedure(caller, "character.list");
        await routeTrpc(page, {
          ...createShellAmbientReads(corpus, root.ownerId),
          ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
          ...held.routes,
        });
        await seedShellState(page, { activeSection: "chats" });
        if (rosters) {
          await mount<typeof AppShellWarmRostersNewChatStory>(WARM_STORY);
        } else {
          await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
        }
        await held.requested;
        const dialog = page.getByRole("dialog");
        await expect(dialog.locator(RESERVED)).toBeVisible();
        await expect(dialog.locator(RESERVED)).toHaveAttribute("data-tile-reserved", rosters ? DECLARED_BOX_WITH_DOOR : DECLARED_BOX);
        await setRootFontScale(page, channelName("fontScale"), factor);
        const skeleton = { box: await dialog.locator(RESERVED).boundingBox(), popup: await dialog.boundingBox() };
        held.release();
        await expect(dialog.locator(COMMAND_ROOT)).toBeVisible();
        // The boundary's settled box holds the picker and the row above it, so that is what the reserved box stands in for.
        const loaded = { box: await dialog.locator(COMMAND_ROOT).locator("xpath=..").boundingBox(), popup: await dialog.boundingBox() };
        expect(
          Math.abs((loaded.box?.height ?? 0) - (skeleton.box?.height ?? 0)),
          `the skeleton held ${String(skeleton.box?.height)}px and the picker ${String(loaded.box?.height)}px`,
        ).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
        expect(
          Math.abs((loaded.popup?.height ?? 0) - (skeleton.popup?.height ?? 0)),
          `the dialog went from ${String(skeleton.popup?.height)}px to ${String(loaded.popup?.height)}px`,
        ).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      });

      test("the list is a window onto the library and Start scrolls onto the screen", async ({ corpus, mount, page }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        if (!rosters) {
          for (const roster of await caller.rosterPreset.list()) {
            await caller.rosterPreset.remove({ presetId: roster.id });
          }
        }
        await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
        await seedShellState(page, { activeSection: "chats" });
        if (rosters) {
          await mount<typeof AppShellWarmRostersNewChatStory>(WARM_STORY);
        } else {
          await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
        }
        const dialog = page.getByRole("dialog");
        await setRootFontScale(page, channelName("fontScale"), factor);
        await expect(dialog.getByRole("option").first()).toBeVisible();
        const screenHeight = page.viewportSize()?.height ?? 0;
        const list = await dialog.locator(LIST).boundingBox();
        expect(
          list?.height ?? Number.POSITIVE_INFINITY,
          `the list is ${String(list?.height)}px tall on a ${String(screenHeight)}px screen`,
        ).toBeLessThanOrEqual(screenHeight);
        const start = dialog.locator(ACTIONS).getByRole("button").last();
        await start.scrollIntoViewIfNeeded();
        const startBox = await start.boundingBox();
        expect(startBox?.y ?? Number.NaN, "Start's top is on the screen").toBeGreaterThanOrEqual(0);
        expect((startBox?.y ?? Number.NaN) + (startBox?.height ?? Number.NaN), "Start's bottom is on the screen").toBeLessThanOrEqual(screenHeight);
      });
    });
  }
}

// At 300% text on common phones and the common desktop, the dialog at rest shows a whole character row and Blank chat, and a press on either lands on
// it: the pinned row never lies over the row it leaves room for.
const REST_CELLS = [
  { name: "390x844", width: 390, height: 844, coarse: true },
  { name: "393x873", width: 393, height: 873, coarse: true },
  { name: "1280x800", width: 1280, height: 800, coarse: false },
] as const;

for (const cell of REST_CELLS) {
  for (const rosters of [false, true]) {
    test.describe(`at rest on a ${cell.name} screen at 300% text, ${rosters ? "with" : "without"} saved rosters`, () => {
      test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.coarse, isMobile: cell.coarse });

      test("a whole row and Blank chat are both on screen and each takes its own press", async ({ corpus, mount, page }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        if (!rosters) {
          for (const roster of await caller.rosterPreset.list()) {
            await caller.rosterPreset.remove({ presetId: roster.id });
          }
        }
        await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
        await seedShellState(page, { activeSection: "chats" });
        if (rosters) {
          await mount<typeof AppShellWarmRostersNewChatStory>(WARM_STORY);
        } else {
          await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
        }
        const dialog = page.getByRole("dialog");
        await setRootFontScale(page, channelName("fontScale"), REST_FACTOR);
        const row = dialog.getByRole("option").first();
        await expect(row).toBeVisible();
        const blank = dialog.getByRole("button", { name: BLANK_CHAT_NAME, exact: true });
        await expect.poll(() => pressableWhole(row), "the first row is whole and takes its own press").toBe(true);
        await expect.poll(() => pressableWhole(blank), "Blank chat is whole and takes its own press").toBe(true);
      });
    });
  }
}
