// A surface that mounts after a read arrives late: by then the user may be typing elsewhere, or working in an open menu.
// Arrival stands down for those, and still lands for a user who only pressed the row that opened it.
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, holdServed, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const ROW = `${LIST} [data-slot="list-row-body"]`;
const EDITOR = ".shell-content form";
const SEARCH_TEXT = "lantern";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test.use({ viewport: { width: 1280, height: 900 } });

test("a character read that lands while the list search is being typed in leaves the field and its text alone", async ({ corpus, mount, page }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  await seedShellState(page, { activeSection: "characters" });
  const read = holdServed();
  await using held = new AsyncDisposableStack();
  held.defer(read.release);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
    ...serveCorpusProcedures(caller, ["character.get"], () => read),
  });
  await mount<typeof AppShellStory>(STORY, {});
  await page.locator(ROW).first().click();
  await read.requested;
  const search = page.locator(`${LIST} [data-slot="list-search"] input`);
  await search.pressSequentially(SEARCH_TEXT);
  read.release();
  await expect(page.locator(EDITOR)).toBeVisible();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue(SEARCH_TEXT);
});

test("a character read that lands while a row's menu is open leaves the menu open", async ({ corpus, mount, page }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  await seedShellState(page, { activeSection: "characters" });
  const read = holdServed();
  await using held = new AsyncDisposableStack();
  held.defer(read.release);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
    ...serveCorpusProcedures(caller, ["character.get"], () => read),
  });
  await mount<typeof AppShellStory>(STORY, {});
  await page.locator(ROW).first().click();
  await read.requested;
  const trigger = page.locator(`${LIST} [aria-haspopup="menu"]`).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  read.release();
  await expect(page.locator(EDITOR)).toBeVisible();
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((node) => node.contains(document.activeElement))).toBe(true);
});

test("a plain arrival after the same held read still lands focus in the editor", async ({ corpus, mount, page }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  await seedShellState(page, { activeSection: "characters" });
  const read = holdServed();
  await using held = new AsyncDisposableStack();
  held.defer(read.release);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
    ...serveCorpusProcedures(caller, ["character.get"], () => read),
  });
  await mount<typeof AppShellStory>(STORY, {});
  const row = page.locator(ROW).first();
  await row.focus();
  await page.keyboard.press("Enter");
  await read.requested;
  read.release();
  await expect(page.locator(EDITOR)).toBeVisible();
  await expect.poll(() => page.evaluate((selector) => document.querySelector(selector)?.parentElement?.contains(document.activeElement), EDITOR)).toBe(true);
});
