// A box 24rem tall or less has one scroller: a picker's list takes what its dialog's chrome leaves and nothing nests inside it.
// Layer: CT. Production entry: the AppShell opening the registered `newChat` and `command` modals over the corpus root's own reads.
import { resolvedLength, seedShellState, settledBox } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, holdCorpusProcedure, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { CHAT_SAVED_ROSTER_DOOR_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellModalStory } from "./_app-shell-stories.tsx";
import { expectLandscapeRegime, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellModalStory`;
const LIST = "[cmdk-list]";
const ROW = "[cmdk-item]";
const COMMAND_ROOT = '[data-slot="command-root"]';
const ACTIONS = '[data-slot="new-chat-actions"]';
const RESERVED = "[data-reserve-key]";
const GEOMETRY_EPSILON = 1;
/** Upload, Paste and Link. */
const ADD_DOCUMENT_ARMS = 3;
/** "Several": the window shows this many whole rows before the dialog asks anything of the reader. */
const SEVERAL_ROWS = 3;

interface PickerGeometry {
  /** Elements inside the popup, the popup itself included, that scroll and have something to scroll to. */
  readonly scrollers: readonly string[];
  readonly list: { readonly client: number; readonly scroll: number };
  readonly wholeRows: number;
  readonly commandBottom: number;
  readonly actionsTop: number;
}

/** Every element in the dialog, its popup included, that scrolls and has something to scroll to. */
async function scrollersOf(page: Page): Promise<readonly string[]> {
  return await page
    .getByRole("dialog")
    .evaluate(
      (popup, epsilon) =>
        [popup, ...popup.querySelectorAll("*")]
          .filter((element) => /auto|scroll/u.test(getComputedStyle(element).overflowY) && element.scrollHeight - element.clientHeight > epsilon)
          .map((element) => element.getAttribute("data-slot") ?? element.tagName.toLowerCase()),
      GEOMETRY_EPSILON,
    );
}

async function geometry(page: Page): Promise<PickerGeometry> {
  return await page.getByRole("dialog").evaluate(
    (popup, selectors) => {
      const find = (selector: string): HTMLElement => {
        const found = popup.querySelector(selector);
        if (found instanceof HTMLElement) {
          return found;
        }
        throw new Error(`The New chat picker must mount ${selector}`);
      };
      const list = find(selectors.list);
      const scrollers = [popup, ...popup.querySelectorAll("*")]
        .filter((element) => /auto|scroll/u.test(getComputedStyle(element).overflowY) && element.scrollHeight - element.clientHeight > selectors.epsilon)
        .map((element) => element.getAttribute("data-slot") ?? element.tagName.toLowerCase());
      const window = list.getBoundingClientRect();
      const wholeRows = [...list.querySelectorAll(selectors.row)].filter((row) => {
        const box = row.getBoundingClientRect();
        return box.top >= window.top - selectors.epsilon && box.bottom <= window.bottom + selectors.epsilon;
      }).length;
      return {
        scrollers,
        list: { client: list.clientHeight, scroll: list.scrollHeight },
        wholeRows,
        commandBottom: find(selectors.command).getBoundingClientRect().bottom,
        actionsTop: find(selectors.actions).getBoundingClientRect().top,
      };
    },
    { list: LIST, row: ROW, command: COMMAND_ROOT, actions: ACTIONS, epsilon: GEOMETRY_EPSILON },
  );
}

test.describe("coarse landscape", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("the New chat picker shows several rows in one scroller, with its action row below the search card", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(ROW).first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: CHAT_SAVED_ROSTER_DOOR_NAME, exact: true }).first()).toBeAttached();
    await expectLandscapeRegime(dialog, "New chat", true);
    const found = await geometry(page);
    await test.info().attach("short-picker-geometry", { body: JSON.stringify(found), contentType: "application/json" });
    // The library is longer than the window, so the list has something to scroll: the absence below is not vacuous.
    expect(found.list.scroll).toBeGreaterThan(found.list.client + GEOMETRY_EPSILON);
    expect(found.scrollers).toEqual(["command-list"]);
    expect(found.wholeRows).toBeGreaterThanOrEqual(SEVERAL_ROWS);
    expect(found.actionsTop).toBeGreaterThanOrEqual(found.commandBottom - GEOMETRY_EPSILON);
  });
});

test.describe("coarse small landscape, stacked", () => {
  test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

  test("the saved-roster door is in one place, below the pinned Start", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(ROW).first()).toBeVisible();
    await expectLandscapeRegime(dialog, "New chat", true);
    const door = dialog.getByRole("button", { name: CHAT_SAVED_ROSTER_DOOR_NAME, exact: true });
    await expect(door).toHaveCount(1);
    await expect(door).toBeVisible();
    const doorBox = await door.boundingBox();
    const pinnedBox = await dialog.locator(ACTIONS).boundingBox();
    expect(doorBox?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(
      (pinnedBox?.y ?? Number.POSITIVE_INFINITY) + (pinnedBox?.height ?? 0) - GEOMETRY_EPSILON,
    );
  });
});

for (const viewport of [
  { width: 844, height: 390 },
  { width: 568, height: 320 },
] as const) {
  test.describe(`Add document at ${String(viewport.width)}x${String(viewport.height)}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("every arm is one scroller: its dialog body, with nothing nested inside", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellModalStory>(STORY, { modalId: "addDocument" });
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("button[aria-pressed]").first()).toBeVisible();
      // The mode strip is the row of pressable modes directly above the region the arms swap through.
      const modes = await dialog.locator("button[aria-pressed]").evaluateAll((buttons) => {
        const strip = buttons.at(-1)?.parentElement;
        return buttons.filter((button) => button.parentElement === strip).map((button) => button.textContent);
      });
      expect(modes).toHaveLength(ADD_DOCUMENT_ARMS);
      for (const label of modes) {
        await dialog.getByRole("button", { name: label, exact: true }).click();
        await expect(dialog.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
        // A scroller counts only with something to scroll, so exactly one is the body doing its job and nothing nested in it.
        expect(await scrollersOf(page)).toHaveLength(1);
      }
    });
  });
}

for (const regime of [
  { name: "coarse portrait", viewport: { width: 390, height: 844 }, coarse: true },
  { name: "desktop", viewport: { width: 1440, height: 900 }, coarse: false },
] as const) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });

    test("the New chat picker keeps the token window for its list", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(ROW).first()).toBeVisible();
      await expectLandscapeRegime(dialog, "New chat", false);
      const found = await geometry(page);
      const window = await resolvedLength(page, `var(${TOKENS["height.picker-window"].cssVar})`, dialog);
      expect(found.list.scroll).toBeGreaterThan(found.list.client + GEOMETRY_EPSILON);
      expect(found.scrollers).toEqual(["command-list"]);
      expect(Math.abs(found.list.client - window)).toBeLessThanOrEqual(GEOMETRY_EPSILON);
    });
  });
}

for (const regime of [
  { name: "coarse portrait", viewport: { width: 390, height: 844 }, coarse: true },
  { name: "desktop", viewport: { width: 1440, height: 900 }, coarse: false },
] as const) {
  test.describe(`${regime.name} with no saved rosters while the library loads`, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });

    test("the New chat dialog holds its height when the picker replaces its skeleton", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      for (const roster of await caller.rosterPreset.list()) {
        await caller.rosterPreset.remove({ presetId: roster.id });
      }
      const held = holdCorpusProcedure(caller, "character.list");
      await routeTrpc(page, {
        ...createShellAmbientReads(corpus, root.ownerId),
        ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
        ...held.routes,
      });
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
      await held.requested;
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(RESERVED)).toBeVisible();
      const skeleton = await settledBox(dialog);
      held.release();
      await expect(dialog.locator(ROW).first()).toBeVisible();
      const loaded = await settledBox(dialog);
      expect(
        Math.abs(loaded.height - skeleton.height),
        `the skeleton held ${String(skeleton.height)}px and the loaded picker ${String(loaded.height)}px`,
      ).toBeLessThanOrEqual(GEOMETRY_EPSILON);
    });
  });
}

test.describe("coarse landscape focus ring", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("the New chat rows stay clear of the command box's focus ring", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(ROW).first()).toBeVisible();
    await expect(dialog.getByRole("combobox")).toBeFocused();
    const ring = await resolvedLength(page, `var(${TOKENS["border-width.rule"].cssVar})`, dialog);
    const band = await dialog.locator(COMMAND_ROOT).evaluate(
      (commandBox, probe) => {
        const box = commandBox.getBoundingClientRect();
        const edge = commandBox.clientLeft + probe.ring;
        const rows = [...commandBox.querySelectorAll(probe.row)].map((row) => row.getBoundingClientRect());
        const list = commandBox.querySelector(probe.list)?.getBoundingClientRect();
        return {
          leftIntrusion: Math.max(0, ...rows.map((row) => box.left + edge - row.left)),
          rightIntrusion: Math.max(0, ...rows.map((row) => row.right - (box.right - edge))),
          bottomIntrusion: list === undefined ? Number.POSITIVE_INFINITY : list.bottom - (box.bottom - edge),
          rows: rows.length,
        };
      },
      { ring, row: ROW, list: LIST },
    );
    expect(band.rows).toBeGreaterThan(0);
    expect(band.leftIntrusion).toBeLessThanOrEqual(GEOMETRY_EPSILON);
    expect(band.rightIntrusion).toBeLessThanOrEqual(GEOMETRY_EPSILON);
    expect(band.bottomIntrusion).toBeLessThanOrEqual(GEOMETRY_EPSILON);
  });
});

for (const regime of [
  { name: "coarse landscape", viewport: { width: 844, height: 390 } },
  { name: "coarse small landscape", viewport: { width: 568, height: 320 } },
] as const) {
  test.describe(`${regime.name} dialogs`, () => {
    test.use({ viewport: regime.viewport, hasTouch: true, isMobile: true });

    test("the command palette is one scroller", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellModalStory>(STORY, { modalId: "command" });
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(ROW).first()).toBeVisible();
      // Exactly one: none would mean nothing in the palette is reachable by scrolling, two means one nests inside the other.
      expect(await scrollersOf(page)).toHaveLength(1);
    });
  });
}
