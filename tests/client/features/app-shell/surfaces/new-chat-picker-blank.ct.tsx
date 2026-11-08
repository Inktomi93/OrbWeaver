// Blank chat is the way to start a room without a character. Where the dialog's height holds the pinned row with Blank chat and Start over one whole
// row of the list, Blank chat is pinned and on screen the moment New chat opens, at any text size. Where it does not, Blank chat follows Start, and the
// pinned row says it is below while the first row stays whole.

import { BLANK_CHAT_NAME } from "@orb/client/lib";
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHAT_MORE_BELOW_CUE } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellModalStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const ACTIONS = '[data-slot="new-chat-actions"]';

// The 1280x720 desktop at 300% is 15rem tall but wide, so its two actions share one line and fit (primitives.css, `dialog-stacked-cramped`).
const PINNED_CELLS = [
  { name: "phone at 100%", width: 390, height: 844, touch: true, factor: 1 },
  { name: "phone at 300%", width: 390, height: 844, touch: true, factor: 3 },
  { name: "desktop at 100%", width: 1440, height: 900, touch: false, factor: 1 },
  { name: "desktop at 300%", width: 1440, height: 900, touch: false, factor: 3 },
  { name: "1280x720 desktop at 300%", width: 1280, height: 720, touch: false, factor: 3 },
] as const;

// The narrow phones at 300% sit under the narrow case's height step (16.75rem at a coarse pointer): a 360x800 dialog is 15.9rem tall, and a 320 one is
// under the 7rem width floor.
const BELOW_CELLS = [
  { name: "360x800 phone at 300%", width: 360, height: 800, touch: true, factor: 3 },
  { name: "320x844 phone at 300%", width: 320, height: 844, touch: true, factor: 3 },
] as const;

// A landscape phone at 300% is a tiny dialog: the whole sheet scrolls and Start is unpinned (ui-platform-rulings §8.1), so Blank chat sits right after it.
const SHEET_CELL = { name: "844x390 landscape phone at 300%", width: 844, height: 390, touch: true, factor: 3 } as const;

/** Whether the control is on screen whole and every point down its middle hits it, so nothing lies over any part of it. */
function pressableWhole(control: Element): boolean {
  const box = control.getBoundingClientRect();
  const onScreen = box.top >= 0 && box.bottom <= window.innerHeight;
  return (
    onScreen &&
    [box.top + 1, box.top + box.height / 2, box.bottom - 1].every((y) => {
      const hit = document.elementFromPoint(box.left + box.width / 2, y);
      return hit !== null && control.contains(hit);
    })
  );
}

/** Scales the opened New chat's text and waits until its first row is whole and pressable; returns the dialog. */
async function expectWholeFirstRow(page: Page, factor: number): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await setRootFontScale(page, channelName("fontScale"), factor);
  const row = dialog.getByRole("option").first();
  await expect(row).toBeVisible();
  await expect.poll(() => row.evaluate(pressableWhole), "the first row is whole and takes its own press").toBe(true);
  return dialog;
}

/** Answers the shell's reads from the corpus root and opens it on the Chats section. */
async function serveShell(root: Awaited<ReturnType<typeof createCorpusHarness>>, corpus: CorpusPlayback, page: Page): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
  await seedShellState(page, { activeSection: "chats" });
}

for (const cell of PINNED_CELLS) {
  test.describe(`New chat on a ${cell.name}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.touch, isMobile: cell.touch });

    test("shows Blank chat in the pinned action row without scrolling, clear of the first row", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveShell(root, corpus, page);
      await mount<typeof AppShellModalStory>(`${SHELL_STORIES}/AppShellModalStory`, { modalId: "newChat" });
      const actions = (await expectWholeFirstRow(page, cell.factor)).locator(ACTIONS);
      const blank = actions.getByRole("button", { name: BLANK_CHAT_NAME, exact: true });
      await expect(blank).toBeInViewport({ ratio: 1 });
      await expect.poll(() => blank.evaluate(pressableWhole)).toBe(true);
      await expect(actions.getByText(CHAT_MORE_BELOW_CUE, { exact: true })).toBeHidden();
    });
  });
}

for (const cell of BELOW_CELLS) {
  test.describe(`New chat on a ${cell.name}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.touch, isMobile: cell.touch });

    test("says Blank chat is below, keeps the first row whole, and Blank chat follows Start", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveShell(root, corpus, page);
      await mount<typeof AppShellModalStory>(`${SHELL_STORIES}/AppShellModalStory`, { modalId: "newChat" });
      const dialog = await expectWholeFirstRow(page, cell.factor);
      const actions = dialog.locator(ACTIONS);
      await expect(actions.getByText(CHAT_MORE_BELOW_CUE, { exact: true })).toBeInViewport({ ratio: 1 });
      await expect(actions.getByRole("button", { name: BLANK_CHAT_NAME, exact: true })).toBeHidden();
      const blank = dialog.getByRole("button", { name: BLANK_CHAT_NAME, exact: true });
      await blank.scrollIntoViewIfNeeded();
      await expect.poll(() => blank.evaluate(pressableWhole)).toBe(true);
    });
  });
}

test.describe(`New chat on a ${SHEET_CELL.name}`, () => {
  test.use({ viewport: { width: SHEET_CELL.width, height: SHEET_CELL.height }, hasTouch: SHEET_CELL.touch, isMobile: SHEET_CELL.touch });

  test("scrolls as one sheet with Blank chat right after Start, each whole once scrolled to and Blank chat pressable", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    await serveShell(root, corpus, page);
    await mount<typeof AppShellModalStory>(`${SHELL_STORIES}/AppShellModalStory`, { modalId: "newChat" });
    const dialog = page.getByRole("dialog");
    await setRootFontScale(page, channelName("fontScale"), SHEET_CELL.factor);
    await expect(dialog.getByRole("option").first()).toBeVisible();
    const actions = dialog.locator(ACTIONS);
    await expect(actions).toHaveCSS("position", "static");
    const start = actions.getByRole("button").last();
    const blank = dialog.getByRole("button", { name: BLANK_CHAT_NAME, exact: true });
    // Scrolled down to, as a reader reaches it: a centring scroll would park it under the sticky header.
    await start.evaluate((node) => node.scrollIntoView({ block: "end" }));
    // Start is disabled until a pick, so it takes no pointer; whole on screen is its reach here.
    await expect(start).toBeInViewport({ ratio: 1 });
    await blank.evaluate((node) => node.scrollIntoView({ block: "end" }));
    await expect.poll(() => blank.evaluate(pressableWhole)).toBe(true);
    const startBox = await start.boundingBox();
    const blankBox = await blank.boundingBox();
    expect(blankBox?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual((startBox?.y ?? Number.POSITIVE_INFINITY) + (startBox?.height ?? 0));
  });
});
