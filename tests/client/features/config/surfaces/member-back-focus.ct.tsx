// The settings collections keep a focused row and hand focus back to it. A focused row keeps focus when a member made
// elsewhere takes the library past the size where the list once swapped its container. Back from a drilled member lands
// on the row it was opened from: when that row is outside the list's window, the list brings it in first; when the
// member was deleted elsewhere while open, focus lands on the list itself, never the page, even when the list first
// remounts with the deleted row still in its cache; and the Back the host draws while the member's read is pending does
// the same as the loaded one. A world-info entry deleted elsewhere while its editor holds focus closes the editor and
// hands focus to the book's entry list. Every case runs the production settings content
// with the app root's user bus over a corpus root; a member made or deleted elsewhere goes through the production verb
// and reaches the page as the real server's own user-bus event.
// @subject packages/client/src/components/use-row-delete-focus.ts
import { COLLECTION_LARGE_GROUP, sectionBackName } from "@orb/client/lib";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ServedHold } from "@orb/testkit/ct";
import { holdServed, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { REGEX_GROUP_LABEL } from "#client/features/regex/lib/regex-names.ts";
import { ROSTER_GROUP_LABEL } from "#client/features/roster-preset/lib/roster-names.ts";
import { WORLD_INFO_GROUP_LABEL } from "#client/features/world-info/lib/world-info-names.ts";
import { forwardUserEvent } from "../../../components/_forward-user-event.ts";
import type { ConfigPanesBusStory } from "./_list-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_list-stories/ConfigPanesBusStory";
const SERVED = [
  ...SECTION_PROCEDURES,
  "persona.list",
  "plugin.list",
  "regex.countScripts",
  "regex.listScripts",
  "regex.listGlobal",
  "worldInfo.countBooks",
  "worldInfo.listBooksWithUsage",
  "worldInfo.listEntries",
  "rosterPreset.count",
  "rosterPreset.get",
  "automation.listRulePresets",
] as const;
const REGEX_EDITOR = '[data-slot="regex-member-editor"]';
const BOOK_EDITOR = '[data-slot="world-info-member-editor"]';
const ROSTER_EDITOR = '[data-slot="roster-member-editor"]';
const ROW_BODY = '[data-slot="list-row-body"]';
// A library long enough that its last rows start outside the list's first window.
const LONG_LIBRARY = COLLECTION_LARGE_GROUP + 15;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
const GROUP_EVENTS = { regex: "regexChanged", worldInfo: "worldInfoChanged", rosterPreset: "rosterPresetsChanged" } as const satisfies Record<
  string,
  UserBusEvent["type"]
>;
type Group = keyof typeof GROUP_EVENTS;
type MountPanes = (props: Parameters<typeof ConfigPanesBusStory>[0]) => Promise<unknown>;

interface Mounting {
  readonly page: Page;
  readonly root: Root;
  readonly cleanup: AsyncDisposableStack;
  readonly group: Group;
  readonly bookRead?: ServedHold;
}

function createScript(caller: Caller, name: string): Promise<unknown> {
  return caller.regex.createScript({
    input: createRegexScriptSchema.parse({ name, findRegex: "witness", replaceString: "", placement: ["AI_OUTPUT"], enabled: false }),
  });
}

function rows(page: Page): Locator {
  return page.locator(`[data-slot="config-content"] ${ROW_BODY}`);
}

/** The landing's census of the library, which counts members the window has not mounted. */
function libraryTotal(page: Page, total: number): Locator {
  return page
    .locator('[data-slot="config-content"]')
    .getByText(new RegExp(`^\\d+ of ${String(total)}$`, "u"))
    .first();
}

function windowedName(index: number): string {
  return `Zz windowed ${String(index).padStart(2, "0")}`;
}

/** Routes the settings reads to the root, forwards the group's first user-bus event to the page, and mounts the production panes. */
async function mountPanes(mountStory: MountPanes, mounting: Mounting): Promise<void> {
  const { page, root, cleanup, group, bookRead } = mounting;
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["worldInfo.getBook"], () => bookRead),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  // The socket the bus rides must answer for the panes to mount; the group's own event is the one a case may wait on.
  await forwardUserEvent(page, root, GROUP_EVENTS[group], cleanup);
  await mountStory({ showList: false, initialGroup: group });
}

/** Scrolls the list's window to its end and returns the name of its last row, one the first window did not mount. */
async function reachLastRow(page: Page): Promise<string> {
  await expect(rows(page).first()).toBeVisible();
  const firstWindow = await rows(page).allTextContents();
  await page.locator('[data-slot="config-content"] [data-slot="virtual-list-scroll"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(rows(page).filter({ hasText: firstWindow[0] ?? "" })).toHaveCount(0);
  const name = await rows(page).last().getAttribute("aria-label");
  if (name === null || firstWindow.some((text) => text.includes(name))) {
    throw new Error("The list's last row was already in its first window");
  }
  return name;
}

/** A row by its accessible name, the name its body button carries. */
function rowNamed(page: Page, name: string): Locator {
  return page.locator('[data-slot="config-content"]').getByRole("button", { name, exact: true });
}

async function openByKeyboard(page: Page, row: Locator, editor: string): Promise<void> {
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(editor)).toBeFocused();
}

async function pressBack(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: sectionBackName(label), exact: true }).focus();
  await page.keyboard.press("Enter");
}

/** Focus sits on the list's own root: the one focused element in the settings content is the box that holds the rows. */
async function expectFocusOnList(page: Page): Promise<void> {
  // Positive control: the list is back and holds rows, so focus on its root is the named fallback, not an empty pane.
  await expect(rows(page).first()).toBeVisible();
  const focused = page.locator('[data-slot="config-content"] :focus');
  await expect(focused).toHaveCount(1);
  await expect(focused.locator(ROW_BODY).first()).toBeVisible();
}

test.use({ viewport: { width: 1440, height: 900 } });

test("a focused regex row keeps focus when a script made elsewhere takes the library past the old container size", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  await createScript(caller, "Aa held row");
  for (let count = (await caller.regex.listScripts()).length; count < COLLECTION_LARGE_GROUP; count += 1) {
    await createScript(caller, `Filler ${String(count)}`);
  }
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "regex" });
  const held = rows(page).filter({ hasText: "Aa held row" });
  await held.focus();
  await expect(held).toBeFocused();

  await createScript(caller, "Aa arrived elsewhere");

  await expect(libraryTotal(page, COLLECTION_LARGE_GROUP + 1)).toBeVisible();
  await expect(held).toBeFocused();
});

test("a focused world book keeps focus when a book made elsewhere takes the library past the old container size", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  for (let count = (await caller.worldInfo.listBooksWithUsage()).length; count < COLLECTION_LARGE_GROUP; count += 1) {
    await caller.worldInfo.createBook({ input: { name: `Filler ${String(count)}` } });
  }
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "worldInfo" });
  const heldName = await rows(page).first().getAttribute("aria-label");
  if (heldName === null) {
    throw new Error("The first world book row has no name");
  }
  const held = rowNamed(page, heldName);
  await held.focus();
  await expect(held).toBeFocused();

  await caller.worldInfo.createBook({ input: { name: "Aa arrived elsewhere" } });

  await expect(libraryTotal(page, COLLECTION_LARGE_GROUP + 1)).toBeVisible();
  await expect(held).toBeFocused();
});

test("Back from a regex script opened past the list's first window brings its row back into the window and focuses it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  for (let index = 0; index < LONG_LIBRARY; index += 1) {
    await createScript(caller, windowedName(index));
  }
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "regex" });
  const last = await reachLastRow(page);
  await openByKeyboard(page, rowNamed(page, last), REGEX_EDITOR);

  await pressBack(page, REGEX_GROUP_LABEL);

  await expect(page.locator(REGEX_EDITOR)).toHaveCount(0);
  await expect(rowNamed(page, last)).toBeFocused();
});

test("Back from a regex script deleted elsewhere while it was open lands on the script list, not the page", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  await createScript(caller, "Doomed script");
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "regex" });
  await openByKeyboard(page, rows(page).filter({ hasText: "Doomed script" }), REGEX_EDITOR);
  const doomed = (await caller.regex.listScripts()).find((script) => script.name === "Doomed script");
  if (doomed === undefined) {
    throw new Error("The doomed script was not created");
  }

  await caller.regex.removeScript({ scriptId: doomed.id });
  await expect(page.locator('[data-slot="config-drill-header"]').getByRole("heading")).toHaveCount(0);
  await pressBack(page, REGEX_GROUP_LABEL);

  await expectFocusOnList(page);
});

test("Back from a world book returns focus to its row", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.worldInfo.createBook({ input: { name: "Returning book" } });
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "worldInfo" });
  await openByKeyboard(page, rows(page).filter({ hasText: "Returning book" }), BOOK_EDITOR);

  await pressBack(page, WORLD_INFO_GROUP_LABEL);

  await expect(page.locator(BOOK_EDITOR)).toHaveCount(0);
  await expect(rows(page).filter({ hasText: "Returning book" })).toBeFocused();
});

test("Back from a world book opened past the list's first window brings its row back into the window and focuses it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  for (let index = 0; index < LONG_LIBRARY; index += 1) {
    await caller.worldInfo.createBook({ input: { name: windowedName(index) } });
  }
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "worldInfo" });
  const last = await reachLastRow(page);
  await openByKeyboard(page, rowNamed(page, last), BOOK_EDITOR);

  await pressBack(page, WORLD_INFO_GROUP_LABEL);

  await expect(page.locator(BOOK_EDITOR)).toHaveCount(0);
  await expect(rowNamed(page, last)).toBeFocused();
});

test("the Back drawn while a world book's read is pending is the Back alone, and returns focus to its row", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.worldInfo.createBook({ input: { name: "Pending book" } });
  const bookRead = holdServed();
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "worldInfo", bookRead });
  const row = rows(page).filter({ hasText: "Pending book" });
  await row.focus();
  await page.keyboard.press("Enter");
  await bookRead.requested;
  const header = page.locator('[data-slot="config-drill-header"]');
  await expect(header.getByRole("button", { name: sectionBackName(WORLD_INFO_GROUP_LABEL), exact: true })).toBeVisible();
  await expect(header.getByRole("button")).toHaveCount(1);
  await expect(header.getByRole("heading")).toHaveCount(0);

  await pressBack(page, WORLD_INFO_GROUP_LABEL);

  await expect(row).toBeFocused();
  bookRead.release();
});

test("Back from a world-info entry returns focus to the entry's row in its book", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const book = await caller.worldInfo.createBook({ input: { name: "Entry book" } });
  for (const title of ["First entry", "Second entry"]) {
    await caller.worldInfo.createEntry({ bookId: book.id, input: { title, content: "Lore." } });
  }
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "worldInfo" });
  await openByKeyboard(page, rows(page).filter({ hasText: "Entry book" }), BOOK_EDITOR);
  const entry = page.locator(BOOK_EDITOR).locator(ROW_BODY).filter({ hasText: "Second entry" });
  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-slot="config-drill-header"]').getByRole("heading", { name: "Second entry", exact: true })).toHaveCount(1);

  await pressBack(page, "Entry book");

  await expect(entry).toBeFocused();
});

test("Back from a saved roster returns focus to its row", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const second = (await caller.rosterPreset.list())[1];
  if (second === undefined) {
    throw new Error("The corpus holds fewer than two saved rosters");
  }
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "rosterPreset" });
  const row = rows(page).filter({ hasText: second.name });
  await openByKeyboard(page, row, ROSTER_EDITOR);

  await pressBack(page, ROSTER_GROUP_LABEL);

  await expect(page.locator(ROSTER_EDITOR)).toHaveCount(0);
  await expect(row).toBeFocused();
});

test("Back from a world book deleted elsewhere while it was open lands on the book list, not the page", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const doomed = await caller.worldInfo.createBook({ input: { name: "Doomed book" } });
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "worldInfo" });
  await openByKeyboard(page, rows(page).filter({ hasText: "Doomed book" }), BOOK_EDITOR);

  await caller.worldInfo.removeBook({ bookId: doomed.id });
  await expect(page.locator('[data-slot="config-drill-header"]').getByRole("heading")).toHaveCount(0);
  await pressBack(page, WORLD_INFO_GROUP_LABEL);

  await expect(rows(page).filter({ hasText: "Doomed book" })).toHaveCount(0);
  await expectFocusOnList(page);
});

test("Back from a saved roster deleted elsewhere lands on the roster list, not the page, after the stale row leaves", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const second = (await caller.rosterPreset.list())[1];
  if (second === undefined) {
    throw new Error("The corpus holds fewer than two saved rosters");
  }
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "rosterPreset" });
  await openByKeyboard(page, rows(page).filter({ hasText: second.name }), ROSTER_EDITOR);

  // The roster list has no reader while the member is open, so it remounts from a cache that still holds this row.
  await caller.rosterPreset.remove({ presetId: second.id });
  await pressBack(page, ROSTER_GROUP_LABEL);

  await expect(page.locator(ROSTER_EDITOR)).toHaveCount(0);
  await expect(rows(page).filter({ hasText: second.name })).toHaveCount(0);
  await expectFocusOnList(page);
});

test("a world-info entry deleted elsewhere while its editor holds focus hands focus to the book's entry list", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const book = await caller.worldInfo.createBook({ input: { name: "Entry book" } });
  await caller.worldInfo.createEntry({ bookId: book.id, input: { title: "Kept entry", content: "Lore." } });
  const doomed = await caller.worldInfo.createEntry({ bookId: book.id, input: { title: "Doomed entry", content: "Lore." } });
  await mountPanes((props) => mount<typeof ConfigPanesBusStory>(STORY, props), { page, root, cleanup, group: "worldInfo" });
  await openByKeyboard(page, rows(page).filter({ hasText: "Entry book" }), BOOK_EDITOR);
  const editor = page.locator(BOOK_EDITOR);
  await editor.locator(ROW_BODY).filter({ hasText: "Doomed entry" }).focus();
  await page.keyboard.press("Enter");
  const back = page.getByRole("button", { name: sectionBackName("Entry book"), exact: true });
  await expect(back).toBeVisible();
  const field = editor.getByRole("textbox").first();
  await field.focus();
  await expect(field).toBeFocused();

  await caller.worldInfo.removeEntry({ entryId: doomed.id });

  await expect(back).toHaveCount(0);
  const kept = editor.locator(ROW_BODY).filter({ hasText: "Kept entry" });
  await expect(kept).toBeVisible();
  const focused = page.locator(`${BOOK_EDITOR} :focus`);
  await expect(focused).toHaveCount(1);
  await expect(focused.locator(ROW_BODY).filter({ hasText: "Kept entry" })).toHaveCount(1);
});
