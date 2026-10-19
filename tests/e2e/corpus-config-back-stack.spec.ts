// The phone's Settings back stack on the committed corpus: each Back pops exactly one rung, entry to member to group to the list.
import type { WorldBookId } from "@orb/kit/ids";
import { ownerActor } from "./support/actors.ts";
import { waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";

const SHELL_BACK = "Back to Settings";
const CONTROL_ROW = '[data-slot="collection-control-row"]';
const BOOK_EDITOR = '[data-slot="world-info-member-editor"]';
const CONFIG_LIST = '[data-slot="config-list"]';
const TEACHING = '[data-slot="config-mobile-teaching"]';
const MEMBER_VERBS = '[data-slot="config-member-verbs"]';

test.describe("committed corpus settings back stack", () => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");

  test("the phone's back stack pops ONE rung at a time: entry, member, group, the LIST", { tag: "@smoke" }, async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, "One-screen-at-a-time Back is the phone's navigation model");
    const host = ownerActor(baseURL ?? "");
    const bookId: WorldBookId | undefined = SELECTED_CORPUS_FIXTURE?.wire.worldInfoLibrary?.ids.libraryBookId;
    if (bookId === undefined) {
      throw new Error("Corpus has no library world book");
    }
    const book = await host.trpc.worldInfo.getBook.query({ bookId });
    const entry = (await host.trpc.worldInfo.listEntries.query({ bookId }))[0];
    if (entry === undefined) {
      throw new Error("Corpus world book has no entry");
    }
    await page.goto("/config");
    await waitForAppReady(page);

    // Rung 0: the LIST is the screen, so no way back is offered and the cold-start frame shows.
    await expect(page.getByRole("main").locator(CONFIG_LIST)).toBeVisible();
    await expect(page.locator(TEACHING)).toBeVisible();
    await expect(page.getByRole("button", { name: SHELL_BACK })).toHaveCount(0);

    // Rung 1: a band tap makes CONTENT the screen.
    await page.getByRole("button", { name: /World Info/u }).click();
    await expect(page.locator(CONTROL_ROW)).toBeVisible();
    await expect(page.getByRole("button", { name: SHELL_BACK })).toBeVisible();

    // Rung 2: a row drills into the member.
    await page.getByRole("textbox", { name: "Filter world info", exact: true }).fill(book.name);
    await page.getByRole("button", { name: book.name, exact: true }).click();
    await expect(page.locator(BOOK_EDITOR)).toBeVisible();
    await expect(page.getByRole("heading", { name: book.name })).toHaveCount(1);
    await expect(page.locator(MEMBER_VERBS).getByRole("button", { name: "New entry" })).toBeVisible();

    // Rung 3: a book drills again into an entry. The row's drag handle also carries the name, so go by text.
    await page.getByText(entry.title, { exact: true }).click();
    await expect(page.getByRole("button", { name: `Delete ${entry.title}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: entry.title })).toHaveCount(1);

    // Back pops the entry only; the book is still open behind it.
    await page.getByRole("button", { name: SHELL_BACK }).click();
    await expect(page.getByRole("button", { name: `Delete ${entry.title}` })).toHaveCount(0);
    await expect(page.locator(BOOK_EDITOR)).toBeVisible();

    // Back pops the member; the library is the pane again and the phone has not returned to the list.
    await page.getByRole("button", { name: SHELL_BACK }).click();
    await expect(page.locator(BOOK_EDITOR)).toHaveCount(0);
    await expect(page.locator(CONTROL_ROW)).toBeVisible();
    await expect(page.getByRole("button", { name: SHELL_BACK })).toBeVisible();

    // Back pops the group; the list is the screen again and the way back is gone with its reason.
    await page.getByRole("button", { name: SHELL_BACK }).click();
    await expect(page.getByRole("button", { name: SHELL_BACK })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /World Info/u })).toBeVisible();
  });
});
