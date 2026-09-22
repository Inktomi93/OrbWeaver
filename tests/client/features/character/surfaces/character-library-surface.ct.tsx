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

import { chatWithActionName, rowActionSubject, rowActionsName, selectActionName } from "@orb/client/lib";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { dropFiles } from "../../../../support/browser/drop-files.ts";
import type { TrpcFixtureOutput, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { chatListResponder } from "../../chat/fixtures.ts";
import { CharacterLibrarySurfaceStory } from "../_ct-stories.tsx";
import type { CharacterListResponder } from "../fixtures.ts";
import { characterListResponder, makeCharacterSummary, makeTagFixture } from "../fixtures.ts";

/**
 * THE LIBRARY PLANE'S AMBIENT READS (#649) — spread FIRST into every `routeTrpc` call in this file.
 *
 * Neither is this file's subject: the library CTs are about paging, search, filters and the census. But the
 * plane mounts the editor pane beside the list, so it fires `chat.listChats`, and `createCollectionSurface`
 * reads the viewer's `library.pageSize` off the settings row. Unfed, both resolved `routeTrpc`'s null — the
 * chat-list pipeline never ran at all and the page-size resolve fell to its no-settings default, so a
 * regression in either was invisible to all thirty-one mounts here.
 *
 * The page size is the SCHEMA DEFAULT, which is exactly what the unfed fallback produced (`settingsView`'s
 * own note, below) — so this feeds the pipeline without moving any existing assertion. A test that needs a
 * different size lists `settings.getUserSettings` AFTER the spread and wins (the eviction test does).
 */
const LIBRARY_AMBIENT_ROUTES: TrpcRoutes<"settings.getUserSettings" | "chat.listChats" | "character.listTagGroups"> = {
  "settings.getUserSettings": { userId: "user_ct_lib", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
  "chat.listChats": chatListResponder([]),
  // The GROUP-BY-TAG census (#1696). Ambient because the categorized view asks for it the moment it is
  // switched on, and an unrouted read leaves the buckets in their PENDING arm — which renders no counts at
  // all, so a CT that forgot it would be asserting the loading state. Tests that care about the numbers
  // override this key with their own census; this default is "there is nothing to say", which is the honest
  // answer for the untagged three-row fixtures most of this file mounts.
  "character.listTagGroups": () => ({ groups: [], uncategorized: 0 }),
};

/** A census as `character.listTagGroups` answers it — the server's own order, so a CT that overrides it is
 *  writing what the server would send rather than what the client would sort. */
function tagGroupCensus(
  groups: readonly (readonly [string, string, number, TrpcWireOutput<"character.listTagGroups">["groups"][number]["folderType"]])[],
  uncategorized: number,
): TrpcFixtureOutput<"character.listTagGroups"> {
  return {
    groups: groups.map(([id, name, characters, folderType]) => ({ id, name, characters, folderType })),
    uncategorized,
  };
}

/** A library ROW, by its character's name.
 *
 *  `getByText` cannot address one any more, and that is a FIXTURE-REALISM fix rather than a workaround
 *  (#492): `makeCharacterSummary` now mints the handle the server would mint (`Bolt` → `bolt`) instead of a
 *  fixed `char_ct_1`, the row renders the handle as its subtitle when nothing outranks it, and Playwright's
 *  text matching is case-insensitive substring — so `getByText("Bolt")` resolves to the title span AND the
 *  handle line AND the hover reveal. The row's ACCESSIBLE NAME is the precise probe, and it is also the
 *  thing #492 is about, so the row pins address rows the way assistive tech does. */
function row(component: Locator, name: string): Locator {
  return component.getByRole("button", { name, exact: true });
}

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
function twoPageResponder(input: Parameters<CharacterListResponder>[0]): TrpcFixtureOutput<"character.list"> {
  const cursor = (input as { cursor?: unknown } | undefined)?.cursor;
  return cursor === undefined
    ? { items: [ARIA, BOLT], nextCursor: PAGE_1_CURSOR, totalCount: THREE_ROW_TOTAL }
    : { items: [CASSIUS], nextCursor: null, totalCount: THREE_ROW_TOTAL };
}

test("renders the first page, then auto-fetches the next page (tail-fetch guard)", async ({ mount, page }) => {
  await routeTrpc(page, { ...LIBRARY_AMBIENT_ROUTES, "character.list": twoPageResponder });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(row(component, "Bolt")).toBeVisible();
  // The tail-fetch guard (VirtualList's onEndApproach) pulls page 2 without a scroll gesture — the
  // story's viewport puts every row inside the default endApproachRows window.
  await expect(row(component, "Cassius")).toBeVisible();
});

// THE OWNER'S P1 (2026-08-13): searching found only what the client had already paged in. The pin is a
// match that is NOT on the loaded page — under the old client-side filter the box could only ever have
// answered "No matches" for her, over a library that plainly contains her.
test("the search box asks the SERVER — a match beyond the loaded page is found", async ({ mount, page }) => {
  const library = [
    ...Array.from({ length: 40 }, (_unused, at) => makeCharacterSummary({ id: `char_fill_${String(at)}`, name: `Filler ${String(at)}`, createdAt: 9000 - at })),
    makeCharacterSummary({ id: "char_deep", name: "Zephyrine", createdAt: 10 }),
  ];
  const trpc = await routeTrpc(page, { ...LIBRARY_AMBIENT_ROUTES, "character.list": characterListResponder(library), "chat.listChats": chatListResponder([]) });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Filler 0")).toBeVisible();
  await component.getByPlaceholder("Search characters…").fill("zephyr");

  // The term went over the wire…
  await expect.poll(() => (trpc.lastInput("character.list") as { search?: string } | undefined)?.search, { intervals: [50, 100, 200] }).toBe("zephyr");
  // …and the row it matched is on screen even though it was never in the loaded window.
  await expect(row(component, "Zephyrine")).toBeVisible();
  await expect(component.getByText("Filler 0")).toHaveCount(0);
});

// #532 — ONE New DOOR ON THE PLANE, the third instance of the `duplicate-action-door` class (#520 closed the
// CONTENT hero's; this is the LIST pane's own). This body renders inside the list panel, and `PanelChrome`
// renders the `.shell-panel-header` band with every panel that has a body (D66 A1) — so the band's New is
// unconditionally directly above this state, and the pane's own New was unconditionally a second door.
//
// The story carries the section's REAL band above the surface, so the plane it mounts is the production one
// and the count below is the whole plane's: exactly ONE New, and it is the band's. The teaching survives
// intact and NAMES that primary by its visible label (WCAG 2.5.3 — a voice user says what is written).
/** The empty-library invitation, and the pointer at the BAND's primary by its visible label (#532). */
const EMPTY_LIBRARY_INVITATION = /Weave your first one to begin/u;
const EMPTY_LIBRARY_BAND_DOOR = /use New at the top of this pane/u;

test("#532 an empty library teaches and POINTS at the band's New — it never mints a second door", async ({ mount, page }) => {
  await routeTrpc(page, { ...LIBRARY_AMBIENT_ROUTES, "character.list": characterListResponder([]) });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("No characters yet")).toBeVisible();
  // THE DEFECT, FIRST: the plane carries exactly ONE New, and it is the band's — the empty state must not
  // mint a second one ~200px below it.
  await expect(component.getByRole("button", { name: "New", exact: true })).toHaveCount(1);
  await expect(component.getByTestId("list-band").getByRole("button", { name: "New", exact: true })).toHaveCount(1);
  // …and the teaching is not thinned to pay for it: the invitation survives verbatim, with the pointer at
  // that surviving door ADDED to it, so the state is de-duplicated rather than emptied.
  await expect(component.getByText(EMPTY_LIBRARY_INVITATION)).toBeVisible();
  await expect(component.getByText(EMPTY_LIBRARY_BAND_DOOR)).toBeVisible();
});

test("a search with no matches shows the 'no matches' empty state", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([ARIA, BOLT, CASSIUS]),
    "chat.listChats": chatListResponder([]),
  });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(row(component, "Cassius")).toBeVisible();
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
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": (input) => {
      const args = (input ?? {}) as { starred?: boolean; limit?: number };
      const isCollection = args.starred === undefined && args.limit !== 1;
      if (isCollection && !failed) {
        failed = true;
        return trpcError();
      }
      return { items: isCollection ? [BOLT] : [], nextCursor: null, totalCount: 1 };
    },
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
  });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("Couldn't load the character library.")).toBeVisible();
  await component.getByRole("button", { name: "Retry" }).click();
  await expect(row(component, "Bolt")).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE FILTER RAIL IS A DISCLOSURE NOW (#491, side-eye 2026-08-22 rail-characters). At the owner's library
// the rail was 34% of the desktop pane / 42% of the phone and 18 tab stops (563 with the vocabulary open),
// so the INACTIVE vocabulary is collapsed on first visit. A test about the tag chips therefore opens it the
// way a user does. The pins that state what does NOT collapse — the scope pills, every ACTIVE chip, the
// orphan chips, the `N active` datum — deliberately do not call this.
// #519 — the collapsed trigger ADVERTISES ITS CONTENTS ("More filters" named the act and not one of the
// three things behind it: Favorites, Archived, and a 551-entry tag vocabulary).
const MORE_FILTERS = "Favorites, archived & tags — show more filters";
const FEWER_FILTERS = "Fewer filters — hide the tag vocabulary";
const MORE_FILTERS_LABEL = "Favorites, archived & tags";

async function openFilters(component: Locator): Promise<void> {
  await component.getByRole("button", { name: MORE_FILTERS }).click();
}

/** The FOOT-of-list progress line (#493) — "30 of 327 loaded", absent once the matched set is fully paged
 *  in. Top level: a regex literal built inside a test body is a fresh compile per call. */
const LOADED_PROGRESS = /of \d+ loaded$/u;

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

/** The tag LIBRARY the chips are drawn from (`tag.listTagFilterVocabulary`) — the vocabulary is the owner's tags
 *  now, not the loaded rows', so it has to be routed wherever a chip is asserted. */
function tagLibraryOf(
  ...names: readonly { readonly id: string; readonly name: string; readonly characters: number }[]
): TrpcFixtureOutput<"tag.listTagFilterVocabulary"> {
  return names.map((tag) => ({ id: tag.id, name: tag.name, isHiddenOnCard: false, characters: tag.characters }));
}

const RPG_TAG_LIBRARY: TrpcFixtureOutput<"tag.listTagFilterVocabulary"> = tagLibraryOf({ id: "tag_rpg", name: "rpg", characters: 1 });

/** Route the three fixtures through the INPUT-AWARE responder (the chips/search narrow the REQUEST) + an
 *  empty `listChats` (empty resume map) + the tag library the chips come from. */
function routeThree(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([STARLA, BOLT2, TAGGED]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => RPG_TAG_LIBRARY,
    // The three fixtures as the SERVER would count them: one rpg row, two with no visible tag.
    "character.listTagGroups": () => tagGroupCensus([["tag_rpg", "rpg", 1, "NONE"]], 2),
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
  await expect(row(component, "Bolt")).toBeVisible();
  await openFilters(component);
  await component.getByRole("button", { name: "Show only favorites" }).click();
  await expect(row(component, "Bolt")).toHaveCount(0);
  await expect(row(component, "Cassius")).toHaveCount(0);
  await expect(row(component, "Starla")).toBeVisible();
  // The narrowing is a REQUEST, not an array pass — which is what makes it reach past the loaded window.
  await expect.poll(() => (trpc.lastInput("character.list") as { starred?: boolean } | undefined)?.starred, { intervals: [50, 100] }).toBe(true);
});

test("§4.3 the Group toggle switches to categorized view (an Uncategorized bucket)", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Group by tag" }).click();
  // Starla + Bolt have no tags → the trailing Uncategorized category header. `routeThree`'s census says so.
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
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([inOpenFolder, inPlainGroup]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => tagLibraryOf({ id: "tag_noir", name: "noir", characters: 1 }, { id: "tag_rpg", name: "rpg", characters: 1 }),
    // The census carries `folderType` (#1696) — the grouped view's first paint is decided by it, and since
    // the HEADERS come from the census now, that column has to travel with them rather than be read off a
    // loaded row (which is the window this whole change is getting out of).
    "character.listTagGroups": () =>
      tagGroupCensus(
        [
          ["tag_noir", "noir", 1, "OPEN"],
          ["tag_rpg", "rpg", 1, "NONE"],
        ],
        0,
      ),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Group by tag" }).click();

  // Both HEADERS are always there — collapsing hides members, never the group itself. (The header's
  // accessible name is the tag name PLUS its count, so both locators match by substring.)
  await expect(component.getByRole("button", { name: OPEN_GROUP_HEADER, exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: PLAIN_GROUP_HEADER, exact: true })).toBeVisible();

  await expect(row(component, "Marlowe")).toBeVisible();
  await expect(row(component, "Cassius")).toHaveCount(0);

  // The collapsed group is not a dead end: its header opens it, and the user's toggle wins from then on.
  await component.getByRole("button", { name: PLAIN_GROUP_HEADER, exact: true }).click();
  await expect(row(component, "Cassius")).toBeVisible();
});

// TAG EXCLUSION (the three-state chip) — "everything tagged X that ISN'T tagged Y" is a query shape a
// pure-AND multi-select cannot express, and neither our lineage nor neo ever built it. The chip cycles
// off → include → exclude → off, and it SAYS which state it is in (the state is the affordance's
// accessible name, not a colour).
test("a tag chip cycles include → exclude → off, and exclusion hides the rows carrying the tag", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(row(component, "Cassius")).toBeVisible();
  await openFilters(component);

  // 1) OFF → INCLUDE: only the tagged row survives.
  await component.getByRole("button", { name: "Filter by rpg: off" }).click();
  await expect(row(component, "Cassius")).toBeVisible();
  await expect(row(component, "Starla")).toHaveCount(0);

  // 2) INCLUDE → EXCLUDE: the tagged row is the only one gone.
  await component.getByRole("button", { name: "Filter by rpg: included" }).click();
  await expect(row(component, "Starla")).toBeVisible();
  await expect(row(component, "Bolt")).toBeVisible();
  await expect(row(component, "Cassius")).toHaveCount(0);

  // 3) EXCLUDE → OFF: the whole library is back.
  await component.getByRole("button", { name: "Filter by rpg: excluded" }).click();
  await expect(row(component, "Cassius")).toBeVisible();
  await expect(component.getByRole("button", { name: "Filter by rpg: off" })).toBeVisible();
});

// RENDERED, at the docked LIST width: the three chip states must be distinguishable WITHOUT colour (an
// excluded chip carries a strike, an included one does not), and a chip is a real tap target at the
// narrowest real host, not a text sliver. Computed style + box, never the class string.
//
// THE FLOOR IS THE TOKEN, NOT A LITERAL (retuned 2026-08-17 with program #102 variant B). It read `>= 32`,
// which was the `sm` CONTROL step the chips used to borrow; they ride `--spacing-touch-target` now — the
// pointer-CONDITIONAL tap token, 28px under a mouse and 44px under a finger — so a hardcoded 32 would be
// asserting one pointer class's number against a box that is defined to change with the pointer. Resolving
// the var from the same document is the stronger assertion AND the honest one.

test("the excluded chip is distinguishable without colour, and every chip clears the tap floor", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={360} />);
  await openFilters(component);

  const off = component.getByRole("button", { name: "Filter by rpg: off" });
  await expect(off).toBeVisible();
  const floor = await resolvedPx(component, "--spacing-touch-target");
  expect((await off.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(floor);
  await expect(off).toHaveCSS("text-decoration-line", "none");

  await off.click();
  const included = component.getByRole("button", { name: "Filter by rpg: included" });
  await expect(included).toHaveCSS("text-decoration-line", "none");
  expect((await included.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(floor);

  await included.click();
  const excluded = component.getByRole("button", { name: "Filter by rpg: excluded" });
  await expect(excluded).toHaveCSS("text-decoration-line", "line-through");
  expect((await excluded.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(floor);
});

test("§4.6 bulk mode reveals row checkboxes + the selection bar", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: selectActionName("Bolt") }).click();
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
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([...PAGE1_FILLERS, LATE_FAVORITE]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Filler 0")).toBeVisible();
  await openFilters(component);

  await component.getByRole("button", { name: "Show only favorites" }).click();
  // No "No matches in view", no Load more — the row itself, straight away.
  await expect(row(component, "Zephyr")).toBeVisible();
  await expect(component.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

// THE EVICTION TRAP (the owner's "characters vanish as I scroll"). `maxPages: 5` with
// `getPreviousPageParam: () => undefined` made the HEAD page unrecoverable: past five pages TanStack dropped
// page 1 and nothing could ever fetch it back. At the settings floor (pageSize 10) six pages is 60 rows.
//
// The proof is a READOUT, not the DOM rows: at the bottom of a 60-row virtualized list the head rows are
// legitimately unmounted either way, so "is row 1 in the DOM" cannot tell eviction from virtualization. A
// readout that prints `loaded` against the server census can — a dropped page reads "50 of 60".
//
// WHICH READOUT MOVED (#493, side-eye 2026-08-22 rail-characters P2-1). It used to be the pane's `status`
// line, and that line no longer prints the loaded count: at rest it read `30 of 327 characters` — the PAGE
// SIZE worded as a result count, under a band already saying `CHARACTERS 327`. The loaded-vs-census signal
// lives at the FOOT of the list now, beside the tail-fetch sentinel, and that is what this asserts. The
// detector is unchanged in kind: a dropped head page still makes it read "50 of 60 loaded" and never
// disappear, because the run never reaches its census.
const EVICTION_PAGE_SIZE = 10;
const EVICTION_ROWS = 60;
const SCROLL_STEP_PX = 600;
/** The poll IS the scroll loop: each attempt wheels one step and reports whether the tail has arrived, so
 *  the walk needs no `waitForTimeout` and no awaits inside a `for` (both banned in CTs, and both would be
 *  a fixed sleep standing in for the settle this actually waits on). A FUNCTION, not a const: Playwright's
 *  `pollAgainstDeadline` pops/shifts the interval array it is handed, so a shared object is drained by its
 *  first use and every later poll silently falls back to 1000ms (ct-poll-schedule-and-paint ARM A). */
function scrollPoll(): { intervals: number[]; timeout: number } {
  return { intervals: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], timeout: 20_000 };
}

test("the head page is NEVER evicted — all six pages stay loaded through a deep scroll", async ({ mount, page }) => {
  const library = Array.from({ length: EVICTION_ROWS }, (_unused, at) =>
    makeCharacterSummary({ id: `char_deep_${String(at)}`, name: `Deep ${String(at).padStart(2, "0")}`, createdAt: 100_000 - at }),
  );
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "settings.getUserSettings": () => settingsView(EVICTION_PAGE_SIZE),
    "character.list": characterListResponder(library),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
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
    }, scrollPoll())
    .toBeGreaterThan(0);
  // Sixty loaded of sixty, so the FOOT line has nothing left to report and is gone. A silently dropped head
  // page leaves it standing, reading "50 of 60 loaded" — which is the eviction this pin exists to catch.
  await expect(component.getByText(LOADED_PROGRESS)).toHaveCount(0);
  // …and the pane's own status prints the CENSUS, which the eviction cannot move (it is the server's).
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
  await expect(row(component, "Bolt")).toBeVisible();

  const searchBox = await component.getByRole("textbox", { name: "Search characters" }).boundingBox();
  const sortBox = await component.getByRole("combobox", { name: "Sort characters" }).boundingBox();

  expect(searchBox?.width ?? 0).toBeGreaterThanOrEqual(SEARCH_MIN_USABLE_PX);
  // Search is the row's PRIMARY control; the sort is secondary and takes only its own label.
  expect(searchBox?.width ?? 0).toBeGreaterThan(sortBox?.width ?? 0);
});

/** The tag LIBRARY the bulk PICKER suggests from — `tag.listTagsWithUsage`, the same read the config rail's
 *  Tags collection uses, so opening a picker rides that cache instead of minting a second one. The library
 *  pane's own chip rail no longer shares it: it reads the `listTagFilterVocabulary` projection (side-eye
 *  2026-08-18 P2-6), so a test that drives BOTH surfaces routes both keys. */
const TAG_LIBRARY = [
  { ...makeTagFixture({ id: "tag_adventure", name: "adventure" }), usage: { characters: 5, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 5 } },
  { ...makeTagFixture({ id: "tag_fantasy", name: "fantasy" }), usage: { characters: 12, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 12 } },
];

/** The same two tags, as the library rail's own read answers them. */
const TAG_VOCABULARY: TrpcFixtureOutput<"tag.listTagFilterVocabulary"> = tagLibraryOf(
  { id: "tag_adventure", name: "adventure", characters: 5 },
  { id: "tag_fantasy", name: "fantasy", characters: 12 },
);

test("D2 the bulk Tag action opens a picker and applies a tag to the selection", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => TAG_LIBRARY,
    "tag.listTagFilterVocabulary": () => TAG_VOCABULARY,
    "character.bulkAddCardTag": () => ({ applied: ["char_bolt2"], failed: [] }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: selectActionName("Bolt") }).click();
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
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => TAG_LIBRARY,
    "tag.listTagFilterVocabulary": () => TAG_VOCABULARY,
    "character.bulkAddCardTag": () => ({ applied: ["char_bolt2"], failed: [] }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: selectActionName("Bolt") }).click();
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
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => TAG_LIBRARY,
    "tag.listTagFilterVocabulary": () => TAG_VOCABULARY,
    "character.bulkAddCardTag": () => ({ applied: ["char_bolt2"], failed: [] }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: selectActionName("Bolt") }).click();
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
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => TAG_LIBRARY,
    "tag.listTagFilterVocabulary": () => TAG_VOCABULARY,
    "character.bulkAddCardTag": () => ({ applied: ["char_bolt2"], failed: [] }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: selectActionName("Bolt") }).click();
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
function settingsView(pageSize: number): TrpcFixtureOutput<"settings.getUserSettings"> {
  return {
    userId: "user_ct_lib",
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, library: { pageSize } },
    updatedAt: 0,
    configUnreadable: null,
  };
}

test("⑪ the user's library.pageSize threads into the character.list request limit", async ({ mount, page }) => {
  const trpc: TrpcRecorder = await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "settings.getUserSettings": () => settingsView(42),
    "character.list": twoPageResponder,
  });
  await mount(<CharacterLibrarySurfaceStory />);
  await expect(page.getByText("Aria Nightshade")).toBeVisible();
  await expect.poll(() => (trpc.lastInput("character.list") as { limit?: number } | undefined)?.limit, { intervals: [20, 50, 100] }).toBe(42);
});

test("⑪ with no stored pageSize, the request falls to the schema default (30)", async ({ mount, page }) => {
  const trpc: TrpcRecorder = await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
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
/** The disclosure pair's ACCESSIBLE names (side-eye 2026-08-17 ARIA (b)). They were "+N more" and "Show
 *  fewer" — a control that names neither a verb nor an object, on a pair that carries no `aria-expanded`
 *  and no `aria-controls`. The visible labels are unchanged (each is a substring of its accessible name,
 *  WCAG 2.5.3); what a screen reader hears is a disclosure now. */
function moreTagsName(hidden: number): string {
  return `Show ${String(hidden)} more tags`;
}
const FEWER_TAGS = "Show fewer tags";
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
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([makeCharacterSummary({ id: "char_tagged", name: "Tagged One", createdAt: 3000, tags })]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => tags.map((tag) => ({ id: tag.id, name: tag.name, isHiddenOnCard: false, characters: 1 })),
  });
}

test("the chip row is CAPPED, and the rest are one disclosure away", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={NARROW_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(VISIBLE_CHIPS);
  await component.getByRole("button", { name: moreTagsName(4) }).click();
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(12);
  await component.getByRole("button", { name: FEWER_TAGS }).click();
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(VISIBLE_CHIPS);
});

test("an ACTIVE chip is never hidden by the cap (a filter you cannot see is one you cannot turn off)", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={NARROW_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  await component.getByRole("button", { name: moreTagsName(4) }).click();
  await component.getByRole("button", { name: BEYOND_CAP_CHIP }).click();
  await component.getByRole("button", { name: FEWER_TAGS }).click();
  await expect(component.getByRole("button", { name: BEYOND_CAP_CHIP })).toBeVisible();
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(VISIBLE_CHIPS + 1);
});

test("a 72-character tag name TRUNCATES inside the pane instead of overflowing it", async ({ mount, page }) => {
  await routeManyTags(page, 0, [{ id: "tag_long", name: LONG_TAG }]);
  const component = await mount(<CharacterLibrarySurfaceStory width={NARROW_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  const chip = component.locator("[data-tag-filter-state]");
  // RENDERED containment: the chip's right edge stays inside the pane it lives in.
  await expect
    .poll(async () => {
      const chipBox = await chip.boundingBox();
      const paneBox = await component.boundingBox();
      return (chipBox?.x ?? 0) + (chipBox?.width ?? 0) <= (paneBox?.x ?? 0) + NARROW_PANE_PX;
    })
    .toBe(true);
  // …and it is TRUNCATION, not a lucky short name: the label's content is wider than its box.
  await expect.poll(async () => chip.locator('[data-slot="text"]').evaluate((el: Element): boolean => el.scrollWidth > el.clientWidth)).toBe(true);
  // The full name survives for a pointer; the accessible name already carried it whole.
  await expect(chip).toHaveAttribute("title", LONG_TAG);
  await expect(chip).toHaveAttribute("aria-label", `Filter by ${LONG_TAG}: off — activate to include`);
});

test("a chip's accessible name states the ACTION, not just the state, around the whole cycle", async ({ mount, page }) => {
  await routeManyTags(page, 1);
  const component = await mount(<CharacterLibrarySurfaceStory width={NARROW_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

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

  await openFilters(component);
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
    ...LIBRARY_AMBIENT_ROUTES,
    // BOLT2 carries no tags at all, so a row-derived vocabulary would render zero chips here.
    "character.list": characterListResponder([BOLT2]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => tagLibraryOf({ id: "tag_noir", name: "noir", characters: 7 }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(row(component, "Bolt")).toBeVisible();
  await openFilters(component);

  await expect(component.getByRole("button", { name: "Filter by noir: off — activate to include" })).toBeVisible();
});

const DEAD_TAG_CHIP = "Filter by Deleted tag: included — activate to exclude";

/** The pane's PAGED read, told apart from its two siblings on the same procedure (the favorites strip's
 *  `starred: true` page and the band's `limit: 1` census) — only this one carries the chips. */
function lastCollectionInput(trpc: TrpcRecorder): { readonly includeTagIds?: readonly string[]; readonly excludeTagIds?: readonly string[] } | undefined {
  return trpc
    .inputs("character.list")
    .map((input) => (input ?? {}) as { starred?: boolean; limit?: number; includeTagIds?: readonly string[]; excludeTagIds?: readonly string[] })
    .filter((input) => input.starred === undefined && input.limit !== 1)
    .at(-1);
}

/** Seed a persisted library blob holding one filter entry for a tag id the server knows nothing about.
 *  BEFORE the page's JS runs: the store rehydrates at module init, so writing localStorage after mount would
 *  prove nothing (the shell-store CT's recipe). The key is the un-namespaced legacy one — a CT never binds a
 *  viewer, so `durableLocalKey` mints on the pre-adoption namespace (state/durable-local.ts). */
async function seedDeadTagFilter(page: Page, state: "include" | "exclude"): Promise<void> {
  await page.addInitScript((entryState: string) => {
    globalThis.localStorage.setItem("orb:character-library", JSON.stringify({ state: { tagFilter: [{ id: "tag_dead_era", state: entryState }] }, version: 2 }));
  }, state);
  await page.reload();
}

test("a persisted filter for a DELETED tag still renders a clearable chip (it cannot be an invisible filter)", async ({ mount, page }) => {
  await seedDeadTagFilter(page, "include");
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([BOLT2]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => tagLibraryOf({ id: "tag_noir", name: "noir", characters: 7 }),
  });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  // The entry is INERT now (W5, below) but it is still ON, and an active entry always says so out loud
  // instead of leaving an unexplained library state.
  await expect(component.getByRole("button", { name: DEAD_TAG_CHIP })).toBeVisible();
  // …and clearing it is the same cycle as any other chip: included → excluded → off.
  await component.getByRole("button", { name: DEAD_TAG_CHIP }).click();
  await component.getByRole("button", { name: "Filter by Deleted tag: excluded — activate to clear" }).click();
  await expect(component.getByRole("button", { name: "Filter by Deleted tag: off — activate to include" })).toHaveCount(0);
  await expect(row(component, "Bolt")).toBeVisible();
});

// W5 — REFERENTIAL INTEGRITY AT READ (staleness-and-session-freshness.md §4.2.2). The chip above made the
// dead filter VISIBLE; this makes it INERT. A persisted include-id whose tag no longer exists can never match
// a row, so under the server's AND-semantics it vetoes the ENTIRE library — the owner's import repro, whose
// only cure was wiping localStorage. A reference that can never match must never veto: the authority is the
// tag library read, and an id it does not know is dropped from the wire.

test("W5 a persisted include-filter for a DELETED tag does NOT empty the library", async ({ mount, page }) => {
  await seedDeadTagFilter(page, "include");
  const trpc = await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([BOLT2]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => tagLibraryOf({ id: "tag_noir", name: "noir", characters: 7 }),
  });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  // The row is on screen — the dead entry filtered nothing…
  await expect(row(component, "Bolt")).toBeVisible();
  // …and it is still visible + clearable, so the state is inert rather than hidden (no write-on-render).
  await expect(component.getByRole("button", { name: DEAD_TAG_CHIP })).toBeVisible();
  // …and the settled COLLECTION request carries no tag arm at all. (The FIRST one may still carry the dead
  // id: the tag library is the authority and it had not answered yet — deliberately, so a live filter never
  // flashes off on boot. The re-key that follows is the whole visible correction. The strip's `starred` page
  // and the band's `limit: 1` census are OTHER reads on the same procedure and never carry the chips.)
  await expect.poll(() => lastCollectionInput(trpc)?.includeTagIds, { intervals: [50, 100, 200] }).toBeUndefined();
});

test("W5 a LIVE tag filter still filters — the drop is referential, not a disabling of the feature", async ({ mount, page }) => {
  // The same persisted shape, but the id IS in the owner's library: it must reach the wire and narrow.
  await page.addInitScript(() => {
    globalThis.localStorage.setItem("orb:character-library", JSON.stringify({ state: { tagFilter: [{ id: "tag_rpg", state: "include" }] }, version: 2 }));
  });
  await page.reload();
  const trpc = await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([BOLT2, TAGGED]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => RPG_TAG_LIBRARY,
  });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(row(component, "Cassius")).toBeVisible();
  await expect(row(component, "Bolt")).toHaveCount(0);
  await expect.poll(() => lastCollectionInput(trpc)?.includeTagIds, { intervals: [50, 100, 200] }).toEqual(["tag_rpg"]);
});

// THE BAND'S COUNT (owner-facing honesty): it was deleted when the list went keyset-paged, because the only
// number available then was "loaded so far". The server serves a census now, so it prints again — and it is
// the LIBRARY's count, never the loaded page's.
const LIBRARY_CENSUS = 412;
const COUNT_ONLY_PAGE = 1;

test("the list band prints the server census, not the loaded row count", async ({ mount, page }) => {
  const rows = characterListResponder([STARLA, BOLT2, TAGGED]);
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": (input) => {
      const args = (input ?? {}) as { limit?: number };
      // The band asks for the cheapest possible page and reads `totalCount` off it.
      return args.limit === COUNT_ONLY_PAGE ? { items: [STARLA], nextCursor: null, totalCount: LIBRARY_CENSUS } : rows(input);
    },
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => RPG_TAG_LIBRARY,
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByTestId("list-band")).toContainText(String(LIBRARY_CENSUS));
  // The pane's own live region stays the FILTER's answer — three rows loaded, three matched.
  await expect(component.getByRole("status")).toHaveText("3 characters");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE FACET RAIL — the owner-picked variant B of program #102's density propagation wave
// (the characters-mockups rationale §5). The measured defect it answers: TWELVE controls in
// FOUR semantic classes (view command · scope filter · tag filter · disclosure) rendered with ONE
// pixel-identical treatment — `13px/500 · transparent · border 0 · radius 6px · 32px` for every one of
// them — so the only thing separating a command that re-modes the pane from a word out of the tag
// dictionary was the word itself. Two named groups, three registers, and a chip whose pill is actually
// drawn.
//
// EVERY ASSERTION HERE IS RENDERED (`done ≠ rendered`): an authored-class assertion stays green through
// exactly the regression these exist to catch — the live chips already sat at a ratified radius and
// nobody could tell, because at rest they were transparent with a ZERO-width border.

/** The docked LIST pane's real width (`--dimension-panel` resolves to 307px at a 1280 viewport). */
const RAIL_PANE_PX = 307;
/** The two groups the rail names — the accessibility tree already knew this grouping; the pixels did not. */
const RAIL_GROUPS = ["View", "Filters"] as const;
/** One tag chip of the 12-tag rail, addressed by its name PREFIX (its state word changes as it cycles). */
const RAIL_CHIP = /^Filter by bulk-00:/u;

/** One element's whole register, as the browser resolved it. */
function registerOf(target: Locator): Promise<{ weight: number; size: number; color: string; border: number; radius: number }> {
  return target.evaluate((el: Element) => {
    const style = getComputedStyle(el);
    return {
      weight: Number.parseFloat(style.fontWeight),
      size: Number.parseFloat(style.fontSize),
      color: style.color,
      border: Number.parseFloat(style.borderTopWidth),
      radius: Number.parseFloat(style.borderTopLeftRadius),
    };
  });
}

/** A spacing token, resolved from the SAME document the assertion runs against — never a hardcoded px
 *  (`--spacing-touch-target` is pointer-conditional by construction, so a literal would pin one pointer). */
function resolvedPx(component: Locator, token: string): Promise<number> {
  return component.evaluate((el: Element, name: string) => {
    const probe = el.ownerDocument.createElement("div");
    probe.style.height = `var(${name})`;
    el.ownerDocument.body.append(probe);
    const value = Number.parseFloat(getComputedStyle(probe).height);
    probe.remove();
    return value;
  }, token);
}

test("the filter rail NAMES its two groups, each under its own hairline (CD1 — a grouping is not a box)", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(row(component, "Starla")).toBeVisible();

  await Promise.all(
    RAIL_GROUPS.map(async (name) => {
      const group = component.getByRole("group", { name });
      await expect(group).toBeVisible();
      // The name is a REAL heading in the kicker voice (the document outline survives the density pass) …
      await expect(group.getByRole("heading", { name })).toHaveAttribute("data-voice", "kicker");
      // … and the rule that completes CD1 is the group's OWN top edge. That is the whole reason B is
      // height-neutral where A costs +22px: the hairline is a border, not a line of its own, and the
      // kicker LEADS the control line instead of standing on one.
      await expect.poll(async () => group.evaluate((el: Element) => Number.parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);
    }),
  );
});

test("the rail renders THREE distinct registers — a command, a filter chip and a disclosure", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  const commandLocator = component.getByRole("button", { name: "Group by tag" });
  const chipLocator = component.getByRole("button", { name: RAIL_CHIP });
  const disclosureLocator = component.getByRole("button", { name: moreTagsName(4) });
  const [command, chip, disclosure] = await Promise.all([registerOf(commandLocator), registerOf(chipLocator), registerOf(disclosureLocator)]);
  const [commandBox, chipBox, disclosureBox] = await Promise.all([commandLocator.boundingBox(), chipLocator.boundingBox(), disclosureLocator.boundingBox()]);

  // COMMAND vs FILTER: a control that REDRAWS the pane reads in the foreground ink and wears the operate
  // radius with no edge; a filter chip recedes to muted and wears a DRAWN pill. Three axes apart, where
  // before they were pixel-identical and separated only by their words.
  expect(command.color).not.toBe(chip.color);
  expect(command.border).toBe(0);
  expect(chip.border).toBeGreaterThan(0);
  expect(chip.radius).toBeGreaterThan(command.radius);
  // DISCLOSURE: `+N more` is not a filter at all and stops dressing as one. It recedes with the vocabulary
  // (muted, never the command's ink) but wears no edge and no chip box — the two things that say "filter".
  expect(disclosure.border).toBe(0);
  expect(disclosure.radius).toBeLessThan(chip.radius);
  expect(disclosure.color).toBe(chip.color);
  expect(disclosure.color).not.toBe(command.color);
  // …and it stays a real tap target while wearing no box: same rail cell height as the chips, which is
  // the ONE thing the "no box at all" reading must not cost (`no-floorless-control-in-wrap`).
  expect(disclosureBox?.height ?? 0).toBe(chipBox?.height ?? 0);
  expect(chipBox?.height ?? 0).toBeLessThan(commandBox?.height ?? 0);
});

test("a filter chip DRAWS its pill at rest, at the pointer's own touch floor", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  const chip = component.getByRole("button", { name: RAIL_CHIP });
  const register = await registerOf(chip);
  const box = await chip.boundingBox();
  const height = box?.height ?? 0;

  // A radius differentiates nothing unless something paints it: the resting hairline is what makes the
  // ratified pill step (§2.1 "chips, badges, avatars, pills") visible at all.
  expect(register.border).toBeGreaterThan(0);
  expect(register.radius).toBeGreaterThanOrEqual(height / 2);
  // The box IS the tap floor — `--spacing-touch-target`, which is 28px under a mouse and 44px under a
  // finger by construction, not by a media query. That is where the rail's 22px come back from.
  expect(height).toBe(await resolvedPx(component, "--spacing-touch-target"));
});

test("the chip rail runs at the tight 32px pitch the grouping is paid for out of", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);
  // The vocabulary is READ ON DISCLOSURE now (#502), so the chips arrive a round trip after the click —
  // barrier on a settled chip before measuring, or the census reads zero for a timing reason.
  await expect(component.getByRole("button", { name: SECOND_RAIL_CHIP })).toBeVisible();

  // Two chips on consecutive wrapped lines: the pitch is the chip box + the atom gap, and nothing else.
  const tops = await component
    .locator("[data-tag-filter-state]")
    .evaluateAll((els: Element[]) => [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().top)))].sort((a, b) => a - b));
  expect(tops.length).toBeGreaterThan(1);
  const [chipBox, atomGap] = await Promise.all([resolvedPx(component, "--spacing-touch-target"), resolvedPx(component, "--spacing-tight")]);
  expect((tops[1] ?? 0) - (tops[0] ?? 0)).toBe(chipBox + atomGap);
});

/** The chrome the pane spends above its first character row, at the docked width with the 8-visible-chip
 *  rail wrapped over four lines. MEASURED in this story (2026-08-17): **260.25px unnamed, 262.25px named**
 *  — the two groups cost +2px, because the chip rail gave back 6px of pitch per line and the two hairlines
 *  spent it. The mockup predicted +3 and the live pane 309 → 312.
 *
 *  The fence is what keeps "naming the groups is FREE" a standing property instead of a sentence in a
 *  rationale: the STACKED spelling of the same two kickers (variant A) lands ~22px above this line, and so
 *  does anyone who gives a rail register a control-height box again.
 *
 *  IT HELD AGAINST A REVIEW FINDING (side-eye re-pass 2026-08-17, owner-ruled ARM B). A proposed
 *  width-stability fix — reserving the state-glyph cell in every resting chip — measured 262.5 → 293.4 here
 *  and was REFUSED for it; the receipt and the recorded alternative live at the refusal site in
 *  `character-filter-chips.tsx`. This is the fence doing its job, not a coincidence. */
const RAIL_CHROME_CEILING_PX = 264;

/** The chrome the OPEN rail spends, which is one wrapped line more than it used to: the group's own
 *  disclosure ("More filters" / "Fewer filters") is a rail cell like any other, and at 307px with the
 *  8-chip cap it lands on a third line — measured 262.25 → 293.375 here (#491).
 *
 *  THE 264px FENCE SURVIVES — ITS INPUT CHANGED. That fence was minted to keep the chrome above the first
 *  character row cheap AT REST, and it was the resting spelling because the rail was unconditional. The
 *  resting spelling is the COLLAPSED rail now, and it holds 264 with room to spare (the #491 pin below
 *  states it). This second ceiling keeps the OPEN arm fenced too, so the rail cannot quietly grow a fourth
 *  line behind a disclosure nobody re-measures. It is deliberately NOT a licence to reopen the refused
 *  glyph-cell arm (`character-filter-chips.tsx`'s `TagFilterChip` refusal, owner ARM B 2026-08-17): that
 *  cost lands on EVERY resting chip and would spend this budget again on top. */
const OPEN_RAIL_CHROME_CEILING_PX = 300;

test("naming the groups stays HEIGHT-NEUTRAL — the OPEN rail's chrome holds its budget", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  const list = component.getByRole("list", { name: "Character library" });
  const [paneBox, listBox] = await Promise.all([component.boundingBox(), list.boundingBox()]);
  expect((listBox?.y ?? 0) - (paneBox?.y ?? 0)).toBeLessThanOrEqual(OPEN_RAIL_CHROME_CEILING_PX);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE SIDE-EYE RE-PASS (2026-08-17, program #102's own review — reports/snaps/se-chars-*). Every pin below
// names the measurement it was minted from; each one was RENDERED evidence, never a code reading.

/** The owner's real tag library, as the review measured it (`tag.listTagsWithUsage … 551 rows`). */
const OWNER_VOCABULARY = 551;
/** The panel's own scroll cap (`max-h-48` = 12rem). The assertion is `<=` this, never `===`: the region is
 *  content-sized below the cap, which is half of what "bounded" means. */
const PANEL_CAP_PX = 192;
/** Chips addressed by name PREFIX (the state word changes as they cycle). Top level: a locator regex built
 *  inside a test body is a fresh compile per call. */
const VOCAB_500_CHIP = /^Filter by vocab-500:/u;
const VOCAB_400_CHIP = /^Filter by vocab-400:/u;
const SECOND_RAIL_CHIP = /^Filter by bulk-01:/u;
/** The LAST chip inside the 8-wide cap. */
const LAST_RAIL_CHIP = /^Filter by bulk-07:/u;

/** `count` tags in the LIBRARY read only — the character carries NONE of them. `routeManyTags` hangs every
 *  tag off one character summary, which at 551 would be measuring a card's tag row rather than the rail. */
function routeBigVocabulary(page: Page, count: number): Promise<TrpcRecorder> {
  const tags = Array.from({ length: count }, (_unused, at) => makeTagFixture({ id: `tag_v_${String(at)}`, name: `vocab-${String(at).padStart(3, "0")}` }));
  return routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([makeCharacterSummary({ id: "char_plain", name: "Tagged One", createdAt: 3000, tags: [] })]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => tags.map((tag) => ({ id: tag.id, name: tag.name, isHiddenOnCard: false, characters: 1 })),
  });
}

// P1 (se-chars-more.png · se-chars-trap.json · perf-meter se-chars-expandperf.json). One click on
// "+543 more" replaced the ENTIRE list pane with a 5,957px chip wall: the character list's own height went
// to ZERO, the only way back was 5.3k px down the page, and the mount blocked for 648ms. That is the defect
// the VISIBLE_TAG_CHIPS cap was minted against, at 25× scale. The expansion is a BOUNDED REGION now.
test("P1 the expansion is BOUNDED — the character list keeps its height and the way back is on screen", async ({ mount, page }) => {
  await routeBigVocabulary(page, OWNER_VOCABULARY);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  const scroller = component.locator('[data-slot="virtual-list-scroll"]');
  await expect.poll(async () => scroller.evaluate((el: Element) => el.clientHeight)).toBeGreaterThan(0);

  await component.getByRole("button", { name: moreTagsName(OWNER_VOCABULARY - VISIBLE_CHIPS) }).click();

  // THE LIST IS STILL ALIVE. This is the pin: it measured 0.
  const exit = component.getByRole("button", { name: FEWER_TAGS });
  await expect(exit).toBeVisible();
  await expect.poll(async () => scroller.evaluate((el: Element) => el.clientHeight), { intervals: [50, 100, 200] }).toBeGreaterThan(0);

  // …and the vocabulary is a bounded scroller, not a wall: its viewport is capped and it overflows.
  const viewport = component.locator('[data-slot="scroll-area-viewport"]');
  const readRegionAtAssertion = async (): Promise<typeof region> =>
    await viewport.evaluate((el: Element) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
    }));
  const region = await viewport.evaluate((el: Element) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
    clientW: el.clientWidth,
    scrollW: el.scrollWidth,
  }));
  await expect.poll(async () => (await readRegionAtAssertion()).client).toBeLessThanOrEqual(PANEL_CAP_PX);
  await expect.poll(async () => (await readRegionAtAssertion()).scroll).toBeGreaterThan(region.client);
  // …and it scrolls in ONE axis. ScrollArea's content slot ships `min-w-max` for its usual tenant, which
  // makes a wrapping rail measure at max-content and never wrap: the first rendered shot of this panel had
  // 551 chips on a single clipped line behind a horizontal scrollbar (`done ≠ rendered`).
  await expect.poll(async () => (await readRegionAtAssertion()).scrollW).toBeLessThanOrEqual(region.clientW);

  // The exit is ABOVE the scroller, so it can never be scrolled away (stronger than sticky-inside).
  const [exitBox, viewportBox] = await Promise.all([exit.boundingBox(), viewport.boundingBox()]);
  expect(exitBox?.y ?? 0).toBeLessThan(viewportBox?.y ?? 0);
});

// P1 (c) — 551 entries is a VOCABULARY. Without an index the only way to reach `vocab-500` is to scroll a
// 192px window past five hundred chips.
test("P1 the expanded vocabulary has an INDEX — the search box narrows it to the match", async ({ mount, page }) => {
  await routeBigVocabulary(page, OWNER_VOCABULARY);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);
  await component.getByRole("button", { name: moreTagsName(OWNER_VOCABULARY - VISIBLE_CHIPS) }).click();

  await component.getByRole("searchbox", { name: "Filter tags" }).fill("vocab-500");
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(1);
  await expect(component.getByRole("button", { name: VOCAB_500_CHIP })).toBeVisible();

  // A search that finds nothing SAYS so — an empty scroller is indistinguishable from a broken one.
  await component.getByRole("searchbox", { name: "Filter tags" }).fill("zzz-no-such-tag");
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(0);
  await expect(component.getByText('No tag matches "zzz-no-such-tag".')).toBeVisible();
});

// P1 (a) — an ACTIVE chip must stay findable once the rail became a scroller. It leads the panel.
test("P1 an ACTIVE tag leads the expanded panel, above its fold", async ({ mount, page }) => {
  await routeBigVocabulary(page, OWNER_VOCABULARY);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);
  await component.getByRole("button", { name: moreTagsName(OWNER_VOCABULARY - VISIBLE_CHIPS) }).click();

  // A tag from deep in the ranking, reached through the index, then switched on.
  await component.getByRole("searchbox", { name: "Filter tags" }).fill("vocab-400");
  await component.getByRole("button", { name: VOCAB_400_CHIP }).click();
  await component.getByRole("searchbox", { name: "Filter tags" }).fill("");

  const [first, active, viewport] = await Promise.all([
    component.locator("[data-tag-filter-state]").first().getAttribute("aria-label"),
    component.getByRole("button", { name: VOCAB_400_CHIP }).boundingBox(),
    component.locator('[data-slot="scroll-area-viewport"]').boundingBox(),
  ]);
  expect(first).toContain("vocab-400");
  // ABOVE THE FOLD, in pixels — not merely first in the DOM.
  expect(active?.y ?? 0).toBeLessThan((viewport?.y ?? 0) + PANEL_CAP_PX);
});

// P2 (se-chars-combined.json). A tag chip on + a no-match search: the pane named only the search and
// offered only "Clear search", so clearing it landed the user in a still-empty library with a filter
// nobody had mentioned — and the pane had already spent its one explanation.
test("P2 a search-AND-filter empty names both causes and offers both exits", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(row(component, "Cassius")).toBeVisible();
  await openFilters(component);

  await component.getByRole("button", { name: "Filter by rpg: off — activate to include" }).click();
  await component.getByPlaceholder("Search characters…").fill("zzzqqq");

  await expect(component.getByText('No character matches "zzzqqq" with the current filters.')).toBeVisible();
  await expect(component.getByRole("button", { name: "Clear search" })).toBeVisible();
  const clearFilters = component.getByRole("button", { name: "Clear filters" });
  await expect(clearFilters).toBeVisible();

  // Both exits WORK — the filter one drops the chip and leaves the search's own claim standing.
  await clearFilters.click();
  await expect(component.getByRole("button", { name: "Filter by rpg: off — activate to include" })).toBeVisible();
  await expect(component.getByText('No character matches "zzzqqq".')).toBeVisible();
});

// P2 (se-chars-chip-rest.json), the HALF THAT WAS FIXED. The finding was two shifts on one click: the
// group's active-count datum MOUNTED beside the chips and shoved the whole wrapped rail 18px sideways, and
// the chip itself grew 16px as its state glyph appeared. The datum is a full-width line of its own now, so
// the FIRST selection cannot move a chip at all.
//
// THE CHIP'S OWN 16px IS DELIBERATELY STILL THERE (owner ruling ARM B, 2026-08-17). Reserving the glyph
// cell costs ~18px on every resting chip → a third wrap line → 293.4px of chrome against the ratified
// 264px `RAIL_CHROME_CEILING_PX`. The receipt and the recorded revisit arm (an overlay glyph, zero layout
// width) live at the refusal site in `character-filter-chips.tsx`. This pin states the ruling so the next
// reader does not "fix" it back: a selected chip's own 16px is absorbed by the chips AFTER it in flow, and
// nothing UPSTREAM of it moves — which is the property the datum push destroyed and this restores.
test("P2 selecting a chip no longer reshuffles the rail — the count datum cannot push a chip", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  // Press the LAST chip of the capped rail; watch the FIRST one. The datum used to mount at the HEAD of the
  // control line, so this observer moved 18px on a click that happened four rows away from it.
  const observer = component.getByRole("button", { name: RAIL_CHIP });
  const pressed = component.getByRole("button", { name: LAST_RAIL_CHIP });
  const clearAll = component.getByRole("button", { name: "Clear all filters" });
  await expect(clearAll).toHaveCount(0);
  const before = await observer.boundingBox();

  await pressed.click();
  await expect(component.getByRole("button", { name: "Filter by bulk-07: included — activate to exclude" })).toBeVisible();
  // The datum mounted (`1 active`), "Clear all" mounted — and the untouched chip has not moved a pixel.
  await expect(component.getByText("1 active")).toBeVisible();
  await expect(clearAll).toBeVisible();
  const readAfterAtAssertion = async (): Promise<typeof after> => await observer.boundingBox();
  const after = await observer.boundingBox();
  await expect.poll(async () => (await readAfterAtAssertion())?.x).toBe(before?.x);
  await expect.poll(async () => (await readAfterAtAssertion())?.y).toBe(before?.y);
});

// P2 (console `[cls] shift 0.0085 unexpected · aside[aria-label=Characters list] moved 0px,64px`, every
// cold load). `tag.listTagFilterVocabulary` settles ~750ms after first paint and the rail grew underneath the
// reader. The rail RESERVES the lines while the read is in flight, so the group's own height is the same
// before and after the vocabulary lands.
test("P2 the filter rail RESERVES the tag lines — the vocabulary landing does not grow the group", async ({ mount, page }) => {
  const hold = trpcHold();
  const tags = Array.from({ length: 12 }, (_unused, at) => makeTagFixture({ id: `tag_bulk_${String(at)}`, name: `bulk-${String(at).padStart(2, "0")}` }));
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([makeCharacterSummary({ id: "char_plain", name: "Tagged One", createdAt: 3000, tags: [] })]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": hold,
  });
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  // OPEN FIRST, THEN await the request (#502): the vocabulary read is gated on the disclosure, so waiting
  // for it before the click would wait forever — and the reserve exists for exactly this window, which is
  // now the beat between opening the rail and the 551 rows landing.
  await openFilters(component);
  await hold.requested;

  // HELD: the reserve is rendered, and it is what the group is spending its height on.
  const group = component.getByRole("group", { name: "Filters" });
  await expect(component.locator('[data-slot="skeleton"]').first()).toBeVisible();
  const held = (await group.boundingBox())?.height ?? 0;
  expect(held).toBeGreaterThan(0);

  hold.release(tags.map((tag) => ({ id: tag.id, name: tag.name, isHiddenOnCard: false, characters: 1 })));
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(VISIBLE_CHIPS);
  const settled = (await group.boundingBox())?.height ?? 0;

  // The arrival is FREE. It measured +64px — two whole chip lines shoved into the character list.
  expect(settled).toBe(held);
});

// ARIA (a)+(b)+(c) and taste (b)+(d) — the rail's non-chip controls, as assistive tech hears them.
test("the rail's text affordances carry disclosure semantics and object-qualified names", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  // The disclosure is a DISCLOSURE: a verb, its state, and the region it owns.
  const more = component.getByRole("button", { name: moreTagsName(4) });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => more.getAttribute("aria-controls")).not.toBeNull();
  const controls = await more.getAttribute("aria-controls");
  // …and it has a RESTING affordance again (taste (d)): the mockup's underline, dropped by the build and
  // never listed among its deviations, so "+N more" sat as one more muted word in a rail of muted words.
  await expect(more).toHaveCSS("text-decoration-line", "underline");
  await expect(more).toHaveCSS("text-decoration-style", "dotted");

  await more.click();
  const fewer = component.getByRole("button", { name: FEWER_TAGS });
  await expect(fewer).toHaveAttribute("aria-expanded", "true");
  await expect(fewer).toHaveAttribute("aria-controls", controls ?? "");
  await fewer.click();

  // The count is CAPTIONED, not a bare digit in a paragraph (ARIA (a) + taste (b)) …
  await component.getByRole("button", { name: RAIL_CHIP }).click();
  await expect(component.getByText("1 active")).toBeVisible();
  // … and "Clear all" names its object for anyone who meets it out of context (ARIA (c)).
  await expect(component.getByRole("button", { name: "Clear all filters" })).toBeVisible();
});

// TASTE (a) — the result count read as a debug line: micro/gloss type, floating between the rail and the
// favourites strip, belonging to nothing. It became a DATUM in the group whose controls produce it…
//
// …AND THE RULING SURVIVES — ITS INPUT CHANGED (#518, side-eye se-verify-1). What that finding was about is
// WHERE the count belongs and in whose voice; what died is the count being PRINTED here at all, because the
// LIST band 130px above prints the same census (one visible home, the chats-band precedent). It stays in
// the Filters group, still exactly one `role="status"`, still the group's own output — spoken rather than
// typeset. The sibling `N active` datum keeps the visible register for the number this rail alone produces.
test("the result count is the Filters group's own live region — one status, spoken not printed", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(row(component, "Starla")).toBeVisible();

  const group = component.getByRole("group", { name: "Filters" });
  const status = group.getByRole("status");
  await expect(status).toHaveCount(1);
  await expect(status).toHaveText("3 characters");
  // `sr-only` is a 1px clip box, so this is the rendered proof that the pane prints no second census.
  expect((await status.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
});

// TASTE (c) — se-chars-focusring-crop.png: two orange rings stacked. FOCUS_RING paints `ring-ring` and the
// selection layer paints `inset-ring-ring`, so a FOCUSED selected chip and a merely selected one were the
// same picture. The selected arms re-hue the FOCUS ring (never the selection ring — that one is the
// Toggle-parity reading).
test("a focused SELECTED chip rings in a different hue from its selection ring", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);

  const chip = component.getByRole("button", { name: RAIL_CHIP });
  await chip.click();
  const selected = component.getByRole("button", { name: "Filter by bulk-00: included — activate to exclude" });
  // KEYBOARD MODALITY FIRST. `:focus-visible` is what carries the ring, and a programmatic `.focus()`
  // after a MOUSE click does not satisfy it in Chromium — the assertion would read the resting skin and
  // pass or fail for a reason that has nothing to do with the ring. One Tab flips the modality; focusing
  // back then lands a real focus-visible.
  await page.keyboard.press("Tab");
  await selected.focus();
  await expect(selected).toBeFocused();

  const [ringHue, selectionHue] = await Promise.all([resolvedColor(component, "--color-foreground"), resolvedColor(component, "--color-ring")]);

  // TWO rings, TWO hues: the focus layer paints `foreground`, the selection layer keeps `ring` (the
  // Toggle-parity reading). Before this both were `ring` and the two states were one picture.
  await expect.poll(async () => selected.evaluate((el: Element) => getComputedStyle(el).boxShadow)).toContain(ringHue);
  await expect.poll(async () => selected.evaluate((el: Element) => getComputedStyle(el).boxShadow)).toContain(selectionHue);
  expect(ringHue).not.toBe(selectionHue);
  // …and a chip that is merely at rest carries neither.
  await expect
    .poll(async () => component.getByRole("button", { name: SECOND_RAIL_CHIP }).evaluate((el: Element) => getComputedStyle(el).boxShadow))
    .not.toContain(ringHue);
});

/** A theme colour token, resolved from the SAME document the assertion runs against — a computed
 *  `box-shadow` prints resolved colours, so the comparison has to be against resolved ones too. */
function resolvedColor(component: Locator, token: string): Promise<string> {
  return component.evaluate((el: Element, name: string) => {
    const probe = el.ownerDocument.createElement("div");
    probe.style.color = `var(${name})`;
    el.ownerDocument.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE 2026-08-18 SIDE-EYE PASS (rail sweep 3/9, the characters rail design review). Both pins
// below are RENDERED geometry / a rendered a11y tree, never a code reading.

/** The long name the review measured being clipped ("Morgatha, the …"), and its select-mode width. */
const LONG_NAME = "Morgatha, the Undying Dark";
/** The title width the review's own receipt demands at the docked 307px pane ("[data-slot=list-row-title]
 *  clientWidth ≥ 200px at rest"). Select mode already proved 210px fits there. */
const TITLE_FLOOR_PX = 200;

function routeOneLongName(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([makeCharacterSummary({ id: "char_long", name: LONG_NAME, createdAt: 3000, tags: [] })]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
  });
}

// P1-1 — the pane was a `role="list"` whose ONLY child was another `role="list"`: a screen reader heard
// "list, 1 item" and then "list, 11 items", `aria-required-children` FAILED on axe AND on Lighthouse's
// agentic audit, and agent-nav scored 50/100 for it.
test("P1-1 the library announces exactly ONE list, and it is the one holding the rows", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([ARIA, BOLT, CASSIUS]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();

  // ONE list on the surface, and the label is on it (not on a wrapper one level up).
  const lists = component.getByRole("list", { name: "Character library" });
  await expect(lists).toHaveCount(1);
  // …and its children are the listitems, not a second list. This is the `aria-required-children` claim.
  await expect(lists.getByRole("listitem")).toHaveCount(THREE_ROW_TOTAL);
  await expect(lists.getByRole("list")).toHaveCount(0);
});

// P1-3 — the row gave the NAME 114px and reserved an identical 114px for controls that render nothing at
// rest: 3 of 18 loaded rows clipped their name over a library with 27 duplicate-name groups, where the
// clipped remainder was the only disambiguator.
test("P1-3 the row name keeps the full text column at rest — the hidden cluster reserves nothing", async ({ mount, page }) => {
  await routeOneLongName(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  const title = component.locator('[data-slot="list-row-title"]');
  await expect(title).toHaveText(LONG_NAME);

  // MEASURED at the docked 307px pane: 131px before, 251px after — past the review's own ≥200px receipt
  // and past select mode's 210px, which is the width the app already proved fits there.
  await expect.poll(async () => title.evaluate((el: Element) => el.clientWidth)).toBeGreaterThanOrEqual(TITLE_FLOOR_PX);
  // …and the name is not clipped at all at this width (the whole point — 114px cut it to "Morgatha, the …").
  await expect.poll(async () => title.evaluate((el: Element) => el.scrollWidth > el.clientWidth)).toBe(false);
});

/** The NARROWEST this pane can ever be docked: `--dimension-panel-floor` (17rem = 272px) — the clamp's own
 *  responsive floor, and since #242 also the floor the shell's both-docked squeeze may not push it past.
 *  The squeeze reaches this width at a 1360 desktop with both panes open, where the un-squeezed clamp
 *  would have given 326px, so it is newly COMMON rather than newly possible (a ≤1133px viewport always
 *  resolved the clamp to exactly this). */
const SQUEEZED_RAIL_PANE_PX = 272;

test("P1-3 the row name keeps its column at the #242 SQUEEZED list width too (the floor the shell may push to)", async ({ mount, page }) => {
  await routeOneLongName(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={SQUEEZED_RAIL_PANE_PX} />);
  const title = component.locator('[data-slot="list-row-title"]');
  await expect(title).toHaveText(LONG_NAME);

  // 35px narrower than the docked-at-1280 pane the pin above measures: the title column pays that
  // pixel-for-pixel (nothing else in the row is elastic), so it must still clear the review's floor.
  await expect.poll(async () => title.evaluate((el: Element) => el.clientWidth)).toBeGreaterThanOrEqual(TITLE_FLOOR_PX);
});

// HOVER STABILITY IS HELD-UNDER-ATTACK, and this fix is exactly the kind that breaks it: a cluster that
// changed the row's layout on reveal would re-hit-test the row under a stationary pointer at frame rate
// (`ROW_REVEAL_SWAP`'s measured ~85 crossings/sec). Floating it out of flow is what makes the reveal free.
test("P1-3 revealing the row's controls costs ZERO reflow — the title box is identical hovered", async ({ mount, page }) => {
  await routeOneLongName(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  const title = component.locator('[data-slot="list-row-title"]');
  await expect(title).toHaveText(LONG_NAME);

  const rest = await title.boundingBox();
  await component.locator('[data-slot="list-row-root"]').hover();
  await expect(component.getByRole("button", { name: chatWithActionName(LONG_NAME), exact: true })).toHaveCSS("opacity", "1");
  const readHoveredAtAssertion = async (): Promise<typeof hovered> => await title.boundingBox();
  const hovered = await title.boundingBox();

  await expect.poll(async () => (await readHoveredAtAssertion())?.width).toBe(rest?.width);
  await expect.poll(async () => (await readHoveredAtAssertion())?.x).toBe(rest?.x);
});

// The other half of the split: with the cluster floated, the row's REST-VISIBLE state has to live in the
// text column or it would be an inert overlay sitting on the name. D11's invariant (pressed state visible
// at rest) is met by the title-line ★ marker, which yields exactly when the toggle reveals.
test("P1-3 a starred row shows its ★ at rest on the TITLE LINE, and it yields to the toggle on hover", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([makeCharacterSummary({ id: "char_star1", name: "Starla", starred: true, createdAt: 3000, tags: [] })]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  const marker = component.locator('[data-slot="list-row-markers"]').getByLabel("Starred");
  await expect(marker).toBeVisible();
  // The toggle that SETS it is hidden at rest — the row never paints two stars.
  const toggle = component.getByRole("button", { name: "Unstar Starla", exact: true });
  await expect(toggle).toHaveCSS("opacity", "0");

  await component.locator('[data-slot="list-row-root"]').hover();
  await expect(toggle).toHaveCSS("opacity", "1");
  // VISIBILITY, not display: the marker's box stays, so the title line cannot reflow under the pointer.
  await expect(marker).toHaveCSS("visibility", "hidden");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE 2026-08-22 SIDE-EYE PASS (rail sweep 4/10, docs/history/reviews/side-eye/2026-08-22-rail-characters.md).
// #491 the reachability P1s · #492 the accname P1 · #493 the honesty P2s. Every pin below is a rendered
// tree or a rendered geometry, at the docked LIST width, on the shapes the review measured.

/** A library the pane can never finish paging: the responder serves ONE page and reports a census far
 *  beyond it. That is what holds the PARTIAL state settled — a real second page would be auto-pulled by the
 *  tail-fetch guard inside this story's short viewport, and asserting mid-flight is the flake the CT law
 *  bans. What is under test is the two LABELS the partial state produces, and they read `loaded` against
 *  `totalCount` only. */
const BIG_CENSUS = 327;

/** The buckets THE LIBRARY has, not the ones the page happens to carry — the whole point of #1696. `rpg`
 *  holds 47 of the 327 and the pane will have paged in at most one of them. */
const BIG_RPG_BUCKET = 47;
const BIG_UNCATEGORIZED = 265;

function routePartialLibrary(page: Page, rows: readonly ReturnType<typeof makeCharacterSummary>[]): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": (input) => {
      const args = (input ?? {}) as { starred?: boolean; limit?: number };
      const isCollection = args.starred === undefined && args.limit !== COUNT_ONLY_PAGE;
      return { items: isCollection ? rows : [], nextCursor: null, totalCount: BIG_CENSUS };
    },
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
    "character.listTagGroups": () => tagGroupCensus([["tag_rpg", "rpg", BIG_RPG_BUCKET, "NONE"]], BIG_UNCATEGORIZED),
  });
}

// #491 P1-3/P1-4 — the FILTERS block was 34% of the desktop pane and 42% of the phone, density-immune, and
// the first thing between a keyboard user and the library. It is collapsed on first visit now. The pin is
// the RENDERED absence plus the chrome geometry, never the store: a store assertion would stay green while
// the pixels shipped the wall.
test("#491 the tag vocabulary is COLLAPSED on first visit, and the disclosure brings it back", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();

  // Not one chip of the vocabulary — and the `+N more` disclosure that led to the 551-chip panel is gone
  // with it, so the two-click path to the wall starts from a deliberate act.
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(0);
  await expect(component.getByRole("button", { name: moreTagsName(4) })).toHaveCount(0);

  // The whole point, in pixels: the chrome above the first character row. The ratified fence is 264px and
  // it was minted against the RESTING rail — which is this one now. The resting chrome must hold it, and
  // hold it with margin, because holding it exactly is what the 8-chip rail already did (262.25) while
  // being the thing the review filed.
  const list = component.getByRole("list", { name: "Character library" });
  const [paneBox, listBox] = await Promise.all([component.boundingBox(), list.boundingBox()]);
  const collapsedChrome = (listBox?.y ?? 0) - (paneBox?.y ?? 0);
  expect(collapsedChrome).toBeLessThan(RAIL_CHROME_CEILING_PX);
  // …and it is a DISCLOSURE, not a deletion: one press restores exactly the rail that was there before —
  // and that rail costs MORE chrome, which is the saving, measured rather than asserted about the store.
  await openFilters(component);
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(VISIBLE_CHIPS);
  const openBox = await list.boundingBox();
  expect((openBox?.y ?? 0) - (paneBox?.y ?? 0)).toBeGreaterThan(collapsedChrome);
  await expect(component.getByRole("button", { name: FEWER_FILTERS })).toHaveAttribute("aria-expanded", "true");
  await component.getByRole("button", { name: FEWER_FILTERS }).click();
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(0);
});

// #491, THE INVARIANT THE COLLAPSE MUST NOT BREAK — "a filter you cannot see is a filter you cannot turn
// off" (the owner's live P1, 2026-08-13). The collapse hides the INACTIVE vocabulary and nothing else: the
// scope pills, every ACTIVE chip, the `N active` datum and Clear all all render collapsed.
test("#491 a filter you cannot see is a filter you cannot turn off — every ACTIVE chip survives the collapse", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();

  // At rest, with nothing filtering, the group is its name + its disclosure + its datum: the scope pills
  // are vocabulary too while they are OFF, and vocabulary is what the disclosure is for.
  const favorites = component.getByRole("button", { name: "Show only favorites" });
  await expect(favorites).toHaveCount(0);

  // Switch BOTH a scope pill and a tag chip on from inside the open rail, then shut the rail on them.
  await openFilters(component);
  await favorites.click();
  await component.getByRole("button", { name: RAIL_CHIP }).click();
  await component.getByRole("button", { name: FEWER_FILTERS }).click();

  // Both survive — a live filter is always on screen and always clearable. The eleven INACTIVE tag chips
  // and the unpressed Archived pill are not, which is the whole saving.
  await expect(favorites).toBeVisible();
  await expect(component.getByRole("button", { name: "Show archived characters" })).toHaveCount(0);
  await expect(component.locator("[data-tag-filter-state]")).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Filter by bulk-00: included — activate to exclude" })).toBeVisible();
  await expect(component.getByText("2 active")).toBeVisible();
  await expect(component.getByRole("button", { name: "Clear all filters" })).toBeVisible();
});

// #491 P1-1 — 551 sequentially tabbable chips, 529 of them scrolled out of the 192px viewport, put 563 tab
// stops between a keyboard user and the first character row. The cloud is ONE stop with arrows within it
// (WAI-APG's toolbar pattern). The pin is the rendered tab order, not the hook.
test("#491 the expanded vocabulary is ONE tab stop — arrows move within the cloud", async ({ mount, page }) => {
  await routeBigVocabulary(page, OWNER_VOCABULARY);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);
  await component.getByRole("button", { name: moreTagsName(OWNER_VOCABULARY - VISIBLE_CHIPS) }).click();

  const cloud = component.getByRole("toolbar", { name: "Tag filter vocabulary" });
  await expect(cloud).toBeVisible();
  // EXACTLY ONE chip in the tab sequence, however many are mounted. Before: every one of them.
  await expect(cloud.locator('[data-tag-filter-state][tabindex="0"]')).toHaveCount(1);
  await expect(cloud.locator('[data-tag-filter-state][tabindex="-1"]').first()).toBeAttached();

  // …and the arrows are the way around it.
  const chips = cloud.locator("[data-tag-filter-state]");
  await chips.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(chips.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(chips.first()).toBeFocused();
});

// #491 P1-1 (the other half) — the shell's `Skip to content` moves focus to `<main>`, i.e. PAST this pane,
// so a keyboard user who wanted the LIST had no shortcut past the search, the sort, the two view commands,
// the favourites strip and the filter rail. The pane carries its own, and it lands ON a character.
test("#491 the pane's skip link lands focus on the first character row", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(row(component, "Starla")).toBeVisible();

  // FIRST among the pane's focusables, in DOM order — the whole contract: a skip control that is not the
  // first focusable is a second tab stop, not a skip. Asserted structurally rather than by pressing Tab,
  // because where a CT's initial focus SITS is the harness's business, not this pane's.
  const skip = component.getByRole("button", { name: "Skip to characters" });
  await expect
    .poll(async () =>
      skip.evaluate((el: HTMLElement) => {
        // The pane is the surface's own focus container (`tabIndex={-1}`) — scoped there rather than to the
        // story root, which also mounts the LIST chrome band above the surface.
        const pane = el.closest<HTMLElement>('[tabindex="-1"]');
        const focusables = pane?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
        return focusables?.[0] === el;
      }),
    )
    .toBe(true);

  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(component.locator('[data-slot="list-row-body"]').first()).toBeFocused();
});

// ── #492 → #517 · WCAG 2.5.3 / the three Emilys ──────────────────────────────────────────────────────
// The library holds real same-name collisions (three `Emily` at handles emily/emily-2/emily-3, `Mira`×2
// and `Nell`×2 inside the first 50 rows) and every row announced its NAME alone: three identical
// `button "Emily"`. Voice control could address none of them; list-navigation and low-verbosity screen
// reader modes, which drop descriptions, heard one name three times.
//
// #492 FIXED THE ANNOUNCEMENT AND GATED IT ON THE WRONG THING (side-eye se-verify-1, 2026-08-22 — the
// verification pass over #492's own fix). The gate was DERIVABILITY (is the handle `slugifyHandle(name)`?),
// chosen because a collision scan over a keyset-paged list would answer about the PAGE. Measured
// consequence on the owner's library: 13 rows, 8 qualified, 0 of the 8 colliding — `Charlotte · assistant`
// reads as a role, while `Emily`/`emily` (a real collision with a derivable handle) got nothing. And the
// qualifier was ACCESSIBLE-NAME ONLY, so the sighted reader's only disambiguator was the subtitle ladder,
// whose last rung is the handle. #517 answers the paging objection at the source — the row projection
// carries a library-wide `nameIsAmbiguous` — and RENDERS what it announces.
const EMILY_PLAIN = makeCharacterSummary({ id: "char_e1", name: "Emily", handle: castId<CharacterHandle>("emily"), createdAt: 3000 });
const EMILY_THIRD = makeCharacterSummary({ id: "char_e3", name: "Emily", handle: castId<CharacterHandle>("emily-3"), createdAt: 2000 });
/** The other half of #517: a UNIQUE name whose handle is not derivable from it. `Charlotte · assistant` is
 *  the misleading qualifier the derivability gate minted — it reads as a role and disambiguates nothing. */
const CHARLOTTE = makeCharacterSummary({ id: "char_c1", name: "Charlotte", handle: castId<CharacterHandle>("assistant"), createdAt: 1000 });

test("#517 the qualifier is spent on AMBIGUITY — both Emilys carry one, the unique Charlotte does not", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([EMILY_PLAIN, EMILY_THIRD, CHARLOTTE]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByRole("button", { name: "Emily · emily-3", exact: true })).toHaveCount(1);

  // BOTH colliding rows are qualified — `emily` IS `slugifyHandle("Emily")`, and under the old DERIVABILITY
  // gate that row announced a bare "Emily" beside another row announcing "Emily · emily-3": a real collision
  // the disambiguator skipped because the handle happened to be derivable (side-eye se-verify-1, #517).
  await expect(component.getByRole("button", { name: "Emily · emily", exact: true })).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Emily", exact: true })).toHaveCount(0);
  // …and the row that collides with NOTHING spends nothing. `Charlotte · assistant` was the derivability
  // gate's other failure direction: eight qualified rows on the owner's library, none of them colliding.
  await expect(component.getByRole("button", { name: "Charlotte", exact: true })).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Charlotte · assistant", exact: true })).toHaveCount(0);

  // …and the row's CONTROLS speak the same identity (`rowActionSubject`, #443/#458/#463) — fixing only the
  // body would have left two identically-named kebabs and two identical "Chat with Emily" behind it.
  await expect(component.getByRole("button", { name: rowActionsName(rowActionSubject("Emily", "emily-3")) })).toHaveCount(1);
  await expect(component.getByRole("button", { name: 'Chat with "Emily" · emily-3' })).toHaveCount(1);
  await expect(component.getByRole("button", { name: 'Chat with "Emily" · emily', exact: true })).toHaveCount(1);
});

// #517, THE SIGHTED HALF (the P1 the reviewer rated and could not reproduce only because the corpus is
// lucky). The visible disambiguator was the subtitle ladder — `elevatorPitch ?? tagLine ?? handle`, handle
// LAST — so a duplicate-named character with a distilled pitch or one visible tag showed the reader nothing
// at all while the accessible name carried the answer. The qualifier is RENDERED now, and the row's visible
// label is character-for-character its accessible name (WCAG 2.5.3 by identity, not by prefix rule).
test("#517 the qualifier is VISIBLE, and the row's visible label IS its accessible name", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    // Both Emilys carry a pitch, so the old subtitle ladder shows the SAME line on both rows: the case the
    // corpus happened not to contain, and the one the sighted reader cannot solve.
    "character.list": characterListResponder([
      makeCharacterSummary({ ...EMILY_PLAIN, elevatorPitch: "A quiet archivist." }),
      makeCharacterSummary({ ...EMILY_THIRD, elevatorPitch: "A quiet archivist." }),
    ]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  const qualified = component.getByRole("button", { name: "Emily · emily-3", exact: true });
  await expect(qualified).toHaveCount(1);

  // RENDERED, not sr-only: a real box with the handle in it.
  const qualifier = qualified.locator('[data-slot="list-row-title-qualifier"]');
  await expect(qualifier).toHaveText("· emily-3");
  await expect.poll(async () => (await qualifier.boundingBox())?.width ?? 0).toBeGreaterThan(0);

  // The visible label and the announced one are the SAME STRING — a voice-control user can say what they
  // read, and there is nothing in the name that is not on the screen. Scoped to the TITLE LINE: the row's
  // button also wraps the `aria-hidden` avatar (whose fallback paints the name's initials) and the subtitle.
  await expect(qualified.locator('[data-slot="list-row-title-row"]')).toHaveText("Emily · emily-3");
  await expect(qualified).toHaveAttribute("aria-label", "Emily · emily-3");
});

// ── #493 · the honesty P2s ───────────────────────────────────────────────────────────────────────────

// P2-1 — `30 of 327 characters` is the PAGE SIZE worded as a result count, 230px under a band already
// reading `CHARACTERS 327`. At rest the status now states the census; the loaded number moves to the foot
// of the list, next to the tail-fetch sentinel, where it is a fact about the list rather than a claim
// about the library.
test("#493 the status line states the CENSUS; the loaded count moves to the foot of the list", async ({ mount, page }) => {
  await routePartialLibrary(page, [ARIA, BOLT, CASSIUS]);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();

  await expect(component.getByRole("status")).toHaveText(`${String(BIG_CENSUS)} characters`);
  await expect(component.getByText(`3 of ${String(BIG_CENSUS)} loaded`)).toBeVisible();
  // The foot line is for the EYE: the status region already speaks the count that matched, and a second
  // live number under an infinite scroller would announce itself on every page the guard pulls.
  await expect(component.getByText(`3 of ${String(BIG_CENSUS)} loaded`)).toHaveAttribute("aria-hidden", "true");
});

// ── #1696: THE GROUPING IS A SERVER LENS NOW (side-eye 2026-09-05) ──────────────────────────────────
// #493 P2-2 measured the defect: Group produced `ADVENTURE 1 · … · UNCATEGORIZED 27` — four counts summing
// to the 30 rows paged in, presented as library facts, re-forming under the reader as scrolling paged more
// in. #493 shipped a blanket caveat because the only census available then was lens-blind and had no
// Uncategorized arm; `character.listTagGroups` is neither, so the caveat is gone and the NUMBERS are the
// fix. These arms mount a library the pane can never finish paging — 3 rows against a 327-row census — so
// every header count on screen is one the loaded rows could not have produced.
test("#1696 group headers carry the LIBRARY's count, not the loaded page's", async ({ mount, page }) => {
  await routePartialLibrary(page, [ARIA, BOLT, CASSIUS]);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await component.getByRole("button", { name: "Group by tag" }).click();

  // The old fold could only ever have said `1` here (one loaded row carries rpg) and `2` for Uncategorized.
  await expect(component.getByRole("button", { name: `rpg ${String(BIG_RPG_BUCKET)}` })).toBeVisible();
  await expect(component.getByRole("button", { name: `Uncategorized ${String(BIG_UNCATEGORIZED)}` })).toBeVisible();
  // …and the blanket caveat is gone with the defect it described.
  await expect(component.getByText("loaded so far", { exact: false })).toHaveCount(0);
});

test("#1696 a bucket that is only PARTLY paged in says so, per bucket", async ({ mount, page }) => {
  await routePartialLibrary(page, [ARIA, BOLT, CASSIUS]);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await component.getByRole("button", { name: "Group by tag" }).click();

  // What survives of #493's ruling: the mode still states its scope — at the resolution that is actually
  // useful, inside the bucket whose members are a window. Uncategorized starts expanded (it has no
  // folderType to configure), so its note is on screen without opening anything.
  await expect(component.getByText(`2 of ${String(BIG_UNCATEGORIZED)} loaded`, { exact: false })).toBeVisible();
});

test("#1696 a bucket the census names with NO loaded member still gets a header", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([ARIA, BOLT, CASSIUS]),
    "tag.listTagFilterVocabulary": () => [],
    // `vampire` is a real bucket of this library and not one row of it is on this page — the defect's
    // mirror image, and the reason the HEADERS have to come from the server too rather than only the counts.
    "character.listTagGroups": () => tagGroupCensus([["tag_vamp", "vampire", 12, "NONE"]], 3),
  });
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await component.getByRole("button", { name: "Group by tag" }).click();

  await expect(component.getByRole("button", { name: "vampire 12" })).toBeVisible();
});

test("#1696 a COMPLETE bucket carries no scope note — the note is a claim about partiality, not decoration", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([ARIA, BOLT, CASSIUS]),
    "tag.listTagFilterVocabulary": () => [],
    // Every matching row is on this page, and the census says exactly what the three rows are: Aria carries
    // `rpg`, Bolt and Cassius carry nothing. No bucket is a window, so no bucket owes a scope note.
    "character.listTagGroups": () => tagGroupCensus([["tag_rpg", "rpg", 1, "NONE"]], 2),
  });
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await component.getByRole("button", { name: "Group by tag" }).click();

  await expect(component.getByRole("button", { name: "Uncategorized 2" })).toBeVisible();
  await expect(component.getByRole("button", { name: "rpg 1" })).toBeVisible();
  await expect(component.getByText("loaded —", { exact: false })).toHaveCount(0);
  await expect(component.getByText(LOADED_PROGRESS)).toHaveCount(0);
});

// ── #502: THE 551-ROW VOCABULARY WAITS FOR A REASON TO EXIST ─────────────────────────────────────────
// Section entry breached the long-task budget (side-eye 2026-08-22 rail-characters P3-2: 2 long tasks,
// worst 69ms, `[perf] slow commit region:list 31ms (nested-update)`) landing a 551-row tag vocabulary — to
// paint chips that #491 had already put BEHIND A CLOSED DISCLOSURE on first visit. The read is gated now,
// and the two arms below are the whole gate: no reason ⇒ no request, a reason ⇒ the request.
test("#502 the tag vocabulary is NOT read while the filter disclosure is shut — and IS the moment it opens", async ({ mount, page }) => {
  const trpc = await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  // SETTLE on the rendered library — the count below is only meaningful once the pane has finished the
  // reads it does make (a count taken mid-mount would pass for the wrong reason).
  await expect(component.getByText("Tagged One")).toBeVisible();
  await expect(component.getByRole("button", { name: MORE_FILTERS })).toBeVisible();

  // Settled snapshot: settled by construction — the two barriers above are the LAST things this pane paints on a
  // cold mount, so every request it was ever going to fire has been recorded. Polling a zero would only
  // re-read the same zero for five seconds and could not tell a gated read from a slow one.
  await expect.poll(async () => trpc.count("tag.listTagFilterVocabulary")).toBe(0);

  // The positive control, same mount: opening the disclosure is a reason, and the chips arrive.
  await openFilters(component);
  await expect(component.getByRole("button", { name: SECOND_RAIL_CHIP })).toBeVisible();
  await expect.poll(() => trpc.count("tag.listTagFilterVocabulary"), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
});

// ── se-verify-1 (2026-08-22): #518 the census · #519 the disclosure label · #523 the scroll region ────

// #518 — `CHARACTERS 327` (band) and `327 characters` (the FILTERS status line) printed the same number
// ~130px apart in a 290px column. ONE VISIBLE HOME, and it is the band, by the chats precedent (#490): the
// band's census answers the LENS in front of the reader (`N of TOTAL`), which is why the pane's search now
// lives in the library store where the band — a sibling shell region — can see it. The pane keeps a
// mounted `role="status"` live region so the spoken result count (side-eye 2026-08-03 P2) survives; it is
// simply no longer a second printed number.
test("#518 the census has ONE visible home — the band answers the lens, the pane's line is spoken only", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...LIBRARY_AMBIENT_ROUTES,
    "character.list": characterListResponder([ARIA, BOLT, CASSIUS]),
    "chat.listChats": chatListResponder([]),
    "tag.listTagFilterVocabulary": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  const band = component.getByTestId("list-band");
  await expect(band).toContainText(String(THREE_ROW_TOTAL));

  // The pane's status line is MOUNTED (a live region that appears with its first message announces
  // nothing) and carries the matched count — but it paints no second census: sr-only is a 1px box.
  const status = component.getByRole("status");
  await expect(status).toHaveText(`${String(THREE_ROW_TOTAL)} characters`);
  expect((await status.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);

  // …and the band is the number that MOVES with the lens, which is the whole reason it survived: a band
  // printing the library total over a filtered pane is the #490 defect one section over.
  await component.getByPlaceholder("Search characters…").fill("Bolt");
  await expect(row(component, "Bolt")).toBeVisible();
  await expect(band).toContainText(`1 of ${String(THREE_ROW_TOTAL)}`);
  await expect(status).toHaveText("1 character");
});

// #519 — at rest the group rendered `FILTERS` + "More filters" + a lone mono census: no signal that
// Favorites, Archived or a 551-entry tag vocabulary exist behind it (Nielsen #6). The trigger names its
// CONTENTS now. The chrome fence is re-measured here because a longer label is a wider rail cell.
test("#519 the collapsed disclosure advertises what it opens — and the resting rail still holds its fence", async ({ mount, page }) => {
  await routeManyTags(page, 12);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();

  const disclosure = component.getByRole("button", { name: MORE_FILTERS });
  await expect(disclosure).toHaveText(MORE_FILTERS_LABEL);
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");

  // The label grew; the resting chrome above the first character row must still hold the ratified 264px.
  const list = component.getByRole("list", { name: "Character library" });
  const [paneBox, listBox] = await Promise.all([component.boundingBox(), list.boundingBox()]);
  expect((listBox?.y ?? 0) - (paneBox?.y ?? 0)).toBeLessThan(RAIL_CHROME_CEILING_PX);
});

// #523 — the bounded vocabulary's scroller is a keyboard stop (Base UI makes an overflowing viewport
// focusable, correctly: a scroll region a keyboard user cannot reach is a trap). It announced as an
// unnamed generic between "Show fewer tags" and the tag toolbar. It is a NAMED region now.
test("#523 the tag-vocabulary scroll viewport is a NAMED region, not an unlabeled generic", async ({ mount, page }) => {
  await routeBigVocabulary(page, OWNER_VOCABULARY);
  const component = await mount(<CharacterLibrarySurfaceStory width={RAIL_PANE_PX} />);
  await expect(component.getByText("Tagged One")).toBeVisible();
  await openFilters(component);
  await component.getByRole("button", { name: moreTagsName(OWNER_VOCABULARY - VISIBLE_CHIPS) }).click();

  const region = component.getByRole("region", { name: "Tag vocabulary" });
  await expect(region).toHaveAttribute("data-slot", "scroll-area-viewport");
  // The named thing IS the focusable one — naming a different node would leave the tab stop anonymous.
  await expect(region).toHaveAttribute("tabindex", "0");
});

// ── #1661: THE SURFACE'S OWN CHROME BUDGET AT A COARSE VIEWPORT (a RATCHET, not a defect proof; NOT the
// phone regime — #1721 renamed it after this fence's name read to a cold agent as a phone-screen budget
// it structurally cannot measure) ──────────────────────────────────────────────────────────────────────
// MEASURED on an isolated stage at HEAD (`snap / --goto characters --isolated --ref 9b0623869 --mobile
// --idle`, 430x740 DPR3 `pointer:coarse`): the first character row starts at y=280 of a 740px phone —
// 37.8% of the screen spent before the thing the reader came for. The 2026-09-02 side-eye measured ~262px
// there, so the number REGRESSED and nothing was watching it. Per-band, at 430 coarse:
//
//   topbar 0-48 (48) · LIST chrome band 48-96 (48) · body pad 8 · search+sort 104-148 (44) · gap 6 ·
//   VIEW 154-207 (53) · gap 8 · FILTERS 215-272 (57) · gap 8 · first row 280
//
// The two named groups are 41px each at a FINE pointer and 53/57 at a coarse one: the whole +28px is the
// D62 touch floor lifting their controls 32→44 (`touch-floor-is-an-unbudgeted-width-tax`, in its HEIGHT
// form). Nothing here is compressible by MERGING. METHOD (re-measured in THIS CT browser, #1679 — the
// numbers first written here were 207/223/413 and were none of them reproducible): mount the story at
// `width={430}` under `hasTouch`, clone each `getByRole("group")` subtree, set the clone to
// `width: max-content`, and read its `getBoundingClientRect().width` — the INTRINSIC width the group's
// kicker + controls want on one line, which is what a merge would have to fit. `View` + its two toggles
// measures **211.4px** and `Filters` + its disclosure **230.9px**, so a merged row wants **442.3px**
// (plus the inter-group gap, which this sum omits) against the **430px** the groups actually render at
// — `boundingBox().width` for both groups, the story root and the list is 430, i.e. this story insets
// nothing. So the obvious "fold the two kickers into one row" costs a wrap instead of saving a band, and
// it is worse at 320. The CONCLUSION is unchanged from the first writing; only the numbers were wrong.
// What WOULD buy the height back is deleting a band, and every band here is owner-ruled (program #102
// variant B's two named groups · #491's collapsed vocabulary · the ONE-NAME-PER-SCREEN band shed). So
// this suite gets a FENCE rather than a fix: the number cannot drift again without a red.
//
// IT IS A FENCE, HONESTLY LABELLED — it is GREEN the moment it lands, and its job is the next 18px, not
// this one. The story is not the phone shell (no `.shell-grid[data-list-mode]`, so the band keeps its
// title), which is why these ceilings are the SURFACE's own chrome and are their own numbers rather than
// snap's 280.
//
// `hasTouch: true` is what flips `matchMedia("(pointer: coarse)")` in chromium (`page.emulateMedia` has no
// `pointer` feature — the same spelling `rpg-actor-trackers.ct.tsx` uses); the first assertion PROVES the
// emulation landed before any geometry is trusted, because at a fine pointer these boxes are 24px shorter
// and the fence would pass while measuring the wrong device.
// MEASURED HERE, both arms: **306px** — the resting chrome is WIDTH-INVARIANT across the whole phone band,
// because nothing in it wraps at either end (the search row's `min-w-40` input plus the content-sized sort
// still fit 320, and the collapsed rail is one cell). That is the answer to "does it get worse on the
// smaller phone": it does not, and it does not get better on the bigger one either — which is precisely why
// the height has to be bought by REMOVING a band rather than by re-flowing one. 308 is the measured number
// plus 2px of sub-pixel headroom; the desktop/fine fence is {@link RAIL_CHROME_CEILING_PX} = 264, so the
// coarse device costs this pane +42px for the same controls.
//
// #1669 ARM A LANDED, AND THIS FENCE'S NUMBER DID NOT MOVE - which is a statement about the STORY, not about
// the product (owner ruling 2026-09-05: the band's actions move to the phone's topbar trail and the band is
// shed). The saving is a CSS one the SHELL owns: the `:has()` chain that sheds the band lives under
// `.shell-grid[data-list-mode="docked"]` inside shell.css's `<=48rem` media query, and `CharactersListHeader`
// drops its `action` on the shell's published MOBILE regime. This story mounts the band at a fixed-width div
// inside a desktop viewport with no shell grid and no `AppShell` to publish that regime, so neither
// condition can hold here and the 306px it measures is still the honest SURFACE number - the search row, the
// two named groups and the band as this story renders it.
//
// THE WHOLE-SCREEN NUMBER IS FENCED WHERE THE SCREEN EXISTS:
// `tests/client/features/app-shell/surfaces/app-shell.ct.tsx`, "#1669 the Characters plane's phone chrome" -
// the real shell on the real registry at 320/390 coarse, 336px before the change and 288px after. Lowering
// THIS constant to that number would be a fence over a state this mount cannot reach.
/** Coarse-pointer viewport widths this fence measures. Named for the VIEWPORT, not "phone" — this mount
 *  has no `.shell-grid`, no `AppShell` and no mobile regime to shed a band under (#1721). */
const SURFACE_CHROME_ARMS_COARSE = [
  { width: 320, ceiling: 308 },
  { width: 390, ceiling: 308 },
] as const;

test.describe("#1661 the surface's OWN chrome budget at a coarse viewport (not the phone regime — see #1669 in app-shell.ct.tsx for that)", () => {
  test.use({ hasTouch: true });

  for (const arm of SURFACE_CHROME_ARMS_COARSE) {
    test(`at ${String(arm.width)}px coarse the resting chrome above the first character row holds its budget`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await routeThree(page);
      const component = await mount(<CharacterLibrarySurfaceStory width={arm.width} />);
      await expect(row(component, "Starla")).toBeVisible();

      expect(await surfaceChromeAboveFirstRow(component)).toBeLessThanOrEqual(arm.ceiling);
    });

    // THE FENCE'S OWN POSITIVE CONTROL, one per arm. A ceiling that never moves is indistinguishable from a
    // constant this test happens to read, so the SAME measurement is taken in a state that must exceed it —
    // the 8-chip vocabulary opened, which is two wrapped rail lines the resting pane does not spend.
    //
    // IT NEEDS THE 12-TAG LIBRARY, and that is a measurement, not a preference: with `routeThree`'s
    // single-tag library the collapsed→open transition is height-NEUTRAL at 390 (306 either way — the two
    // scope pills, the one chip and "Fewer filters" land on the lines the disclosure already occupied) and
    // costs a line only at 320. A control that fires at one width and not the other proves nothing at the
    // other, so the control uses the rail that wraps at both.
    test(`at ${String(arm.width)}px coarse the OPEN vocabulary exceeds that budget — the fence measures, it does not assert`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await routeManyTags(page, 12);
      const component = await mount(<CharacterLibrarySurfaceStory width={arm.width} />);
      await expect(component.getByText("Tagged One")).toBeVisible();
      expect(await surfaceChromeAboveFirstRow(component)).toBeLessThanOrEqual(arm.ceiling);

      await openFilters(component);
      await expect(component.getByRole("button", { name: FEWER_FILTERS })).toBeVisible();
      expect(await surfaceChromeAboveFirstRow(component)).toBeGreaterThan(arm.ceiling);
    });
  }
});

/** The pane's chrome: the distance from the story root's top edge to the first character row. Named for
 *  what it reads (the SURFACE's own chrome), not "phone" — this mount has no shell to shed a band under. */
async function surfaceChromeAboveFirstRow(component: Locator): Promise<number> {
  const list = component.getByRole("list", { name: "Character library" });
  const [paneBox, listBox] = await Promise.all([component.boundingBox(), list.boundingBox()]);
  return Math.round((listBox?.y ?? 0) - (paneBox?.y ?? 0));
}
