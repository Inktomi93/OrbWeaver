// CT: the config section's MOBILE BACK STACK — `config-section.tsx`'s `makeSelectionSeam`, driven through
// the production `AppShell` at a phone (#1747, DESIGN.md §2 boards p1–p4: "one screen at a time; Back pops
// one rung").
//
// WHY THIS FILE EXISTS AT ALL. The seam declares a THREE-rung stack — world-info ENTRY, then the open
// MEMBER, then the active GROUP — and until now nothing could pin it: `ConfigHostStory`'s `mobile` prop
// publishes the viewport REGIME and then renders both panes side by side in one fixed flex box, so neither
// "the LIST is the screen" nor "Back pops one rung" is a property that mount can have. Both belong to the
// shell (`use-shell-layout.ts` — `listIsPrimaryContent` and `backToList`, which IS this section's declared
// `selection.clear`). So the subject is mounted the way production mounts it: the real AppShell over the
// real section registry, at 430×932 with a coarse pointer.
//
// THE ONE-SHELL RULE IS READ OFF THE TOPBAR'S BACK, and that is a rendered fact rather than a store read:
// `backToList` is non-null exactly when the phone has something pushed over the LIST, so the shell paints
// `Back to Settings` in that state and in no other. Its ABSENCE is the assertion that the LIST is the screen.
//
// THIS IS A FENCE, NOT A DEFECT PROOF, and it is labelled honestly: every rung below already popped
// correctly before #1747 (the drill row's move changed WHO draws the in-content exit, not what Back does).
// What was missing was the pin. It is also driven around an OPEN defect — #1741: on a phone the section
// arrives INSIDE CONTENT with the LIST collapsed, so the story's `show the list` button puts the store in
// the state a cold phone arrival SHOULD produce. This file neither fixes nor hides that; when #1741 closes,
// the button becomes redundant and the cold arrival can be asserted here instead.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ConfigMobileShellStory } from "../_ct-stories.tsx";

/** The shell's mobile way back — `Back to ${activeSectionLabel}`, and the config section's label is
 *  "Settings". Present ⇔ something is pushed over the LIST (`use-shell-layout.ts`'s `backToList`). */
const SHELL_BACK = "Back to Settings";
/** The library's control row (DESIGN.md §3.2) — the tell that CONTENT is showing the LIBRARY. */
const CONTROL_ROW = '[data-slot="collection-control-row"]';
/** The member's drill row (§3.4). At the PHONE regime it must NOT be drawn (boards p3/p4: the topbar
 *  carries `←` and the name), so on this file's mounts its count is the assertion, not the locator. */
const DRILL_ROW = '[data-slot="config-drill-header"]';
/** What the phone draws INSTEAD — the member's own verbs, with its `h2` visually hidden beside them. */
const MEMBER_VERBS = '[data-slot="config-member-verbs"]';
/** The world-info member editor's own root — the tell that CONTENT is showing a BOOK, at a regime where the
 *  drill row is deliberately absent. */
const BOOK_EDITOR = '[data-slot="world-info-member-editor"]';

const TAG = {
  id: "tag_zeal",
  name: "zeal",
  color: null,
  color2: null,
  source: null,
  folderType: "NONE",
  sortOrder: 0,
  isHiddenOnCard: false,
  usage: { characters: 9, chats: 3, worldBooks: 0, personas: 0, presets: 0, total: 12 },
};

const BOOK = {
  id: "world_book_reach000001",
  name: "The Ninefold Reach",
  description: null,
  createdAt: 1,
  entryCount: 1,
  usage: { characters: 0, personas: 0, chats: 0, global: false, total: 0 },
};

const ENTRY = {
  id: "world_entry_spire00000001",
  bookId: BOOK.id,
  title: "The Spire",
  content: "A tower of ash.",
  keys: ["spire"],
  secondaryKeys: [],
  enabled: true,
  constant: false,
  position: 0,
  priority: 100,
  probability: 100,
  depth: 4,
  scanDepth: null,
  caseSensitive: false,
  matchWholeWords: null,
  selectiveLogic: "AND_ANY",
  group: null,
  comment: null,
  createdAt: 1,
  updatedAt: 1,
};

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "sessions.me": { userId: "user_ct_config", handle: "ct_config", globalRole: "user" },
    "settings.getUserSettings": () => ({ userId: "user_ct_config", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    "settings.listThemes": () => [],
    "tag.listTagsWithUsage": () => [TAG],
    "regex.listScripts": () => [],
    "regex.listGlobal": () => [],
    "worldInfo.listBooksWithUsage": () => [BOOK],
    "worldInfo.listGlobal": () => [],
    "worldInfo.getBook": () => BOOK,
    "worldInfo.listEntries": () => [ENTRY],
    "rosterPreset.list": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
    // THE WHOLE SHELL IS MOUNTED, so the shell's own ambient reads are this file's to feed as well — the
    // notifications bell, and the home/databank tiles the rail's other sections keep warm. Fed rather than
    // baselined: an empty list is a real view for every one of them, and the unfed-read ratchet is right
    // that a `null` would leave those pipelines inert inside a mount that does render them.
    "notifications.list": () => ({ items: [], unreadCount: 0, nextCursor: null }),
    "chat.listChats": () => ({ items: [], nextCursor: null }),
    "databank.list": () => ({ items: [], nextCursor: null }),
    "databank.bankHealth": () => ({ documents: 0, chunks: 0, embedded: 0, pending: 0, failed: 0 }),
  });
}

// A REAL PHONE: the 430×932 viewport the design frames are drawn at, with `hasTouch` so the coarse-pointer
// rules the shell and the rows carry are the ones under test (a fine-pointer mobile viewport measures a
// layout no phone renders).
test.describe("the phone", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 932 } });

  test("the phone's back stack pops ONE rung at a time: entry → member → group → the LIST", async ({ mount, page }) => {
    await stub(page);
    const shell = await mount(<ConfigMobileShellStory />);
    await shell.getByRole("button", { name: "show the list" }).click();

    // ── rung 0 · THE LIST IS THE SCREEN. Nothing is pushed, so the shell offers no way back.
    await expect(page.getByRole("button", { name: SHELL_BACK })).toHaveCount(0);
    const band = page.getByRole("button", { name: /World Info/ });
    await expect(band).toBeVisible();

    // ── rung 1 · A BAND TAP MAKES CONTENT THE SCREEN (#1725: a collection pushes like every other group).
    await band.click();
    await expect(page.locator(CONTROL_ROW)).toBeVisible();
    await expect(page.getByRole("button", { name: SHELL_BACK })).toBeVisible();

    // ── rung 2 · A ROW DRILLS INTO THE MEMBER. The tell is the book editor's own root, because at this
    // regime the drill row is deliberately NOT drawn (see the sibling test).
    await page
      .getByRole("button", { name: /Ninefold Reach/ })
      .first()
      .click();
    await expect(page.locator(BOOK_EDITOR)).toBeVisible();
    await expect(page.getByRole("heading", { name: BOOK.name })).toHaveCount(1);
    // THE VERBS SURVIVE THE ROW THEY LOST — the STATED DELTA against p3/p4, pinned rather than left to
    // drift: those boards draw a REGEX member, the one collection with no verbs at all, so they cannot say
    // where `New entry` goes on a phone. Dropping it would make creating an entry impossible there.
    await expect(page.locator(MEMBER_VERBS).getByRole("button", { name: "New entry" })).toBeVisible();

    // ── rung 3 · THE ENTRY RUNG, which is the whole reason this stack is three deep (stickler F9): a book
    // drills AGAIN into an entry, and without the rung the shell's Back popped the BOOK out from under it.
    // BY TEXT, not by role: the entry list is a `SortableList`, so the row's DRAG HANDLE is a button that
    // also carries the entry's name and comes first in the DOM — a role locator picks the handle, whose
    // click does nothing at all (measured here).
    await page.getByText(ENTRY.title, { exact: true }).click();
    // The tell is the ENTRY editor's own delete action, not a `Back to entries` button: at this regime the
    // entry rung's drill row is not drawn either, so the topbar's Back is the entry's only exit — which is
    // precisely the rung this test exists to prove.
    await expect(page.getByRole("button", { name: `Delete ${ENTRY.title}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: ENTRY.title })).toHaveCount(1);

    // Back pops the ENTRY only — the BOOK is still open behind it.
    await page.getByRole("button", { name: SHELL_BACK }).click();
    await expect(page.getByRole("button", { name: `Delete ${ENTRY.title}` })).toHaveCount(0);
    await expect(page.locator(BOOK_EDITOR)).toBeVisible();
    await expect(page.getByRole("heading", { name: BOOK.name })).toHaveCount(1);

    // Back pops the MEMBER — the LIBRARY is the pane again, and the phone has NOT returned to the LIST.
    await page.getByRole("button", { name: SHELL_BACK }).click();
    await expect(page.locator(BOOK_EDITOR)).toHaveCount(0);
    await expect(page.locator(CONTROL_ROW)).toBeVisible();
    await expect(page.getByRole("button", { name: SHELL_BACK })).toBeVisible();

    // Back pops the GROUP — the LIST is the screen again and the way back is gone with the reason for it.
    await page.getByRole("button", { name: SHELL_BACK }).click();
    await expect(page.getByRole("button", { name: SHELL_BACK })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /World Info/ })).toBeVisible();
  });

  test("the phone draws NO in-content drill row — the topbar is the exit, and the member's h2 survives", async ({ mount, page }) => {
    await stub(page);
    const shell = await mount(<ConfigMobileShellStory />);
    await shell.getByRole("button", { name: "show the list" }).click();

    await page.getByRole("button", { name: /Tags/ }).first().click();
    await page.getByRole("button", { name: "zeal", exact: true }).click();

    // BOARDS p3/p4: no `← Back to <library>` row inside CONTENT. The topbar carries the exit and the name,
    // so an in-content row would print BOTH twice inside 430px — the doubled chrome the owner's review
    // rejected. The drill row's absence is the pin; the shell's own Back is what replaces it.
    await expect(page.locator(DRILL_ROW)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to Tags" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: SHELL_BACK })).toBeVisible();

    // …AND THE HEADING SURVIVES THE ROW IT USED TO LIVE IN. The topbar's title is not a heading, so a
    // reader navigating by headings would lose the member entirely; it stays in the tree, visually hidden,
    // and is still stated exactly ONCE.
    await expect(page.getByRole("heading", { name: "zeal" })).toHaveCount(1);
  });
});
