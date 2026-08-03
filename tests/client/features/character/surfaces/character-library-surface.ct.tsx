// CT: the character library surface end-to-end. Drives the PRODUCTION path — `character.list`
// (routeTrpc, keyset-paged) → `createCollectionSurface`'s `useInfiniteQuery` → the virtualized card
// list. Asserts: the first page renders AND the tail-fetch guard auto-pulls the second page (the story's
// 480px/2-row viewport puts every row within the default 12-row `endApproachRows` window, so the guard
// fires without a real scroll gesture); the search box (useDeferredValue) filters by name/tag
// CLIENT-SIDE over whatever pages are loaded (`character.list` has no server-side search param — see
// the surface's header note); an empty library and a no-match search each get their own honest empty
// state; a scripted read failure shows the error state (NO Retry — `createCollectionSurface` exposes no
// refetch handle, so the QueryBoundary reset handshake the old unpaged read used no longer applies).
//
// NOTE (mirrors message-list-surface.ct.tsx's own note): `trpc.character.list` is stubbed at the NETWORK
// (routeTrpc) — the responder inspects the decoded `input.cursor` to serve page 1 vs page 2.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { dropFiles } from "../../../../support/ct/drop-files";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { CharacterLibrarySurfaceStory } from "../_ct-stories";
import { makeCharacterSummary, makeTagFixture } from "../fixtures";

const ARIA = makeCharacterSummary({
  id: "char_aria",
  name: "Aria Nightshade",
  createdAt: 3000,
  tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" })],
});
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt", createdAt: 2000, tags: [] });
const CASSIUS = makeCharacterSummary({
  id: "char_cassius",
  name: "Cassius",
  createdAt: 1000,
  tags: [],
});

const PAGE_1_CURSOR = { createdAt: BOLT.createdAt, id: BOLT.id };

/** A two-page keyset series: page 1 = [ARIA, BOLT] + a cursor; page 2 = [CASSIUS], exhausted. */
function twoPageResponder(input: unknown): unknown {
  const cursor = (input as { cursor?: unknown } | undefined)?.cursor;
  return cursor === undefined ? { items: [ARIA, BOLT], nextCursor: PAGE_1_CURSOR } : { items: [CASSIUS], nextCursor: null };
}

test("renders the first page, then auto-fetches the next page (tail-fetch guard)", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": twoPageResponder });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
  // The tail-fetch guard (VirtualList's onEndApproach) pulls page 2 without a scroll gesture — the
  // story's viewport puts every row inside the default endApproachRows window.
  await expect(component.getByText("Cassius")).toBeVisible();
});

test("the search box filters loaded pages by name, client-side", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": twoPageResponder });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Cassius")).toBeVisible(); // both pages loaded first
  await component.getByPlaceholder("Search characters…").fill("bolt");

  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(component.getByText("Aria Nightshade")).toHaveCount(0);
  await expect(component.getByText("Cassius")).toHaveCount(0);
});

test("an empty library shows the 'no characters yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": () => ({ items: [], nextCursor: null }) });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("No characters yet")).toBeVisible();
});

test("a search with no matches shows the 'no matches' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": twoPageResponder });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Cassius")).toBeVisible(); // both pages loaded first
  await component.getByPlaceholder("Search characters…").fill("nonexistent-name");

  await expect(component.getByText("No matches")).toBeVisible();
});

test("a read failure shows the error state with a working Retry (rule 1 — no dead ends)", async ({ mount, page }) => {
  // First read fails; after Retry the responder recovers — the list renders without a remount.
  let failed = false;
  await routeTrpc(page, {
    "character.list": () => {
      if (!failed) {
        failed = true;
        return trpcError();
      }
      return { items: [BOLT], nextCursor: null };
    },
  });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("Couldn't load the character library.")).toBeVisible();
  await component.getByRole("button", { name: "Retry" }).click();
  await expect(component.getByText("Bolt")).toBeVisible();
});

// ── §4.2/§4.5/§4.6/§4.3 the new LIST features ──────────────────────────────────────────────────────

const STARLA = makeCharacterSummary({
  id: "char_star",
  name: "Starla",
  starred: true,
  createdAt: 3000,
});
const BOLT2 = makeCharacterSummary({ id: "char_bolt2", name: "Bolt", createdAt: 2000 });
const TAGGED = makeCharacterSummary({
  id: "char_tag",
  name: "Cassius",
  createdAt: 1000,
  tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" })],
});

/** Route a single exhausted page of the three fixtures + an empty `listChats` (empty resume map). */
async function routeThree(page: Page): Promise<void> {
  await routeTrpc(page, {
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": () => [],
  });
}

test("§4.2 the favorites strip surfaces starred characters as select-only avatars", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  const strip = component.getByRole("list", { name: "Favorite characters" });
  await expect(strip.getByRole("button", { name: "Open Starla" })).toBeVisible();
  // Bolt is not starred → not in the strip.
  await expect(strip.getByRole("button", { name: "Open Bolt" })).toHaveCount(0);
});

test("§4.5 the Favorites filter chip narrows to starred rows", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Bolt")).toBeVisible();
  await component.getByRole("button", { name: "Show only favorites" }).click();
  await expect(component.getByText("Bolt")).toHaveCount(0);
  await expect(component.getByText("Cassius")).toHaveCount(0);
});

test("§4.3 the Group toggle switches to categorized view (an Uncategorized bucket)", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Group by tag" }).click();
  // Starla + Bolt have no tags → the trailing Uncategorized category header.
  await expect(component.getByText("Uncategorized")).toBeVisible();
});

// TAG EXCLUSION (the three-state chip) — "everything tagged X that ISN'T tagged Y" is a query shape a
// pure-AND multi-select cannot express, and neither our lineage nor neo ever built it. The chip cycles
// off → include → exclude → off, and it SAYS which state it is in (the state is the affordance's
// accessible name, not a colour).
test("a tag chip cycles include → exclude → off, and exclusion hides the rows carrying the tag", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Cassius")).toBeVisible();

  // 1) OFF → INCLUDE: only the tagged row survives.
  await component.getByRole("button", { name: "Filter by rpg: off" }).click();
  await expect(component.getByText("Cassius")).toBeVisible();
  await expect(component.getByText("Starla")).toHaveCount(0);

  // 2) INCLUDE → EXCLUDE: the tagged row is the only one gone.
  await component.getByRole("button", { name: "Filter by rpg: included" }).click();
  await expect(component.getByText("Starla")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(component.getByText("Cassius")).toHaveCount(0);

  // 3) EXCLUDE → OFF: the whole library is back.
  await component.getByRole("button", { name: "Filter by rpg: excluded" }).click();
  await expect(component.getByText("Cassius")).toBeVisible();
  await expect(component.getByRole("button", { name: "Filter by rpg: off" })).toBeVisible();
});

// RENDERED, at the docked LIST width: the three chip states must be distinguishable WITHOUT colour (an
// excluded chip carries a strike, an included one does not), and a chip is a real tap target at the
// narrowest real host, not a text sliver. Computed style + box, never the class string.
const CHIP_TAP_FLOOR_PX = 32;

test("the excluded chip is distinguishable without colour, and every chip clears the tap floor", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={360} />);

  const off = component.getByRole("button", { name: "Filter by rpg: off" });
  await expect(off).toBeVisible();
  expect((await off.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(CHIP_TAP_FLOOR_PX);
  await expect(off).toHaveCSS("text-decoration-line", "none");

  await off.click();
  const included = component.getByRole("button", { name: "Filter by rpg: included" });
  await expect(included).toHaveCSS("text-decoration-line", "none");
  expect((await included.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(CHIP_TAP_FLOOR_PX);

  await included.click();
  const excluded = component.getByRole("button", { name: "Filter by rpg: excluded" });
  await expect(excluded).toHaveCSS("text-decoration-line", "line-through");
  expect((await excluded.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(CHIP_TAP_FLOOR_PX);
});

test("§4.6 bulk mode reveals row checkboxes + the selection bar", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: "Select Bolt" }).click();
  // The selection bar's bulk actions appear once a row is selected.
  await expect(component.getByRole("button", { name: "Tag", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
});

// D1 — a chip-induced empty over the loaded window must NOT show search copy nor dead-end: a favorite that
// lives only on a LATER page is reachable via a Load more affordance. Page 1 is large enough that the
// virtual list does not auto-tail-fetch, so filtering to favorites (none on page 1) yields the chip-empty.
const PAGE1_FILLERS = Array.from({ length: 40 }, (_, i) => makeCharacterSummary({ id: `char_fill_${i}`, name: `Filler ${i}`, createdAt: 9000 - i }));
const LATE_FAVORITE = makeCharacterSummary({
  id: "char_late_fav",
  name: "Zephyr",
  starred: true,
  createdAt: 100,
});
const PAGE1_CURSOR_LATE = { createdAt: 8961, id: "char_fill_39" };

test("D1 a favorites-chip empty over the loaded window offers Load more, reaching a later-page favorite", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": (input: unknown) =>
      (input as { cursor?: unknown } | undefined)?.cursor === undefined
        ? { items: PAGE1_FILLERS, nextCursor: PAGE1_CURSOR_LATE }
        : { items: [LATE_FAVORITE], nextCursor: null },
    "chat.listChats": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Filler 0")).toBeVisible();

  await component.getByRole("button", { name: "Show only favorites" }).click();
  // NOT the search copy (no search was typed), and NOT a dead end — the chip-empty offers Load more.
  await expect(component.getByText("No matches in view")).toBeVisible();
  const loadMore = component.getByRole("button", { name: "Load more" });
  await expect(loadMore).toBeVisible();

  await loadMore.click();
  // Page 2 holds the only favorite — it is now reachable.
  await expect(component.getByText("Zephyr")).toBeVisible();
});

// F1 (stickler 2026-08-01) — the toolbar's second row is a flex race: the sort `Select`'s trigger carries
// FIELD_CONTROL's `w-full`, so at rest it claimed the whole row and left the `flex-1` search Input at its
// ~26px minimum (measured: trigger 298.5px, input 26px — an invisible search box). This asserts the
// RENDERED geometry at the docked LIST width, never the class string: a class-level assertion is exactly
// what would have passed while the pixels were broken.
const SEARCH_MIN_USABLE_PX = 140;

test("F1 the sort Select cannot crush the search box — search keeps the row's width", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={360} />);
  await expect(component.getByText("Bolt")).toBeVisible();

  const searchBox = await component.getByRole("textbox", { name: "Search characters" }).boundingBox();
  const sortBox = await component.getByRole("combobox", { name: "Sort characters" }).boundingBox();

  expect(searchBox?.width ?? 0).toBeGreaterThanOrEqual(SEARCH_MIN_USABLE_PX);
  // Search is the row's PRIMARY control; the sort is secondary and takes only its own label.
  expect(searchBox?.width ?? 0).toBeGreaterThan(sortBox?.width ?? 0);
});

/** The tag LIBRARY the picker suggests from (`tag.listTagsWithUsage` — the same read the config rail's
 *  Tags collection uses, so opening a picker rides that cache instead of minting a second one). */
const TAG_LIBRARY = [
  { ...makeTagFixture({ id: "tag_adventure", name: "adventure" }), usage: { characters: 5, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 5 } },
  { ...makeTagFixture({ id: "tag_fantasy", name: "fantasy" }), usage: { characters: 12, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 12 } },
];

test("D2 the bulk Tag action opens a picker and applies a tag to the selection", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": () => [],
    "tag.listTagsWithUsage": () => TAG_LIBRARY,
    "character.bulkAddCardTag": () => ({ tagged: 1 }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: "Select Bolt" }).click();
  await component.getByRole("button", { name: "Tag", exact: true }).click();

  // The picker Dialog is portaled outside the mount root — query it via `page`. Barrier on the SETTLED
  // resting copy first: the suggestion source is a query, and the confirm's label depends on whether the
  // typed name matched it, so a fill before it lands would read the pre-load arm.
  await expect(page.getByText("Start typing to search your 2 tags.")).toBeVisible();
  await page.getByRole("combobox", { name: "Tag name" }).fill("adventure");
  // The suggestion popup is an overlay anchored under the field — dismiss it the way a user does before
  // reaching the footer (picking a suggestion, the other path, is its own test below).
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Apply" }).click();
  // The mutation carries the typed tag + exactly the selected id (assertion-quality audit 2026-07-24:
  // the selection-cleared check alone left the wire payload unpinned).
  await expect
    .poll(() => trpc.lastInput("character.bulkAddCardTag"), { intervals: [20, 50, 100] })
    .toMatchObject({ tagName: "adventure", characterIds: ["char_bolt2"] });
  // Applying clears the selection → the bulk bar (its Tag action) is gone.
  await expect(component.getByRole("button", { name: "Tag", exact: true })).toHaveCount(0);
});

// AUTOCOMPLETE (the duplicate-rot fix): at ~400 tags a bare text box is how "fantasy", "Fantasy" and
// "fantsy" all become separate tags. The picker suggests what already exists, and CREATING is a labelled
// act — the confirm says which of the two things the click will do.
test("the tag picker suggests EXISTING tags as you type, and picking one attaches it", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": () => [],
    "tag.listTagsWithUsage": () => TAG_LIBRARY,
    "character.bulkAddCardTag": () => ({ tagged: 1 }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: "Select Bolt" }).click();
  await component.getByRole("button", { name: "Tag", exact: true }).click();

  const field = page.getByRole("combobox", { name: "Tag name" });
  await field.click();
  await field.pressSequentially("fan");
  // The near-duplicate is offered before it can be re-typed as a new tag.
  await page.getByRole("option", { name: "fantasy" }).click();
  await expect(field).toHaveValue("fantasy");

  // The confirm names the ATTACH arm — nothing is being created.
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect
    .poll(() => trpc.lastInput("character.bulkAddCardTag"), { intervals: [20, 50, 100] })
    .toMatchObject({ tagName: "fantasy", characterIds: ["char_bolt2"] });
});

test("a name that matches nothing makes CREATING the deliberate, labelled act", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": () => [],
    "tag.listTagsWithUsage": () => TAG_LIBRARY,
    "character.bulkAddCardTag": () => ({ tagged: 1 }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: "Select Bolt" }).click();
  await component.getByRole("button", { name: "Tag", exact: true }).click();

  const field = page.getByRole("combobox", { name: "Tag name" });
  await field.click();
  await field.pressSequentially("fantsy");
  // The field says which of the two things is about to happen…
  await expect(page.getByText('Creates a new tag "fantsy".')).toBeVisible();
  // …and the confirm stops saying "Apply": it says what it will actually do.
  await expect(page.getByRole("button", { name: 'Create "fantsy"' })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
});

// THE POPUP IS AN OVERLAY OVER THE CONFIRM. With nothing to suggest it used to open anyway — a box reading
// "no match" that physically intercepted the pointer on the Create button, and (Base UI hides outside
// content from AT while a combobox popup is open) took that button out of the accessibility tree. A
// suggestion list with nothing to suggest must not open at all.
test("a no-match query opens NO popup — the confirm stays clickable and in the a11y tree", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": () => [],
    "tag.listTagsWithUsage": () => TAG_LIBRARY,
    "character.bulkAddCardTag": () => ({ tagged: 1 }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: "Select Bolt" }).click();
  await component.getByRole("button", { name: "Tag", exact: true }).click();

  const field = page.getByRole("combobox", { name: "Tag name" });
  await field.click();
  await field.pressSequentially("fantsy");
  await expect(page.locator('[data-slot="autocomplete-popup"]')).toHaveCount(0);

  // Clickable WITHOUT dismissing anything first — a real pointer click, no force.
  await page.getByRole("button", { name: 'Create "fantsy"' }).click();
  await expect.poll(() => trpc.lastInput("character.bulkAddCardTag"), { intervals: [20, 50, 100] }).toMatchObject({ tagName: "fantsy" });
});

test("D4 the create dialog gates Create on BOTH name and description, with the requirement shown", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  // The band's ONE primary opens the create dialog directly (the ratified band anatomy — no split menu).
  // The Dialog is portaled outside the mount root — query its fields via `page`.
  await component.getByRole("button", { name: "New", exact: true }).click();

  const create = page.getByRole("button", { name: "Create", exact: true });
  await expect(create).toBeDisabled();
  await expect(page.getByText("A name and a description are both required.")).toBeVisible();

  await page.getByRole("textbox", { name: "Character name" }).fill("Elara");
  // Name alone is not enough — description is required (§4.1).
  await expect(create).toBeDisabled();

  await page.getByRole("textbox", { name: "Character description" }).fill("A sharp-tongued map-maker.");
  await expect(create).toBeEnabled();
  await expect(page.getByText("A name and a description are both required.")).toHaveCount(0);
});

// ⑪ — the library page size is the user's `UserSettings.library.pageSize` (a consumer-supplied param into
// createCollectionSurface, not a factory-internal settings read). A custom pageSize reaches the
// `character.list` request's `limit`; unset falls to the schema default (30), byte-identical to pre-wire.
function settingsView(pageSize: number): unknown {
  return {
    userId: "user_ct_lib",
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, library: { pageSize } },
    updatedAt: 0,
  };
}

test("⑪ the user's library.pageSize threads into the character.list request limit", async ({ mount, page }) => {
  const trpc: TrpcRecorder = await routeTrpc(page, {
    "settings.getUserSettings": () => settingsView(42),
    "character.list": twoPageResponder,
  });
  await mount(<CharacterLibrarySurfaceStory />);
  await expect(page.getByText("Aria Nightshade")).toBeVisible();
  await expect.poll(() => (trpc.lastInput("character.list") as { limit?: number } | undefined)?.limit, { intervals: [20, 50, 100] }).toBe(42);
});

test("⑪ with no stored pageSize, the request falls to the schema default (30)", async ({ mount, page }) => {
  const trpc: TrpcRecorder = await routeTrpc(page, {
    "settings.getUserSettings": () => settingsView(DEFAULT_USER_SETTINGS.library.pageSize),
    "character.list": twoPageResponder,
  });
  await mount(<CharacterLibrarySurfaceStory />);
  await expect(page.getByText("Aria Nightshade")).toBeVisible();
  await expect.poll(() => (trpc.lastInput("character.list") as { limit?: number } | undefined)?.limit, { intervals: [20, 50, 100] }).toBe(30);
});

// ── The card-import DROP path (the owner-reported P1) ──────────────────────────────────────────────
// Dropping a character card onto "Import card" used to do nothing at all: zero requests, no error. These
// drive the real product path (the band's Import ghost → DROP) and assert the multipart POST fires, and that
// a card the server can't read gets a LOUD toast naming why instead of a fabricated "Card imported."
// The story carries the real toast surface, so these assert RENDERED toasts — not the console fallback they
// used to read (that fallback only fires while `notify` is unbound, which it no longer is in this module).

const A_DROPPED_CARD = { name: "villain.png", mimeType: "image/png", content: "PNG" };
const TOAST_ROOT = '[data-slot="toast-root"]';
const IMPORT_DIALOG_TITLE = "Import a character card";

/** Open the band's Import dialog (the ghost beside New — import's ONE home) and return its dropzone. */
async function openImportDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Import a character card" }).click();
  // BY NAME, not by role alone: a toast is itself a `dialog`/`alertdialog` node, so a bare role lookup goes
  // ambiguous the moment the import reports its outcome.
  const dialog = page.getByRole("dialog", { name: IMPORT_DIALOG_TITLE });
  await expect(dialog).toBeVisible();
  return dialog.locator('[data-slot="file-dropzone"]');
}

test("dropping a card on the Import dialog fires the multipart POST and reports success", async ({ mount, page }) => {
  await routeThree(page);
  const uploads: string[] = [];
  await page.route("**/api/import", async (route) => {
    uploads.push(route.request().method());
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imported: [{ filename: "villain.png", created: true }], failed: [] }),
    });
  });

  await mount(<CharacterLibrarySurfaceStory />);
  await dropFiles(await openImportDialog(page), [A_DROPPED_CARD]);

  await expect.poll(() => uploads, { intervals: [20, 50, 100] }).toEqual(["POST"]);
  await expect(page.locator(TOAST_ROOT)).toContainText("Card imported.");
  // A successful import closes the dialog.
  await expect(page.getByRole("dialog", { name: IMPORT_DIALOG_TITLE })).toHaveCount(0);
});

test("a PNG with no character data gets a LOUD toast naming why, and the dialog stays open", async ({ mount, page }) => {
  await routeThree(page);
  // The per-card-isolation shape: a 200 whose `failed[]` carries the server's own reason.
  await page.route("**/api/import", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imported: [],
        failed: [{ filename: "villain.png", error: "No character data found in this PNG (no ccv3/chara card chunk)" }],
      }),
    });
  });

  await mount(<CharacterLibrarySurfaceStory />);
  await dropFiles(await openImportDialog(page), [A_DROPPED_CARD]);

  const toast = page.locator(TOAST_ROOT);
  await expect(toast).toContainText("No character data found in this PNG");
  // The refusal is LOUD (the destructive tint), and never a fabricated success beside it.
  await expect(toast).toHaveAttribute("data-type", "error");
  await expect(page.locator(TOAST_ROOT, { hasText: "Card imported." })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: IMPORT_DIALOG_TITLE })).toBeVisible();
});
