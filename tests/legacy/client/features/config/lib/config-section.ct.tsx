// CT: the config section's MOBILE BACK STACK — `config-section.tsx`'s `makeSelectionSeam`, driven through
// the production `AppShell` at a phone (#1747, the mock design §2 boards p1–p4: "one screen at a time; Back pops
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
// The three-rung Back walk over real world books is an e2e flow: tests/e2e/corpus-config-back-stack.spec.ts.
//
// THE COLD-ARRIVAL TEST IS A REAL DEFECT PROOF (#1741). The tests used to
// begin by clicking a `show the list` driver on the story, because a cold phone arrival could not reach the
// LIST-is-the-screen arm at all: `use-shell-layout.ts` published the viewport regime to `#state` from a
// PASSIVE effect, which runs after every layout effect in the same commit's subtree, so the config LIST's
// once-per-mount arrival default read the store's `false` default, took its DESKTOP arm on a phone, and
// auto-selected a group — which the one-shell rule then honoured by pushing CONTENT over the map. The
// driver is gone with the defect; the arrival is asserted instead.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { makeChatListPage } from "@orb/testkit/node/factories/chat-view.ts";
import { makeDocumentListPage } from "@orb/testkit/node/factories/databank-view.ts";
import type { TrpcRecorder, TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { characterListResponder } from "../../character/fixtures.ts";
import { ConfigMobileShellStory } from "../_ct-stories.tsx";

/** The shell's mobile way back — `Back to ${activeSectionLabel}`, and the config section's label is
 *  "Settings". Present ⇔ something is pushed over the LIST (`use-shell-layout.ts`'s `backToList`). */
const SHELL_BACK = "Back to Settings";
/** The member's drill row (§3.4). At the PHONE regime it must NOT be drawn (boards p3/p4: the topbar
 *  carries `←` and the name), so on this file's mounts its count is the assertion, not the locator. */
const DRILL_ROW = '[data-slot="config-drill-header"]';
/** The LIST surface's own root (`config-list-surface.tsx`'s `role="region"`). */
const CONFIG_LIST = '[data-slot="config-list"]';
/** One group BAND per registered group — the MAP itself. */
const BAND = '[data-slot="config-band"]';
/** The phone's cold-start teaching frame — rendered ONLY on a mobile viewport with no member selected AND
 *  no active group, so its presence is also the pin that nothing selected on arrival. */
const TEACHING = '[data-slot="config-mobile-teaching"]';
/** Every group the door registers MINUS the admin one: `admin-group.tsx` declares
 *  `when: (viewer) => viewer.isAdmin`, which this file's `sessions.me` (`globalRole: "user"`) is not. Stated as a number here
 *  rather than derived from `CONFIG_GROUP_IDS`, because a test that reads the tuple it judges proves nothing. */
const GROUP_COUNT = 12;

const BOOK = {
  id: "world_book_reach000001",
  name: "The Ninefold Reach",
  description: null,
  createdAt: 1,
  entryCount: 1,
  usage: { characters: 0, personas: 0, chats: 0, global: false, total: 0 },
};
const BOOK_DETAIL = { id: BOOK.id, name: BOOK.name, description: BOOK.description, createdAt: BOOK.createdAt };

const ENTRY = {
  id: "world_entry_spire00000001",
  worldBookId: BOOK.id,
  title: "The Spire",
  description: null,
  content: "A tower of ash.",
  keys: ["spire"],
  enabled: true,
  priority: 100,
  ignoreBudget: false,
  metadata: null,
} satisfies TrpcWireOutput<"worldInfo.listEntries">[number];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "sessions.me": { userId: "user_ct_config", handle: "ct_config", globalRole: "user" },
    "settings.getUserSettings": () => ({ userId: "user_ct_config", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, configUnreadable: null, updatedAt: 0 }),
    "settings.listThemes": () => [],
    "regex.listScripts": () => [],
    "regex.countScripts": 0,
    "regex.listGlobal": () => [],
    "worldInfo.listBooksWithUsage": () => [BOOK],
    "worldInfo.countBooks": 1,
    "worldInfo.listGlobal": () => [],
    "worldInfo.getBook": () => BOOK_DETAIL,
    "worldInfo.listEntries": () => [ENTRY],
    "rosterPreset.list": () => [],
    "rosterPreset.count": 0,
    "persona.list": () => [],
    "character.list": characterListResponder([]),
    // THE WHOLE SHELL IS MOUNTED, so the shell's own ambient reads are this file's to feed as well — the
    // notifications bell, and the home/databank tiles the rail's other sections keep warm. Fed rather than
    // baselined: an empty list is a real view for every one of them, and the unfed-read ratchet is right
    // that a `null` would leave those pipelines inert inside a mount that does render them.
    "notifications.list": () => ({ items: [], nextCursor: null }),
    "plugin.listCommands": [],
    "chat.listChats": () => makeChatListPage(),
    "databank.list": () => makeDocumentListPage(),
    "databank.bankHealth": () => ({
      total: 0,
      passages: 0,
      chunks: 0,
      staleExtraction: 0,
      byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 0, stalled: 0 },
    }),
  });
}

// A REAL PHONE: the 430×932 viewport the design frames are drawn at, with `hasTouch` so the coarse-pointer
// rules the shell and the rows carry are the ones under test (a fine-pointer mobile viewport measures a
// layout no phone renders).
test.describe("the phone", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 932 } });

  // THE COLD ARRIVAL IS ITS OWN PIN (#1741), and it is the one every test below stands on: they used to
  // start by driving the store into the LIST-is-the-screen arm (a `show the list` button on the story),
  // because a cold mount could not reach it. The defect was an ORDERING one — `use-shell-layout.ts`
  // published the viewport regime from a PASSIVE effect, which runs after every layout effect in the same
  // commit's subtree, so the LIST's arrival default (`config-list-surface.tsx`, a `useLayoutEffect` whose
  // third condition is "never on a phone") read the store's `false` default and fired its desktop arm.
  test("the COLD phone arrival lands on the LIST — no drive, nothing pushed over it", async ({ mount, page }) => {
    await stub(page);
    await mount(<ConfigMobileShellStory />);

    // SETTLE ON THE MAP FIRST: the bands are in the tree in BOTH arms (a collapsed pane still renders its
    // body), so their full count is the barrier that the config LIST has mounted — never the verdict.
    await expect(page.locator(BAND)).toHaveCount(GROUP_COUNT);

    // THE VERDICT, in three rendered facts. Nothing is pushed, so the shell offers no way back…
    await expect(page.getByRole("button", { name: SHELL_BACK })).toHaveCount(0);
    // …the LIST is the screen's PRIMARY CONTENT, which is what makes its aside carry `main` (#1349)…
    await expect(page.getByRole("main").locator(CONFIG_LIST)).toBeVisible();
    // …and the phone's cold-start frame is on screen, which no state with an active group can produce.
    await expect(page.locator(TEACHING)).toBeVisible();
  });

  test("the phone draws NO in-content drill row — the topbar is the exit, and the member's h2 survives", async ({ mount, page }) => {
    await stub(page);
    await mount(<ConfigMobileShellStory />);

    await page
      .getByRole("button", { name: /World Info/ })
      .first()
      .click();
    await page.getByRole("button", { name: BOOK.name, exact: true }).click();

    // BOARDS p3/p4: no `← Back to <library>` row inside CONTENT. The topbar carries the exit and the name,
    // so an in-content row would print BOTH twice inside 430px — the doubled chrome the owner's review
    // rejected. The drill row's absence is the pin; the shell's own Back is what replaces it.
    await expect(page.locator(DRILL_ROW)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to World Info" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: SHELL_BACK })).toBeVisible();

    // …AND THE HEADING SURVIVES THE ROW IT USED TO LIVE IN. The topbar's title is not a heading, so a
    // reader navigating by headings would lose the member entirely; it stays in the tree, visually hidden,
    // and is still stated exactly ONCE.
    await expect(page.getByRole("heading", { name: BOOK.name })).toHaveCount(1);
  });
});
