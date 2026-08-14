// CT: the character library surface end-to-end. Drives the PRODUCTION path — `character.list`
// (routeTrpc, keyset-paged) → `createCollectionSurface`'s `useInfiniteQuery` → the virtualized card
// list. Asserts: the first page renders AND the tail-fetch guard auto-pulls the second page (the story's
// 480px/2-row viewport puts every row within the default 12-row `endApproachRows` window, so the guard
// fires without a real scroll gesture); an empty library, a no-match search and a no-match FILTER each get
// their own honest empty state; a scripted read failure shows the error state with a working Retry.
//
// EVERY LENS IS THE SERVER'S (owner ruling 2026-08-13). The stub is INPUT-AWARE (`characterListResponder`)
// so these drive the real semantics: a fixed-array responder would let every search/filter assertion pass
// while the client filtered a ≤150-row window, which is precisely the defect that shipped. The pins that
// state the fix: a match beyond the loaded page is FOUND; a chip narrows the request, not the array; the
// chip vocabulary comes from the TAG LIBRARY (so an active filter always has a chip); the head page is
// never evicted; the counts are the server's census.
//
// NOTE (mirrors message-list-surface.ct.tsx's own note): `trpc.character.list` is stubbed at the NETWORK
// (routeTrpc) — the responder inspects the decoded input (cursor · search · chips) to serve its page.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { dropFiles } from "../../../../support/ct/drop-files.ts";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { chatListResponder } from "../../chat/fixtures.ts";
import { CharacterLibrarySurfaceStory } from "../_ct-stories.tsx";
import { characterListResponder, makeCharacterSummary, makeTagFixture } from "../fixtures.ts";

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
const THREE_ROW_TOTAL = 3;

/** A two-page keyset series: page 1 = [ARIA, BOLT] + a cursor; page 2 = [CASSIUS], exhausted. Both pages
 *  carry the SAME census — every page of one keyset run counts the same scope. */
function twoPageResponder(input: unknown): unknown {
  const cursor = (input as { cursor?: unknown } | undefined)?.cursor;
  return cursor === undefined
    ? { items: [ARIA, BOLT], nextCursor: PAGE_1_CURSOR, totalCount: THREE_ROW_TOTAL }
    : { items: [CASSIUS], nextCursor: null, totalCount: THREE_ROW_TOTAL };
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

// THE OWNER'S P1 (2026-08-13): searching found only what the client had already paged in. The pin is a
// match that is NOT on the loaded page — under the old client-side filter the box could only ever have
// answered "No matches" for her, over a library that plainly contains her.
test("the search box asks the SERVER — a match beyond the loaded page is found", async ({ mount, page }) => {
  const library = [
    ...Array.from({ length: 40 }, (_unused, at) => makeCharacterSummary({ id: `char_fill_${String(at)}`, name: `Filler ${String(at)}`, createdAt: 9000 - at })),
    makeCharacterSummary({ id: "char_deep", name: "Zephyrine", createdAt: 10 }),
  ];
  const trpc = await routeTrpc(page, { "character.list": characterListResponder(library), "chat.listChats": chatListResponder([]) });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Filler 0")).toBeVisible();
  await component.getByPlaceholder("Search characters…").fill("zephyr");

  // The term went over the wire…
  await expect.poll(() => (trpc.lastInput("character.list") as { search?: string } | undefined)?.search, { intervals: [50, 100, 200] }).toBe("zephyr");
  // …and the row it matched is on screen even though it was never in the loaded window.
  await expect(component.getByText("Zephyrine")).toBeVisible();
  await expect(component.getByText("Filler 0")).toHaveCount(0);
});

test("an empty library shows the 'no characters yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": characterListResponder([]) });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("No characters yet")).toBeVisible();
});

test("a search with no matches shows the 'no matches' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": characterListResponder([ARIA, BOLT, CASSIUS]), "chat.listChats": chatListResponder([]) });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Cassius")).toBeVisible();
  await component.getByPlaceholder("Search characters…").fill("nonexistent-name");

  // An HONEST claim now that the predicate is the server's: the whole library was searched.
  await expect(component.getByText("No matches")).toBeVisible();
  await expect(component.getByText('No character matches "nonexistent-name".')).toBeVisible();
});

test("a read failure shows the error state with a working Retry (rule 1 — no dead ends)", async ({ mount, page }) => {
  // First read fails; after Retry the responder recovers — the list renders without a remount.
  //
  // The pane issues THREE `character.list` reads now (the paged collection, the favorites strip's own
  // `starred: true` page, and the band's `limit: 1` census), so the failure has to be aimed at the
  // COLLECTION: a bare first-call latch would spend itself on whichever read happened to go first and the
  // list would render fine, which is a test that proves nothing about its own subject.
  let failed = false;
  await routeTrpc(page, {
    "character.list": (input: unknown) => {
      const args = (input ?? {}) as { starred?: boolean; limit?: number };
      const isCollection = args.starred === undefined && args.limit !== 1;
      if (isCollection && !failed) {
        failed = true;
        return trpcError();
      }
      return { items: isCollection ? [BOLT] : [], nextCursor: null, totalCount: 1 };
    },
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => [],
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

/** The tag LIBRARY the chips are drawn from (`tag.listTagsWithUsage`) — the vocabulary is the owner's tags
 *  now, not the loaded rows', so it has to be routed wherever a chip is asserted. */
function tagLibraryOf(...names: readonly { readonly id: string; readonly name: string; readonly characters: number }[]): unknown {
  return names.map((tag) => ({
    ...makeTagFixture({ id: tag.id, name: tag.name }),
    usage: { characters: tag.characters, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: tag.characters },
  }));
}

const RPG_TAG_LIBRARY = tagLibraryOf({ id: "tag_rpg", name: "rpg", characters: 1 });

/** Route the three fixtures through the INPUT-AWARE responder (the chips/search narrow the REQUEST) + an
 *  empty `listChats` (empty resume map) + the tag library the chips come from. */
function routeThree(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "character.list": characterListResponder([STARLA, BOLT2, TAGGED]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => RPG_TAG_LIBRARY,
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

test("§4.5 the Favorites filter chip narrows the SERVER read to starred rows", async ({ mount, page }) => {
  const trpc = await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Bolt")).toBeVisible();
  await component.getByRole("button", { name: "Show only favorites" }).click();
  await expect(component.getByText("Bolt")).toHaveCount(0);
  await expect(component.getByText("Cassius")).toHaveCount(0);
  await expect(component.getByText("Starla")).toBeVisible();
  // The narrowing is a REQUEST, not an array pass — which is what makes it reach past the loaded window.
  await expect.poll(() => (trpc.lastInput("character.list") as { starred?: boolean } | undefined)?.starred, { intervals: [50, 100] }).toBe(true);
});

test("§4.3 the Group toggle switches to categorized view (an Uncategorized bucket)", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Group by tag" }).click();
  // Starla + Bolt have no tags → the trailing Uncategorized category header.
  await expect(component.getByText("Uncategorized")).toBeVisible();
});

// The two group headers of the C9-1d case below. EXACT names: a group header's accessible name is the tag
// name plus its member count ("noir 1"), and a substring match also catches the filter CHIP for the same
// tag ("Filter by noir: off — …") — two different controls, one of which is not what this test is about.
const OPEN_GROUP_HEADER = "noir 1";
const PLAIN_GROUP_HEADER = "rpg 1";

// C9-1d — TAGS AS FOLDERS, the OPEN arm. `folderType` was a write-only column until this: the tag editor
// wrote it and no surface branched on it. The proof is RENDERED, not structural — a member of an OPEN
// folder is on screen at first paint, a member of a plain tag's group is not until you open it.
test("C9-1d an OPEN tag's group starts EXPANDED; a plain tag's group starts collapsed but opens on click", async ({ mount, page }) => {
  const inOpenFolder = makeCharacterSummary({
    id: "char_open",
    name: "Marlowe",
    createdAt: 3000,
    tags: [makeTagFixture({ id: "tag_noir", name: "noir", folderType: "OPEN" })],
  });
  const inPlainGroup = makeCharacterSummary({
    id: "char_plain",
    name: "Cassius",
    createdAt: 2000,
    tags: [makeTagFixture({ id: "tag_rpg", name: "rpg", folderType: "NONE" })],
  });
  await routeTrpc(page, {
    "character.list": characterListResponder([inOpenFolder, inPlainGroup]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => tagLibraryOf({ id: "tag_noir", name: "noir", characters: 1 }, { id: "tag_rpg", name: "rpg", characters: 1 }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Group by tag" }).click();

  // Both HEADERS are always there — collapsing hides members, never the group itself. (The header's
  // accessible name is the tag name PLUS its count, so both locators match by substring.)
  await expect(component.getByRole("button", { name: OPEN_GROUP_HEADER, exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: PLAIN_GROUP_HEADER, exact: true })).toBeVisible();

  await expect(component.getByText("Marlowe")).toBeVisible();
  await expect(component.getByText("Cassius")).toHaveCount(0);

  // The collapsed group is not a dead end: its header opens it, and the user's toggle wins from then on.
  await component.getByRole("button", { name: PLAIN_GROUP_HEADER, exact: true }).click();
  await expect(component.getByText("Cassius")).toBeVisible();
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

// D1, RE-AIMED (2026-08-13). The old shape of this pin was "a favorite that lives only on a LATER page is
// reachable via Load more" — an affordance that existed because the chip filtered the LOADED WINDOW and the
// only cure for a miss was fetching more of the library into the browser. With the chip on the server there
// is no window to be outside of: the favorite comes back on the FIRST page of the filtered read, and the
// "load more to keep looking" copy would now be a dead end pretending to be a next step.
const PAGE1_FILLERS = Array.from({ length: 40 }, (_, i) => makeCharacterSummary({ id: `char_fill_${i}`, name: `Filler ${i}`, createdAt: 9000 - i }));
const LATE_FAVORITE = makeCharacterSummary({
  id: "char_late_fav",
  name: "Zephyr",
  starred: true,
  createdAt: 100,
});

test("D1 a favorite that lives deep in the library arrives on the FIRST page of the filtered read", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": characterListResponder([...PAGE1_FILLERS, LATE_FAVORITE]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Filler 0")).toBeVisible();

  await component.getByRole("button", { name: "Show only favorites" }).click();
  // No "No matches in view", no Load more — the row itself, straight away.
  await expect(component.getByText("Zephyr")).toBeVisible();
  await expect(component.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

// THE EVICTION TRAP (the owner's "characters vanish as I scroll"). `maxPages: 5` with
// `getPreviousPageParam: () => undefined` made the HEAD page unrecoverable: past five pages TanStack dropped
// page 1 and nothing could ever fetch it back. At the settings floor (pageSize 10) six pages is 60 rows.
//
// The proof is the LIVE REGION, not the DOM rows: at the bottom of a 60-row virtualized list the head rows
// are legitimately unmounted either way, so "is row 1 in the DOM" cannot tell eviction from virtualization.
// The readout can: it prints `loaded` against the server census, so a dropped page reads "50 of 60".
const EVICTION_PAGE_SIZE = 10;
const EVICTION_ROWS = 60;
const SCROLL_STEP_PX = 600;
/** The poll IS the scroll loop: each attempt wheels one step and reports whether the tail has arrived, so
 *  the walk needs no `waitForTimeout` and no awaits inside a `for` (both banned in CTs, and both would be
 *  a fixed sleep standing in for the settle this actually waits on). */
const SCROLL_POLL = { intervals: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], timeout: 20_000 };

test("the head page is NEVER evicted — all six pages stay loaded through a deep scroll", async ({ mount, page }) => {
  const library = Array.from({ length: EVICTION_ROWS }, (_unused, at) =>
    makeCharacterSummary({ id: `char_deep_${String(at)}`, name: `Deep ${String(at).padStart(2, "0")}`, createdAt: 100_000 - at }),
  );
  await routeTrpc(page, {
    "settings.getUserSettings": () => settingsView(EVICTION_PAGE_SIZE),
    "character.list": characterListResponder(library),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Deep 00")).toBeVisible();

  // Walk to the tail the way a user does — each step lets the tail-fetch guard pull the next page.
  const list = component.getByRole("list", { name: "Character library" });
  await list.hover();
  const tail = component.getByText("Deep 59");
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, SCROLL_STEP_PX);
      return tail.count();
    }, SCROLL_POLL)
    .toBeGreaterThan(0);
  // Sixty loaded of sixty — never "50 of 60", which is what a silently dropped head page reads as.
  await expect(component.getByRole("status")).toHaveText(`${String(EVICTION_ROWS)} characters`);
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
    "chat.listChats": chatListResponder([]),
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
  // NO dismissal step (side-eye 2026-08-03 P0): the suggestions are in flow now, so the footer is never
  // covered — and typing an EXACT library name ends the suggesting outright.
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
    "chat.listChats": chatListResponder([]),
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
    "chat.listChats": chatListResponder([]),
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
    "chat.listChats": chatListResponder([]),
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE FILTER-CHIP ROW (side-eye 2026-08-03 P1/P2). Uncapped it was a WALL — 22 chips built a 298px block
// in a 290px pane, above the first character row, and it GREW underneath the reader as pages arrived. A
// 72-character tag name (the server accepts one) blew a single chip to 475px inside a 354px container with
// no truncation applied at all. And cycling a chip changed the result set silently.

const NARROW_PANE_PX = 290;
const VISIBLE_CHIPS = 8;
const LONG_TAG = "a-tag-name-long-enough-to-prove-the-chip-clips-instead-of-overflowing-x";
/** A chip past the cap, addressed by its name prefix (its state word changes as it cycles). */
const BEYOND_CAP_CHIP = /^Filter by bulk-11:/u;

/** `count` tags in the owner's LIBRARY (the chip vocabulary's source since 2026-08-13 — it used to be the
 *  loaded rows' tags, which is how an active filter could render no chip at all), all carried by one
 *  character so the chips are live. */
function routeManyTags(page: Page, count: number, extra: readonly { readonly id: string; readonly name: string }[] = []): Promise<TrpcRecorder> {
  const tags = [
    ...Array.from({ length: count }, (_unused, at) => makeTagFixture({ id: `tag_bulk_${String(at)}`, name: `bulk-${String(at).padStart(2, "0")}` })),
    ...extra.map((one) => makeTagFixture(one)),
  ];
  return routeTrpc(page, {
    "character.list": characterListResponder([makeCharacterSummary({ id: "char_tagged", name: "Tagged One", createdAt: 3000, tags })]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => tags.map((tag) => ({ ...tag, usage: { characters: 1, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 1 } })),
  });
}

test("the chip row is CAPPED, and the rest are one disclosure away", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={NARROW_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();

  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(VISIBLE_CHIPS);
  await component.getByRole("button", { name: "+4 more" }).click();
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(12);
  await component.getByRole("button", { name: "Show fewer" }).click();
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(VISIBLE_CHIPS);
});

test("an ACTIVE chip is never hidden by the cap (a filter you cannot see is one you cannot turn off)", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={NARROW_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();

  await component.getByRole("button", { name: "+4 more" }).click();
  await component.getByRole("button", { name: BEYOND_CAP_CHIP }).click();
  await component.getByRole("button", { name: "Show fewer" }).click();
  await expect(component.getByRole("button", { name: BEYOND_CAP_CHIP })).toBeVisible();
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(VISIBLE_CHIPS + 1);
});

test("a 72-character tag name TRUNCATES inside the pane instead of overflowing it", async ({ mount, page }) => {
  await routeManyTags(page, 0, [{ id: "tag_long", name: LONG_TAG }]);
  const component = await mount(<CharacterLibrarySurfaceStory width={NARROW_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();

  const chip = component.locator("[data-tag-filter-state]");
  const chipBox = await chip.boundingBox();
  const paneBox = await component.boundingBox();
  expect(chipBox).not.toBeNull();
  // RENDERED containment: the chip's right edge stays inside the pane it lives in.
  expect((chipBox?.x ?? 0) + (chipBox?.width ?? 0)).toBeLessThanOrEqual((paneBox?.x ?? 0) + NARROW_PANE_PX);
  // …and it is TRUNCATION, not a lucky short name: the label's content is wider than its box.
  const overflowing = await chip.locator('[data-slot="text"]').evaluate((el: Element): boolean => el.scrollWidth > el.clientWidth);
  expect(overflowing).toBe(true);
  // The full name survives for a pointer; the accessible name already carried it whole.
  await expect(chip).toHaveAttribute("title", LONG_TAG);
  await expect(chip).toHaveAttribute("aria-label", `Filter by ${LONG_TAG}: off — activate to include`);
});

test("a chip's accessible name states the ACTION, not just the state, around the whole cycle", async ({ mount, page }) => {
  await routeManyTags(page, 1);
  const component = await mount(<CharacterLibrarySurfaceStory width={NARROW_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();

  const chip = component.locator("[data-tag-filter-state]");
  await expect(chip).toHaveAttribute("aria-label", "Filter by bulk-00: off — activate to include");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-label", "Filter by bulk-00: included — activate to exclude");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-label", "Filter by bulk-00: excluded — activate to clear");
});

test("cycling a chip SPEAKS the new result count (it changed the list silently before)", async ({ mount, page }) => {
  await routeManyTags(page, 1);
  const component = await mount(<CharacterLibrarySurfaceStory width={NARROW_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();

  const status = component.getByRole("status");
  await expect(status).toHaveText("1 character");
  // Excluding the only tag on the only character empties the list — and says so.
  const chip = component.locator("[data-tag-filter-state]");
  await chip.click();
  await chip.click();
  await expect(status).toHaveText("0 characters");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE INVISIBLE FILTER (the owner's live P1, 2026-08-13 — design doc D1). The chip vocabulary used to be
// derived from the LOADED ROWS, so a persisted tag filter whose tag was on no loaded row rendered NO chip:
// the library came back empty, nothing on screen said why, and the only cure was wiping localStorage.

test("the chip vocabulary is the TAG LIBRARY — a tag no loaded row carries still has a chip", async ({ mount, page }) => {
  await routeTrpc(page, {
    // BOLT2 carries no tags at all, so a row-derived vocabulary would render zero chips here.
    "character.list": characterListResponder([BOLT2]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => tagLibraryOf({ id: "tag_noir", name: "noir", characters: 7 }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Bolt")).toBeVisible();

  await expect(component.getByRole("button", { name: "Filter by noir: off — activate to include" })).toBeVisible();
});

const DEAD_TAG_CHIP = "Filter by Deleted tag: included — activate to exclude";

test("a persisted filter for a DELETED tag still renders a clearable chip (it cannot be an invisible filter)", async ({ mount, page }) => {
  // Seeded BEFORE the page's JS runs: the library store rehydrates at module init, so writing localStorage
  // after mount would prove nothing (the shell-store CT's recipe).
  await page.addInitScript(() => {
    globalThis.localStorage.setItem("orb:character-library", JSON.stringify({ state: { tagFilter: [{ id: "tag_dead_era", state: "include" }] }, version: 2 }));
  });
  await page.reload();
  await routeTrpc(page, {
    "character.list": characterListResponder([BOLT2]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => tagLibraryOf({ id: "tag_noir", name: "noir", characters: 7 }),
  });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  // The filter is REAL (no row carries a tag that no longer exists, so the list is empty) — and it now says
  // so out loud instead of leaving an unexplained empty library.
  await expect(component.getByRole("button", { name: DEAD_TAG_CHIP })).toBeVisible();
  // …and clearing it is the same cycle as any other chip: included → excluded → off, list restored.
  await component.getByRole("button", { name: DEAD_TAG_CHIP }).click();
  await component.getByRole("button", { name: "Filter by Deleted tag: excluded — activate to clear" }).click();
  await expect(component.getByText("Bolt")).toBeVisible();
});

// THE BAND'S COUNT (owner-facing honesty): it was deleted when the list went keyset-paged, because the only
// number available then was "loaded so far". The server serves a census now, so it prints again — and it is
// the LIBRARY's count, never the loaded page's.
const LIBRARY_CENSUS = 412;
const COUNT_ONLY_PAGE = 1;

test("the list band prints the server census, not the loaded row count", async ({ mount, page }) => {
  const rows = characterListResponder([STARLA, BOLT2, TAGGED]);
  await routeTrpc(page, {
    "character.list": (input: unknown) => {
      const args = (input ?? {}) as { limit?: number };
      // The band asks for the cheapest possible page and reads `totalCount` off it.
      return args.limit === COUNT_ONLY_PAGE ? { items: [STARLA], nextCursor: null, totalCount: LIBRARY_CENSUS } : rows(input);
    },
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => RPG_TAG_LIBRARY,
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByTestId("list-band")).toContainText(String(LIBRARY_CENSUS));
  // The pane's own live region stays the FILTER's answer — three rows loaded, three matched.
  await expect(component.getByRole("status")).toHaveText("3 characters");
});
