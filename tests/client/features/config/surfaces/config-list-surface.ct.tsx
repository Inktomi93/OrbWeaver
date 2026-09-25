// CT: the Configuration workspace — the host frame over the REAL tag + regex + world-info collections.
//
// This is the seam's acceptance test: the host draws bands, disclosure, counts, create and the filter; the
// contributions draw rows, editors and context bodies; and the ONE kinded selection routes between them.
//
// AT SCALE, ON PURPOSE (owner ruling 2026-08-02): the tags fixture is FOUR HUNDRED rows, because that is
// the owner's real library and every decision here — collapsed by default, the count-driven filter, the
// windowed rows — exists for that size. A five-row toy would pass while the shipped surface stalled.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcFixtureOutput, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import {
  ConfigHostStory,
  ConfigListDefaultStory,
  ConfigListNarrowStory,
  ConfigMobileListStory,
  ConfigSectionArrivalStory,
  ConfigWorkspaceStory,
} from "../_ct-stories.tsx";

/** The group bands, by their accessible name — a band is `<disclosure> <icon> LABEL <count>`, so the
 *  name carries the count and only a pattern can address it. */
const TAGS_BAND = /Tags/;
const REGEX_BAND = /Regex scripts/;
const WORLD_INFO_BAND = /World Info/;
/** Any group-band IMPORT trigger — the D121-D band half, drawn only where a collection declares one. */
const ANY_IMPORT_TRIGGER = /^Import/;
/** Any group-band BULK-SELECT toggle (REGX2) — the same DATA-declared band grammar. */
const ANY_BULK_TOGGLE = /^Select /;

const TAG_COUNT = 400;

/** The global-scope switch, by what it does — the accessible name is `<script name> runs in every chat`. */
const GLOBAL_SWITCH = /runs in every chat/i;
/** Any non-empty accessible name — a labelled list is the claim, whichever noun the collection uses. */
const ANY_NAME = /\S/;
/** The phone pane `ConfigMobileListStory` mounts at — restated here rather than imported, because a
 *  `_ct-stories` module may export only components and a width the test does not state is a width it
 *  cannot hold anyone to. */
const PHONE_VIEWPORT_PX = 430;

// The workspace mounts all three panes, and TWO of them legitimately offer a collection's create verb: the
// group BAND (the per-group `+`) and the welcome's LAUNCHER CARD. That is the drawn design, so the CTs
// address the region they mean by its slot rather than by a bare name.
const LIST_PANE = '[data-slot="config-list"]';
const WELCOME = '[data-slot="config-welcome"]';
/** The nothing-active arm since #1210 retired the launcher landing — the section's own teaching frame. */
const TEACHING_FRAME = '[data-slot="config-teaching-frame"]';
/** The CONTENT scroller — the pane whose ARRIVAL content ruling 4 is about (#925). */
const CONTENT_PANE = '[data-slot="config-content"]';
/** The FIRST group in the LIST's canonical `(shelf, order, id)` sequence — `user` shelf, no declared order,
 *  so the id tiebreak puts Appearance at the top. Named here as the ARRIVAL DEFAULT's subject, and derived
 *  the same way the surface derives it (never a hardcoded id in the source: `orderConfigGroups`'s head). */
const FIRST_GROUP_LABEL = "Appearance";
/** The phone's cold teaching frame — its presence is the proof that NOTHING was auto-selected (it renders
 *  only while `activeGroup === null` on a mobile viewport). */
const MOBILE_TEACHING = '[data-slot="config-mobile-teaching"]';
/** The first group's ID (its label is `FIRST_GROUP_LABEL`) — the arrival default's subject. */
const FIRST_GROUP_ID = "appearance";
/** The ONE word for "differs from its default" (`config-copy.ts`'s `CONFIG_MODIFIED_MARKER`), restated
 *  here because a test may not import a source constant and then assert it against itself. */
const CONFIG_MODIFIED_MARK = "Modified";

type TagWithUsage = TrpcWireOutput<"tag.listTagsWithUsage">[number];
function tagRow(index: number): TagWithUsage {
  return {
    id: `tag_${String(index).padStart(3, "0")}`,
    name: `tag-${String(index).padStart(3, "0")}`,
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: index,
    isHiddenOnCard: false,
    usage: { characters: index % 3, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: index % 3 },
  };
}

const MANY_TAGS = Array.from({ length: TAG_COUNT }, (_unused, index) => tagRow(index));

/** The FIRST row the tag list renders. Its default order is MOST-USED (tag-experience audit 2026-08-03,
 *  `sortTagsBy`), and this fixture's usage is `index % 3` — so the window opens on the `%3 === 2` bucket,
 *  not on `tag-000`. Naming it here keeps these host assertions about the HOST (rows mounted, filter
 *  applied) instead of quietly re-asserting the owner's comparator. */
const FIRST_ROW = "tag-002";

/** The first MEMBER row, scoped to the pane that holds member rows — CONTENT since #1725. The scoping is
 *  still load-bearing and for the same reason it always was (program #102): the library's own insights print
 *  member text too, so an unscoped `getByText("tag-002")` can match a fact as well as a row. What changed is
 *  WHICH pane: the owner moved every collection's rows out of the LIST, so a helper still scoped there would
 *  resolve to nothing and every caller would fail for the wrong reason. */
function firstRow(workspace: Locator): Locator {
  return listRow(workspace, FIRST_ROW);
}

/** A member ROW by any text it carries, scoped to CONTENT — `firstRow`'s rule generalized, re-homed by
 *  #1725 with it.
 *
 *  IT RESOLVES THE ROW BOX, NOT THE TEXT (#1725). A bare `getByText` inside the LIST was already scoped for
 *  a reason (program #102: the retired launcher wall printed member names too); inside CONTENT the ambiguity
 *  is worse and closer, because the library's own INSIGHTS sit two boxes above the rows and their doors are
 *  named after members ("Open strip ooc"). Measured as a strict-mode violation on exactly that pair. Rows
 *  are `ListRow`s, so the row ROOT is the unambiguous handle and `filter({hasText})` keeps the helper's
 *  "by any text it carries" contract — a title, a scent, or a subtitle all still find their own row. */
function listRow(workspace: Locator, text: string): Locator {
  return workspace.locator(CONTENT_PANE).locator('[data-slot="list-row-root"]').filter({ hasText: text });
}

/** One regex fixture row — the shape `regex.listScripts` returns. */
function scriptRow(over: {
  readonly id: string;
  readonly name: string;
  readonly findRegex: string;
  readonly placement: TrpcWireOutput<"regex.listScripts">[number]["placement"];
}): TrpcFixtureOutput<"regex.listScripts">[number] {
  return {
    replaceString: "",
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    // A fixed edit stamp (X-16's `RegexScriptRow.updatedAt`) — the wall clock never reaches a fixture.
    updatedAt: 1_760_000_000_000,
    substituteRegex: 0,
    ...over,
  };
}

// THE NAMES ARE REALISTIC LENGTHS ON PURPOSE (side-eye 2026-08-19 P1). The old single fixture was
// "strip ooc" — nine characters, which fits any column and therefore proved nothing about a pane whose
// measured title column was 133px. A regex library's real names are sentences ("Format dialogue quotes"),
// and the whole finding is that they render as ellipses.
const SCRIPTS = [
  scriptRow({ id: "regex_script_stripooc", name: "strip ooc", findRegex: "/^\\s*ooc:.*$/gim", placement: ["AI_OUTPUT"] }),
  scriptRow({
    id: "regex_script_quotes0001",
    name: "Format dialogue quotes",
    findRegex: '/"([^"]+)"/g',
    placement: ["AI_OUTPUT", "DISPLAY", "PROMPT_HISTORY"],
  }),
  scriptRow({ id: "regex_script_asides00001", name: "Trim narrator asides", findRegex: "/\\(.*?\\)/g", placement: ["USER_INPUT"] }),
];

// `rowTitles(listPane, collectionId)` lived here — the row TITLE spans scoped to one collection's group
// INSIDE the LIST. #1725 moved the member rows to CONTENT, where the pane holds exactly one library at a
// time, so the collection scope has nothing left to disambiguate and the width matrix reads the titles
// straight off the CONTENT pane. Deleted with the two-libraries-in-one-pane geometry that needed it.

/** Every rendered node's own overflow (`scrollWidth - clientWidth`). `truncate` is SILENT — the only honest
 *  question about a clipped label is whether the text needed more room than its box gave it. */
function overflows(nodes: Locator): Promise<number[]> {
  return nodes.evaluateAll((spans) => spans.map((span) => span.scrollWidth - span.clientWidth));
}

const BOOK = {
  id: "world_book_reach000001",
  name: "The Ninefold Reach",
  description: null,
  createdAt: 1,
  entryCount: 42,
  usage: { characters: 2, personas: 0, chats: 0, global: true, total: 3 },
};
const BOOKS = [BOOK];

function stub(
  page: Page,
  tags: TrpcWireOutput<"tag.listTagsWithUsage"> = MANY_TAGS,
  scripts: TrpcFixtureOutput<"regex.listScripts"> = SCRIPTS,
  overrides: Partial<TrpcRoutes<"settings.getUserSettings">> = {},
): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    // The fourth collection (casts) + the viewer projection the LIST's `when` gate reads (#866 S1).
    "rosterPreset.list": [],
    // The workspace story now mounts the CONTEXT through the real resolve (#866 S3), and a selected
    // group's skimmer sections read the settings blob — fed the real defaults, never an inert null.
    "settings.getUserSettings": () => ({ userId: "user_ct_config", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, configUnreadable: null, updatedAt: 0 }),
    // The Looks section (#866 S4) reads the theme library — three seeds, no owned rows.
    "settings.listThemes": () => [
      { id: "theme_00000000000000000000000001", name: "Hearth", override: {}, css: null, isSeed: true, isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "theme_00000000000000000000000002", name: "Mocha", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
      { id: "theme_00000000000000000000000003", name: "Light", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
    ],
    "sessions.me": { userId: "user_ct_config", handle: "ct_config", globalRole: "user" },
    "tag.listTagsWithUsage": () => tags,
    "tag.createTag": () => {
      const { usage: _usage, ...created } = tagRow(TAG_COUNT);
      return created;
    },
    "regex.listScripts": () => scripts,
    "regex.listGlobal": () => [],
    // The regex CONTEXT arm's reverse rosters (REGROSTER) — this host only proves that the arm MOUNTS;
    // what the rosters say is pinned by the regex feature's own CT.
    "regex.listScriptUsage": () => ({ presets: [], characters: [], rooms: [] }),
    "regex.createScript": () => SCRIPTS[0],
    "worldInfo.listBooksWithUsage": () => BOOKS,
    "worldInfo.getBook": () => ({ id: BOOK.id, name: "The Ninefold Reach", description: null, createdAt: 1 }),
    "worldInfo.listEntries": () => [],
    "worldInfo.listGlobal": () => [],
    // The world-info CONTEXT arm's reverse list — the `regex.listScriptUsage` precedent above, same
    // rationale: this host proves the arm MOUNTS, and what the list SAYS is pinned by the world-info
    // feature's own CT. Fed rather than left unstubbed because an unfed read answers `null`, which is not
    // a view — the pipeline would run inert here and a regression inside it would be invisible.
    "worldInfo.listAttachmentsForBook": () => ({ characters: [], personaIds: [] }),
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
    "worldInfo.importFile": () => ({ created: true }),
    // LAST, so an arm can swap ONE read without re-spelling the table — `routeTrpc` REPLACES the table it
    // is given, so a second call would leave every other procedure unfed (the ratchet's whole point).
    ...overrides,
  });
}

// ── THE ARRIVAL DEFAULT (#925 owner amendment 2026-09-02: "when clicking onto config I then have to click a
// category and then a section before I can see settings") ────────────────────────────────────────────────
//
// THE CLICK COST IS THE CLAIM, so these three tests are the only ones in this file that do NOT press "reset
// groups" first: every other test wants the LANDING, which is now a state the reader LEAVES rather than the
// state they arrive in. Arriving is one act with zero clicks; leaving it is one click and it STICKS.
test("ARRIVAL: Config opens on the FIRST group's settings — zero clicks to a setting", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);

  // Nothing is pressed above this line. The pane the reader lands on is the first group's own body…
  await expect(workspace.getByRole("region", { name: `${FIRST_GROUP_LABEL} settings` })).toBeVisible();
  await expect(workspace.locator(CONTENT_PANE).getByRole("heading", { name: "Looks", exact: true })).toBeVisible();
  // …not the landing, which is the whole point of the amendment.
  await expect(workspace.locator(WELCOME)).toHaveCount(0);
  // AND THE MAP SAYS WHERE YOU ARE — the arrival is a real selection, not a CONTENT-only default: the band
  // is expanded (the active group always is) and exactly one section row is current, exactly as a band
  // CLICK leaves the LIST. One mechanism, two entrances.
  const band = workspace.locator(LIST_PANE).getByRole("button", { name: FIRST_GROUP_LABEL, exact: true });
  await expect(band).toHaveAttribute("aria-expanded", "true");
  await expect(workspace.locator(LIST_PANE).locator('[aria-current="true"]')).toHaveCount(1);
});

test("ARRIVAL is an arrival fact — leaving the first group for the landing STAYS on the landing", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await expect(workspace.getByRole("region", { name: `${FIRST_GROUP_LABEL} settings` })).toBeVisible();

  // `reset groups` is the CT's spelling of `clearActiveConfigGroup` — the shell's mobile BACK and the rail
  // bounce. A default that re-fired on every render would make that door unusable.
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await expect(workspace.locator(TEACHING_FRAME)).toBeVisible();
  await expect(workspace.getByRole("region", { name: `${FIRST_GROUP_LABEL} settings` })).toHaveCount(0);
  // Held across a re-render of the whole LIST (the reset is a store write every group reads). NOT a band
  // click: as of #925 every band — settings or collection — is a door that MOVES the location, so a band
  // click would be leaving the landing rather than testing that it stays.
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await expect(workspace.locator(TEACHING_FRAME)).toBeVisible();
});

// THE PHONE IS THE ONE PLACE THE DEFAULT MUST NOT FIRE (the mobile one-shell rule): an auto-selected pushing
// group makes `hasSelection()` true, so the shell pushes CONTENT over the LIST — and the reader arrives on a
// settings body having never chosen one, with the map they came for behind a Back button.
test("ARRIVAL on a phone leaves the LIST as the screen — no group is auto-selected", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigHostStory mobile={true} />);

  await expect(workspace.locator(MOBILE_TEACHING)).toBeVisible();
  await expect(workspace.locator(LIST_PANE).locator('[aria-current="true"]')).toHaveCount(0);
  await expect(workspace.getByRole("region", { name: `${FIRST_GROUP_LABEL} settings` })).toHaveCount(0);
});

// ── #1725 · THE LIST IS THE MAP AND NOTHING ELSE ─────────────────────────────────────────────────────
// This test used to read "…showing its band, count and create verb — never its rows", and the create verb
// was in that sentence because the band was a library's ONLY chrome in this workspace. The owner moved the
// members into CONTENT (2026-09-05), so the band's trailing verbs went with them — every one of them is a
// control you can only be looking at while looking at the library it belongs to. What the LIST owes is now
// exactly the door: a named, counted, ordered band per library.
test("every collection shows a band and a count in the LIST — never its rows, never its verbs", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const listPane = workspace.locator(LIST_PANE);
  await expect(listPane.getByRole("button", { name: TAGS_BAND })).toBeVisible();
  await expect(listPane.getByText(String(TAG_COUNT))).toBeVisible();
  // REGISTRY ORDER IS SHELF ORDER (C-1 as amended by #866 S1: `(shelf, order, id)`): tags · regex scripts ·
  // world info · casts, top-down on the Collections shelf.
  await expect
    .poll(() => listPane.locator('[data-slot="config-group"][data-collection]').evaluateAll((groups) => groups.map((g) => g.getAttribute("data-collection"))))
    .toEqual(["tags", "regex", "worldInfo", "rosterPreset"]);
  // Not one of the 400 ROWS is mounted, and no library's create verb is offered from this pane. Scoped to
  // the list (program #102): the claim is about THIS pane, and CONTENT legitimately draws both.
  await expect(listPane.getByText("tag-000")).toHaveCount(0);
  await expect(listPane.getByRole("button", { name: "New tag" })).toHaveCount(0);
  await expect(listPane.getByRole("button", { name: "New script" })).toHaveCount(0);
  await expect(listPane.getByRole("button", { name: "New book" })).toHaveCount(0);
});

test("#1725: opening a 400-member library renders its rows in CONTENT, with the filter beside them", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: TAGS_BAND }).click();
  const content = workspace.locator(CONTENT_PANE);
  await expect(content.locator('[data-slot="list-row-root"]').first()).toBeVisible();

  // The filter is still HOST chrome applied by the contribution's own rows — the seam did not move, the
  // pane did. It sits in the library's control row now, one grammar for every library.
  const filter = content.getByRole("textbox", { name: "Filter tags" });
  await expect(filter).toBeVisible();
  await filter.fill("tag-137");
  await expect(content.getByText("tag-137")).toBeVisible();
  await expect(content.getByText(FIRST_ROW, { exact: true })).toHaveCount(0);

  // Create is reachable with a 400-row list open — it is the control row's primary, above the scroller.
  await expect(content.getByRole("button", { name: "New tag" })).toBeVisible();
});

// THE COUNT GATE DIED WITH ITS PREMISE (#1725; the mock design §3.2). This test asserted the OPPOSITE: a library
// under `COLLECTION_LARGE_GROUP` drew no filter box at all. That was right while three collapsible bands
// shared ONE list scroll column — 32px of chrome per band was worth spending only past a glance. The library
// has its own pane now, so the box costs a shelf nothing and a reader who can filter one library can filter
// all four. The gate is deleted rather than retuned, which is why this test is inverted rather than deleted.
test("#1725: a SMALL library gets the filter too — the count gate went with the shared scroll column", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: REGEX_BAND }).click();
  await expect(listRow(workspace, "strip ooc")).toBeVisible();
  await expect(workspace.locator(CONTENT_PANE).getByRole("textbox", { name: "Filter regex scripts" })).toBeVisible();
});

// ── THE LANDING LAUNCHER GRID IS RETIRED (#1210, owner ruling 2026-09-02) ───────────────────────────
// SIX TESTS LIVED HERE and they are gone with the surface they pinned (the launcher card's shed count, its
// ~45-word accessible name, its resting door, its keyboard reach, its grid column, and the empty card's
// count+create). None was wrong; all of them were about `ConfigWelcome`, whose whole grid was a second,
// unreachable rendering of the Collections shelf the LIST already draws — unreachable because the arrival
// default takes CONTENT before the first paint on the desktop and a phone never paints CONTENT unpushed.
// What replaces them is the pin that the surface is GONE and that the state it used to hold is honest.
test("the retired launcher landing is gone, and the nothing-active arm is the section's teaching frame", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);

  // Arrival: a real group's settings, no landing grid.
  await expect(workspace.locator(WELCOME)).toHaveCount(0);
  // …and after leaving the arrival group (the shell's Back / a rail bounce, spelled here as the story's
  // nav reset) the pane is the two-line teaching frame, never a blank column and never the launcher grid.
  await workspace.getByRole("button", { name: "reset groups" }).click();
  const frame = workspace.locator('[data-slot="config-teaching-frame"]');
  await expect(frame.getByRole("heading", { name: "The parts every chat is built from" })).toBeVisible();
  await expect(frame.getByText("Tags label your library.", { exact: false })).toBeVisible();
  await expect(workspace.locator(WELCOME)).toHaveCount(0);
  // The collections are reachable from the LIST, which is the single home the retirement restores.
  await expect(workspace.locator(LIST_PANE).getByRole("button", { name: TAGS_BAND })).toBeVisible();
});

// D121-D's lifecycle anatomy, landed on the group band: IMPORT is host chrome driven by the contribution's
// `importFile` DATA, so it appears for exactly the collections that declare one — and the register of which
// is which is `lifecycle-portability.ts`'s `LIFECYCLE_DOORS` table, never a host string list.
//
// REGEX GAINED ITS DOOR (REGX2, owner ruling 2026-08-03): this test used to assert exactly ONE trigger and
// said in words that regex scripts had none, "their portable unit being the card that carries them". That
// was the `{ ruled }` cell's reasoning, and the owner's ruling ended it. TAGS still have none, which is what
// keeps this test load-bearing: the band must not grow a dead trigger for a collection with no door.
// D212 SURVIVES WITH A CHANGED INPUT (#1725). Its ruling is `band=Import · kebab=Export`, and the band
// was named because in this workspace the group band WAS the collection's only chrome. The library has a
// pane now, so Import is its control row's overflow item — one home, in the pane the reader is looking at,
// and still never a bare button beside the primary. What the ruling actually protects is untouched: Import
// is HOST-drawn from the contribution's `importFile` DATA, and Export stays per-member on the row's kebab.
test("#1725: IMPORT moved to the library's overflow — and only for a collection that declares one", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  const listPane = workspace.locator(LIST_PANE);
  const content = workspace.locator(CONTENT_PANE);

  // Gone from the LIST entirely — the band is the door and nothing else.
  await expect(listPane.getByRole("button", { name: ANY_IMPORT_TRIGGER })).toHaveCount(0);

  // World info declares one: its library draws an overflow, and the door is inside it.
  await listPane.getByRole("button", { name: WORLD_INFO_BAND }).click();
  await content.getByRole("button", { name: "More library actions" }).click();
  await expect(workspace.page().getByRole("menuitem", { name: "Import a world-info book" })).toBeVisible();
  await workspace.page().keyboard.press("Escape");

  // Tags declare NO import door — so the overflow they do draw (they declare a library-level ACTION,
  // `Prune unused tags`) must not offer one. "No kebab" stopped being the right assertion the moment
  // `actions` landed beside `importFile` in it; what the ruling protects is that the DOOR is drawn only
  // where the contribution declares it, and the library with no door and no action at all — Rosters — is
  // where "no kebab" is still the claim (`config-collection-landing.ct.tsx` pins that arm).
  await listPane.getByRole("button", { name: TAGS_BAND }).click();
  await content.getByRole("button", { name: "More library actions" }).click();
  await expect(workspace.page().getByRole("menuitem", { name: ANY_IMPORT_TRIGGER })).toHaveCount(0);
  await expect(workspace.page().getByRole("menuitem", { name: "Prune unused tags" })).toBeVisible();
});

// The BULK-SELECT toggle is the same DATA-declared band grammar (REGX2). Only regex declares one today, and
// the assertion is that the band draws it for exactly that collection — a toggle on a library with no bulk
// verbs behind it would be a control that does nothing.
test("#1725: the BULK toggle moved to the library's control row — and only where one is declared", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  const listPane = workspace.locator(LIST_PANE);
  const content = workspace.locator(CONTENT_PANE);

  await expect(listPane.getByRole("button", { name: ANY_BULK_TOGGLE })).toHaveCount(0);

  // The host draws mode ENTRY in one grammar for every library; the bar and the checkbox rows stay the
  // contribution's, inside `list`. That split is the seam's, and the move did not touch it.
  await listPane.getByRole("button", { name: REGEX_BAND }).click();
  const toggle = content.getByRole("button", { name: "Select scripts" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  // Tags declares none — a toggle over a library with no bulk verbs behind it would be a control that does
  // nothing, which is the capability lie the must-WORK bar names.
  await listPane.getByRole("button", { name: TAGS_BAND }).click();
  await expect(content.getByRole("button", { name: ANY_BULK_TOGGLE })).toHaveCount(0);
});

test("selecting a member routes CONTENT to its owner's editor and CONTEXT to its owner's arm", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // A TAG: its editor mounts in CONTENT, and its collection declares NO context arm — so the pane shows
  // that collection's OWN copy, not a generic "nothing selected" over a selected thing.
  await workspace.locator(LIST_PANE).getByRole("button", { name: TAGS_BAND }).click();
  await firstRow(workspace).click();
  await expect(workspace.getByRole("heading", { name: FIRST_ROW })).toBeVisible();
  // A MEMBER LANDS ON ABOUT SINCE #926 — the collection's own arm is the APPLIES cell, which the reader now
  // opens rather than arriving on (the old `defaultTab` landed every member on Applies, and for a `none`
  // collection that meant landing on a null state). The arm's content is unchanged; only the landing is.
  await workspace.locator('[data-slot="ct-config-context-pane"]').getByRole("button", { name: "Applies" }).click();
  await expect(workspace.getByText("Nothing to attach")).toBeVisible();

  // A SCRIPT: the same host, a different owner's editor and a real context body.
  await workspace.locator(LIST_PANE).getByRole("button", { name: REGEX_BAND }).click();
  await listRow(workspace, "strip ooc").click();
  await expect(workspace.getByRole("textbox", { name: "Name" })).toBeVisible();
  await expect(workspace.getByText("Runs in every chat")).toBeVisible();

  // A BOOK (R2): the book editor mounts in CONTENT and the activation panel fills CONTEXT — the surfaces the
  // retired rail section owned, framed by the same host as its two siblings.
  await workspace.locator(LIST_PANE).getByRole("button", { name: WORLD_INFO_BAND }).click();
  await listRow(workspace, "42 entries · attached ×3").click();
  await expect(workspace.getByRole("heading", { name: "The Ninefold Reach" })).toBeVisible();
  await expect(workspace.getByRole("switch", { name: "Fires in every chat" })).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE CONTENT REGION INSETS ITS EDITORS (side-eye 2026-08-03 P1, the night's "single biggest opportunity").
// Measured live on the isolated stage: `Configuration content: padTop 0px · padLeft 0px · padRight 0px`,
// heading box at the region ORIGIN (x=363,y=48 against origin 363,48), and the world-info primary's right
// edge EXACTLY on the pane boundary (`content.right = 896 · "New entry".right = 896`). The welcome looked
// fine only because it carried its own `p-block`; the editors carried nothing.
//
// It is pinned at the REGION, against the RESOLVED TOKEN (never a px literal) and on all four sides, because
// a per-editor inset is the same defect waiting for the fourth collection.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const CONTENT = '[data-slot="config-content"]';
/** The pane COLUMN the scroller and the save receipt both live in — since #1099 F25 it owns the INLINE
 *  inset for both of them (the receipt used to render 24px outside the content column because the scroller
 *  padded itself and the footer was a bare sibling). The block inset stays on the scroller: it is scroll
 *  extent. So "the pane pads, not the editors" is intact — it is spelled one level up on one axis. */
const PANE = '[data-slot="config-pane"]';
/** The world-info editor's primary verb — the affordance the report measured ON the pane boundary. */
const NEW_ENTRY = /New entry/;

/** The `--spacing-section` token as the browser resolves it HERE — probed, so the assertion tracks a token
 *  retune instead of freezing today's 24px. */
function resolvedSectionPx(scope: ReturnType<Locator["locator"]>): Promise<number> {
  return scope.evaluate((el: HTMLElement): number => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-section)";
    el.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
}

test("a mounted member editor is INSET from the CONTENT region on all four sides, by the token", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: WORLD_INFO_BAND }).click();
  await listRow(workspace, "42 entries · attached ×3").click();
  // Barrier on the SETTLED editor — the heading only exists once the book read has landed.
  const heading = workspace.getByRole("heading", { name: "The Ninefold Reach" });
  await expect(heading).toBeVisible();

  const content = workspace.locator(CONTENT);
  const pane = workspace.locator(PANE);
  const inset = await resolvedSectionPx(content);
  expect(inset).toBeGreaterThan(0);
  // ONE token, all four sides, TWO declarations by axis: the column pads inline (so the save receipt below
  // the scroller shares the measure), the scroller pads block (so the inset is part of the scroll extent
  // the jump and the spy read). Both are asserted, so neither can quietly go missing.
  await expect
    .poll(() =>
      pane.evaluate((el: HTMLElement) => {
        const style = getComputedStyle(el);
        return [style.paddingRight, style.paddingLeft];
      }),
    )
    .toEqual([`${inset}px`, `${inset}px`]);
  await expect
    .poll(() =>
      content.evaluate((el: HTMLElement) => {
        const style = getComputedStyle(el);
        return [style.paddingTop, style.paddingBottom];
      }),
    )
    .toEqual([`${inset}px`, `${inset}px`]);

  // …and the editor's own content actually STARTS inside it — the PANE's origin is no longer the heading's
  // origin (the report's `heading box → x=363, y=48` against `region origin x=363, y=48`).
  const paneBox = await pane.boundingBox();
  const headingBox = await heading.boundingBox();
  if (paneBox === null || headingBox === null) {
    throw new Error("the content pane or its editor heading did not render a box");
  }
  expect(headingBox.x, "the editor heading clears the pane's left edge").toBeGreaterThanOrEqual(paneBox.x + inset);
  expect(headingBox.y, "the editor heading clears the pane's top edge").toBeGreaterThanOrEqual(paneBox.y + inset);
});

test("the editor's PRIMARY action no longer touches the pane boundary", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: WORLD_INFO_BAND }).click();
  await listRow(workspace, "42 entries · attached ×3").click();
  // `[data-cta]` — the editor's HEADER primary, the one whose right edge the report measured ON the pane
  // boundary. (The empty-list state offers a second "New entry"; that one is not the trailing-edge case.)
  const primary = workspace.locator(CONTENT).getByRole("button", { name: NEW_ENTRY }).and(workspace.locator("[data-cta]"));
  await expect(primary).toBeVisible();

  const content = workspace.locator(CONTENT);
  const pane = workspace.locator(PANE);
  const inset = await resolvedSectionPx(content);
  // Measured against the PANE, which owns the inline inset since #1099 F25 — the scroller's own box now
  // starts inside it, so the region's right edge would be the boundary AFTER the clearance, not before it.
  const paneBox = await pane.boundingBox();
  const primaryBox = await primary.boundingBox();
  if (paneBox === null || primaryBox === null) {
    throw new Error("the content pane or its primary did not render a box");
  }
  // The reported state was `content.right === "New entry".right`. A full token of clearance now.
  expect(primaryBox.x + primaryBox.width, "the primary's right edge clears the pane boundary").toBeLessThanOrEqual(paneBox.x + paneBox.width - inset);
});

// The retired welcome carried its OWN `p-block` — the reason the missing editor inset read as deliberate
// rather than as a hole. With the region padding it would double, so it was dropped; the claim survives the
// retirement (#1210) and is now made of the frame that took its place: whatever CONTENT paints with nothing
// active must start at the SAME x as an editor does.
test("the nothing-active frame does not double the region's inset", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const welcome = workspace.locator(TEACHING_FRAME);
  await expect(welcome.getByRole("heading", { name: "The parts every chat is built from" })).toBeVisible();
  await expect
    .poll(() =>
      welcome.evaluate((el: HTMLElement) => {
        const style = getComputedStyle(el);
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
      }),
    )
    .toEqual(["0px", "0px", "0px", "0px"]);
});

test("the library's create verb fires the OWNER's create mutation", async ({ mount, page }) => {
  const trpc = await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // The verb moved panes at #1725, not seams: it is still `create.useRun`, still host-drawn from the
  // contribution's DATA, and still the owner's own mutation behind it. Only its address changed.
  await workspace.locator(LIST_PANE).getByRole("button", { name: TAGS_BAND }).click();
  await workspace.locator(CONTENT_PANE).getByRole("button", { name: "New tag" }).click();
  await expect.poll(() => trpc.lastInput("tag.createTag"), { intervals: [20, 50, 100] }).toEqual({ input: { name: "New tag" } });
});

// ── #1725 · THE ZERO-MEMBER LIBRARY MOVED PANES, AND SO DID ITS THREE PINS ───────────────────────────
// Four tests lived here — the ONE-create-verb count, the reserved disclosure gutter, the honest `0`, and the
// empty slot's ONE-LINE geometry guard. The owner moved every collection's members (and with them the empty
// state, F5 arm A) into CONTENT, so a LIST pane that still asserted a zero-member SLOT would be asserting a
// surface this pane no longer draws. None is deleted; each is stated below with where it went.
//
//  · THE GUTTER and THE COUNT are now `components/config-list-collection-group.ct.tsx`'s, and STRONGER
//    there: the band is one component for every population since #1725, so that file sweeps all four
//    libraries in a MIXED-population stub instead of probing the empty arm against a populated sibling.
//    Moved, not dropped — the claim gained coverage in the move.
//  · THE ONE-CREATE-VERB COUNT is retargeted below. Its strength is the COUNT, and the count is what a
//    re-added inline verb trips, so it survives verbatim over a wider scope: the WHOLE workspace, not one
//    pane, which is a stronger fence than the original (three copies on one screen was the defect).
//  · THE ONE-LINE GEOMETRY GUARD is retargeted in part and MISSES in part, named honestly. Its "no frame"
//    half survives verbatim below. Its "never outweighs the band that names it" half CANNOT be re-expressed
//    here: the band is in the other pane now, so the ratio has no referent, and the empty arm is the whole
//    CONTENT pane rather than a slot competing with siblings on a shelf. That is a NAMED MISS (#1725), not a
//    silent deletion — the shelf-attention defect #1211 measured is structurally unreachable once the empty
//    state has a pane to itself, and re-inventing a ratio against an unrelated box would be a pin that
//    cannot fail for the reason it claims.
test("#1725: a zero-member library says so in CONTENT — with exactly ONE create verb on the whole workspace", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // The LIST says nothing about emptiness beyond the band's honest `0` — the sentence is the library's.
  await expect(workspace.locator(LIST_PANE).getByText("No tags yet.")).toHaveCount(0);

  await workspace.locator(LIST_PANE).getByRole("button", { name: TAGS_BAND }).click();
  const content = workspace.locator(CONTENT_PANE);
  await expect(content.getByText("No tags yet.")).toBeVisible();
  // ONE, not two (side-eye 2026-08-08 P2). The empty slot used to repeat the band's verb — and with the
  // Configuration launcher card carrying a third copy, "New tag" rendered three times on one screen. The
  // COUNT is the assertion and it is taken over the WHOLE workspace now, which is what the defect was about:
  // a reader seeing the same verb more than once on one screen.
  await expect(workspace.getByRole("button", { name: "New tag" })).toHaveCount(1);
});

// NO FRAME — the surviving half of the #1211 geometry guard, at its new home. Its no-deletion clause is
// obeyed for the second time: the MECHANISM is unchanged (a rendered-geometry claim about the empty arm's
// shape, never a class list) and only its CONDITION moved with the surface. A returning dashed card fails
// here exactly as it failed in the LIST.
test("#1211 (retargeted): the empty library draws no dashed frame", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await workspace.locator(LIST_PANE).getByRole("button", { name: TAGS_BAND }).click();

  const content = workspace.locator(CONTENT_PANE);
  await expect(content.getByText("No tags yet.")).toBeVisible();
  await expect
    .poll(
      async (): Promise<number> =>
        await content.evaluate(
          (el: Element): number => [...el.querySelectorAll("*"), el].filter((node) => getComputedStyle(node).borderTopStyle === "dashed").length,
        ),
    )
    .toBe(0);
});

// The band's KICKER at the pane it actually lives in (side-eye 2026-08-06 P3). "REGEX SCRIPTS" is the
// longest label the door array carries, and at the docked pane's real 307px content width it lost its last
// two pixels to the ellipsis — a truncated group name in a list whose entire job is naming the groups.
// The assertion is the SPAN'S BOX (scrollWidth vs clientWidth), not a screenshot: `truncate` is silent, so
// the only honest question is whether the text needed more room than it got.
test("the longest group kicker survives the docked pane's real width — no ellipsis on a group name", async ({ mount, page }) => {
  await stub(page);
  const listPane = await mount(<ConfigListNarrowStory />);
  await listPane.getByRole("button", { name: "reset groups" }).click();

  const kicker = listPane.getByText("Regex scripts", { exact: true });
  await expect(kicker).toBeVisible();
  await expect.poll(async () => await kicker.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE LIST_PANE ROW'S OWN WIDTH (side-eye 2026-08-19 P1 + the two pre-ruled forks). Measured live on the
// owner's corpus: at the both-open 272px pane the text column was 133px against subtitles needing
// 396-572px — 27 of 33 list texts clipped, and the pattern + edit stamp were NEVER visible at any width.
// The ruled fix is two moves: the global-scope SWITCH leaves the resting row for the CONTEXT panel that
// already renders it, and the freed width goes to the scent (pattern leads, channels become glyphs).
//
// BOTH ENDS OF THE RANGE, always — a point measurement never proves a range property. 271px is the pane's
// content box with BOTH side panels open (`--dimension-panel` clamps at 17rem); 307px is the default
// docked state a reader arrives in.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

// ═══ THE MATRIX MOVED PANES WITH THE ROWS (#1725) ════════════════════════════════════════════════════
// These four pins measured the regex row anatomy inside a 271px/307px LIST rail, because that is where the
// rows were. The owner moved them into CONTENT, so those two ceilings stopped applying — retired by
// The mock design §3.2 ("the 30-member cliff and `COLLECTION_WINDOW_MAX_HEIGHT` existed because three bands shared
// one LIST scroll column, and that column is gone"), which is the same decision that deleted the filter
// gate. A selector swap would have left the numbers describing a box that no longer holds the rows.
//
// So the range is re-derived at CONTENT widths, both ends AND the crossover, from MEASURED numbers.
// `ConfigHostStory` mounts LIST at a fixed 307px and gives CONTENT the rest, so the arm's host width fixes
// the pane exactly and the matrix is stated as a table rather than as two magic constants:
//
//   host 752px  → CONTENT 397px  · the NARROW end: a small desktop window with the LIST docked
//   host 1440px → CONTENT 1085px · the CROSSOVER: the frame the approved boards are drawn at
//   host 1920px → CONTENT 1565px · the WIDE end
//
// The panes are 48px narrower than `host - 307` because the CONTENT region carries its own inset (the
// side-eye 2026-08-03 P1 fix). These are the MEASURED numbers off the run, not the arithmetic — which is
// exactly the difference a matrix exists to catch.
//
// The measured widths are asserted in the matrix itself (`paneWidth`), so a story or shell change that moves
// them reds here instead of silently re-scoping every claim below it.
const CONTENT_MATRIX = [
  { host: 752, pane: 397, arm: "narrow" },
  { host: 1440, pane: 1085, arm: "crossover" },
  { host: 1920, pane: 1565, arm: "wide" },
] as const;

/** Enter the regex library and settle on its rows — in CONTENT, where they live since #1725. */
async function openRegexRows(host: Locator): Promise<Locator> {
  await host.getByRole("button", { name: "reset groups" }).click();
  await host.locator(LIST_PANE).getByRole("button", { name: REGEX_BAND }).click();
  const content = host.locator(CONTENT_PANE);
  await expect(content.getByText("Format dialogue quotes")).toBeVisible();
  return content;
}

/** The scent line of the three-stage fixture row — the widest scent this library draws. */
function busiestScent(content: Locator): Locator {
  return content.locator('[data-slot="list-row-root"]').filter({ hasText: "Format dialogue quotes" }).locator('[data-slot="list-row-subtitle"]');
}

// A POINT MEASUREMENT NEVER PROVES A RANGE PROPERTY, so the whole matrix runs — and at CONTENT widths the
// claim is STRONGER than the one it replaces. In the 271px rail the busiest scent overran by 30px and the
// pin had to be demoted to the docked width alone (the note that used to sit here); the library's own pane
// is wide enough at every arm, so the TITLE and the SCENT are both asserted whole across all three.
for (const { host, pane, arm } of CONTENT_MATRIX) {
  test(`#1725 width matrix (${arm}, CONTENT ${String(pane)}px): every row name and the busiest scent render whole`, async ({ mount, page }) => {
    await stub(page);
    const component = await mount(<ConfigHostStory width={host} />);
    const content = await openRegexRows(component);

    // The arm IS the width — a story change that moves the pane reds here rather than quietly re-scoping.
    await expect
      .poll(async () => {
        const box = await content.boundingBox();
        return box === null ? -1 : Math.round(box.width);
      })
      .toBe(pane);

    const titles = content.locator('[data-slot="list-row-title"]');
    await expect(titles).toHaveCount(SCRIPTS.length);
    expect(await overflows(titles), "every script name renders whole, not as an ellipsis").toEqual(SCRIPTS.map(() => 0));
    expect(await overflows(busiestScent(content)), "the busiest scent renders whole").toEqual([0]);
  });
}

// FORK 2: THE PATTERN LEADS THE SCENT. The old subtitle spelled every pipeline stage in words first
// ("history sent to the model · rendered transcript · model output · …"), so the two data that actually
// tell two rows apart — the find pattern and the edit stamp — were pushed past the ellipsis at EVERY pane
// width. The stages are still said, as glyphs carrying their own accessible names, in the subtitle's lead
// slot. Taken at the NARROW arm of the matrix above, which is the only place the ordering can still bite.
test("a row's scent LEADS with the find pattern, and the stages ride as named glyphs", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory width={CONTENT_MATRIX[0].host} />);
  const content = await openRegexRows(component);

  const subtitle = busiestScent(content);
  // The VISIBLE text, not the source: the pattern is the first thing after the glyph lead.
  await expect(subtitle).toContainText('/"([^"]+)"/g');
  await expect(subtitle, "the stage names no longer spend the line").not.toContainText("history sent to the model");
  // …and the stages are still ANNOUNCED — the glyphs carry the labels the words used to, all three of them
  // (a script bites on a SET, and a strip that showed one of them would say less than the words did).
  await expect(subtitle.getByLabel("History sent to the model")).toBeVisible();
  await expect(subtitle.getByLabel("Rendered transcript")).toBeVisible();
  await expect(subtitle.getByLabel("Model output")).toBeVisible();
});

// FORK 1: ONE SETTING, ONE HOME. The "runs in every chat" switch rendered in the LIST row AND in the
// CONTEXT panel (headed "Where it’s attached" since the 2026-08-19 clarity fix) — two live controls for one
// fact, 990px apart on one screen, with
// no confirm and no undo behind the row's copy (the reviewer flipped one by accident driving the pane).
// The panel keeps it; the row loses it, which is also where the P1's 48px comes from.
//
// The duplicate-action-door lens is BLIND at the default collapsed-context state, so this pin drives the
// state where the defect exists: a member OPEN and the CONTEXT pane mounted.
test("the global-scope switch has exactly ONE home — the CONTEXT panel, never the list row", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: REGEX_BAND }).click();
  await listRow(workspace, "Format dialogue quotes").click();
  // A MEMBER LANDS ON ABOUT SINCE #926 — the collection's own arm is the APPLIES cell, which the reader now
  // opens rather than arriving on (the old `defaultTab` landed every member on Applies, and for a `none`
  // collection that meant landing on a null state). The arm's content is unchanged; only the landing is.
  await workspace.locator('[data-slot="ct-config-context-pane"]').getByRole("button", { name: "Applies" }).click();
  // Barrier on the SETTLED context arm — the panel only exists once the usage read has landed.
  await expect(workspace.getByText("Runs in every chat")).toBeVisible();

  const switches = workspace.getByRole("switch", { name: GLOBAL_SWITCH });
  await expect(switches, "one setting, one control").toHaveCount(1);
  await expect(workspace.locator(LIST_PANE).getByRole("switch"), "the resting list row carries no switch").toHaveCount(0);
});

// …AND NO OTHER CONTROL HAS TWO HOMES ON THIS PLANE EITHER. This is the duplicate-action-door lens'
// grouping (`design-audit-checks.ts`: bucket every door by `role|name`, keep the buckets spanning
// structurally distinct homes) re-spelled in the CT browser, for the reason the report itself names — the
// lens is BLIND at the default collapsed-context state, and the state where the defect lives (a member
// OPEN, the CONTEXT pane mounted) is unreachable on an isolated snap stage, whose thin boot db carries no
// regex scripts at all. The three panes are the "structurally distinct homes" axis: repeated controls
// WITHIN the list are one component per row, which the lens deduplicates by path and this deduplicates
// by pane.
const PANES = [LIST_PANE, CONTENT, '[data-slot="ct-config-context-pane"]'] as const;

test("no control on the Configuration plane is offered from two of its three panes", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: REGEX_BAND }).click();
  await listRow(workspace, "Format dialogue quotes").click();
  // A MEMBER LANDS ON ABOUT SINCE #926 — the collection's own arm is the APPLIES cell, which the reader now
  // opens rather than arriving on (the old `defaultTab` landed every member on Applies, and for a `none`
  // collection that meant landing on a null state). The arm's content is unchanged; only the landing is.
  await workspace.locator('[data-slot="ct-config-context-pane"]').getByRole("button", { name: "Applies" }).click();
  await expect(workspace.getByText("Runs in every chat")).toBeVisible();

  // ONE round trip: the census is a pure DOM read, and doing it per-locator would be N awaits in a loop.
  const twoHomed = await workspace.evaluate((root: HTMLElement, panes: readonly string[]) => {
    const census = new Map<string, Set<string>>();
    for (const pane of panes) {
      for (const door of root.querySelectorAll<HTMLElement>(`${pane} button, ${pane} [role="switch"]`)) {
        const name = door.getAttribute("aria-label") ?? door.textContent?.trim() ?? "";
        if (name === "") {
          continue;
        }
        const key = `${door.getAttribute("role") ?? door.tagName.toLowerCase()}|${name}`;
        census.set(key, (census.get(key) ?? new Set<string>()).add(pane));
      }
    }
    return [...census].filter(([, homes]) => homes.size > 1).map(([key, homes]) => `${key} @ ${[...homes].join(" AND ")}`);
  }, PANES);
  expect(twoHomed, "one verb, one home per plane").toEqual([]);
});

// THE LIST_PANE SPEAKS ONE A11Y GRAMMAR (side-eye 2026-08-19 P2). The regex rows were bare buttons in a
// `Stack` — no list role, so a screen-reader user got no item count and no boundaries, while the tag
// collection's own small arm announces "list, N items". The world-info small arm had the identical hole;
// it is invisible on the owner's corpus (59 books window into the `VirtualList` arm, which announces a
// list of its own), which is why it needed a small-list fixture rather than a live drive.
for (const [collectionId, band, count] of [
  ["regex", REGEX_BAND, SCRIPTS.length],
  ["worldInfo", WORLD_INFO_BAND, BOOKS.length],
] as const) {
  test(`the ${collectionId} small-list arm is a LABELLED list with listitem rows`, async ({ mount, page }) => {
    await stub(page);
    const workspace = await mount(<ConfigWorkspaceStory />);
    await workspace.getByRole("button", { name: "reset groups" }).click();

    // The rows moved to CONTENT at #1725; the a11y grammar they must speak did not change with the pane.
    await workspace.locator(LIST_PANE).getByRole("button", { name: band }).click();
    const list = workspace.locator(CONTENT_PANE).getByRole("list");
    await expect(list).toHaveCount(1);
    await expect(list).toHaveAccessibleName(ANY_NAME);
    await expect(list.getByRole("listitem")).toHaveCount(count);
  });
}

// THE BAND'S ACCESSIBLE NAME IS ITS LABEL AND ITS COUNT, UNGLUED (side-eye 2026-08-19 ARIA). The count is
// a sibling span with no separator, so the accname computation concatenated it onto the label and the
// disclosure announced "Regex scripts3" — one token, and a number a screen reader reads as part of a name.
// The visible kicker keeps its micro-caps voice; only the announced name is spelled out.
//
// …AND THE SEPARATOR IS WHITESPACE, NOT A COMMA (side-eye 2026-08-19 P1-2). The first fix spelled the name
// "Regex scripts, 3" while the band VISIBLY reads "Regex scripts 3", which breaks WCAG 2.5.3 Label in Name
// — the visible label must be contained in the accessible name, and a comma the eye never sees is a
// character a speech-input user cannot say. axe's `label-content-name-mismatch` went 1 node → 4 on the fix.
// So the claim below is the MECHANISM, not three frozen strings: name and visible text must agree once
// whitespace is discounted, which is exactly what un-gluing is allowed to change and nothing more.
test("a group band's disclosure announces its label and its count as separate words", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const listPane = workspace.locator(LIST_PANE);
  await expect(listPane.getByRole("button", { name: `Regex scripts ${String(SCRIPTS.length)}`, exact: true })).toBeVisible();
  await expect(listPane.getByRole("button", { name: `World Info ${String(BOOKS.length)}`, exact: true })).toBeVisible();

  // Every band on the surface, by the rule rather than by name: the announced string and the rendered one
  // are the same characters. A comma, a bullet or a dash added to "read better" fails here, as it should.
  const mismatched = await listPane.locator('[data-slot="collection-band"] button[aria-expanded][aria-label]').evaluateAll((bands) =>
    bands
      .map((band) => ({ name: band.getAttribute("aria-label") ?? "", visible: band.textContent ?? "" }))
      .filter(({ name, visible }) => name.replaceAll(/\s+/g, "") !== visible.replaceAll(/\s+/g, ""))
      .map(({ name, visible }) => `announced "${name}" ≠ visible "${visible}"`),
  );
  expect(mismatched, "the visible label is contained in the accessible name (WCAG 2.5.3)").toEqual([]);
});

// ARRIVING IN THE SECTION LANDS IN THE LIST (side-eye 2026-08-19 ARIA). Both panes called
// `useFocusOnMount` on their own root and CONTENT mounts second, so a keyboard user arriving with NOTHING
// selected landed in the empty content region — last in the DOM, past the list they came to read. The
// corpus P2-4 precedent, same mechanism, same vehicle: the bounce is what a rail switch does, and
// `useFocusOnMount` deliberately declines on a cold load, so only a bounce can see this.
test("arriving with nothing selected lands focus in the LIST, not in CONTENT", async ({ mount, page }) => {
  await stub(page);
  const section = await mount(<ConfigSectionArrivalStory />);

  await section.getByRole("button", { name: "Leave Configuration" }).click();
  await section.getByRole("button", { name: "Back to Configuration" }).click();

  // THE PANE IS THE CLAIM, NOT THE ELEMENT (#1218 moved the target inside it — see that test below): the
  // finding was that CONTENT stole the section's arrival focus, and it is answered as long as the focused
  // element lives in the LIST.
  await expect(section.locator(LIST_PANE).locator(":focus")).toHaveCount(1);
  // …AND IT SAYS WHERE YOU LANDED (side-eye 2026-08-19 P3). Focus arriving somewhere that announces nothing
  // at all left the one affordance the arrival fix exists to deliver — "you are in the list" — silent for
  // the reader who cannot see the pane move. The pane is named, and so is the control the landing picks.
  await expect(section.locator(LIST_PANE)).toHaveAccessibleName(ANY_NAME);
  await expect(section.locator(LIST_PANE).locator(":focus")).toHaveAccessibleName(ANY_NAME);
});

// THE FILTER MISS IS ANNOUNCED (side-eye 2026-08-19 P3). Typing into the host's filter box changes the rows
// below it and nothing else; when the needle matches nothing, the ONLY feedback is a line of copy the
// keyboard user never hears, because focus stays in the input. The message is a polite status region, so it
// is spoken when it appears — and it is the CONTRIBUTION's own sentence, in its own noun, unchanged.
test("a filter that matches nothing announces itself", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: TAGS_BAND }).click();
  await expect(firstRow(workspace)).toBeVisible();
  await workspace.getByRole("textbox", { name: "Filter tags" }).fill("no-such-tag");

  // The status region moved panes with the rows it describes (#1725) — it is the CONTRIBUTION's sentence
  // rendered inside `collection.list`, so it went where `list` went.
  const miss = workspace.locator(CONTENT_PANE).getByRole("status");
  await expect(miss).toHaveText("No tags match that filter.");
  // The input keeps focus — which is exactly why the message has to speak for itself.
  await expect(workspace.getByRole("textbox", { name: "Filter tags" })).toBeFocused();
});

// ── THE PHONE'S TEACHING FRAME (side-eye 2026-08-19 P2) ─────────────────────────────────────────────
// The welcome carries the best onboarding copy in the app and it is CONTENT, which the mobile one-shell
// rule makes unreachable: with nothing selected the LIST is the whole screen, and selecting anything
// arrives at that member's editor. So a 430px screen's entire first impression was three 40px group rows
// and a void, and the reader was never told what any of this is for.
//
// The pin is the RENDERED frame at a phone width, on the settled mobile regime — never a media-query class
// read. `useMobileViewport` is a published STORE fact (app-shell owns the matchMedia), so the story ships
// the same two regime buttons the `#state` CTs use and this drives them; the desktop arm is asserted in the
// same test, because "renders on a phone" is only half the claim — the other half is that the desktop
// list, which sits beside the welcome that already says this, is byte-identical to what it was.
test("the LIST teaches on a phone and stays silent on the desktop", async ({ mount, page }) => {
  await stub(page);
  const listPane = await mount(<ConfigMobileListStory />);
  await listPane.getByRole("button", { name: "reset groups" }).click();

  const frame = listPane.locator('[data-slot="config-mobile-teaching"]');

  // DESKTOP FIRST — the regime a CT starts in. Nothing extra over the list.
  await listPane.getByRole("button", { name: "go desktop" }).click();
  await expect(frame, "the desktop LIST does not restate the welcome beside it").toHaveCount(0);

  await listPane.getByRole("button", { name: "go mobile" }).click();
  await expect(frame).toBeVisible();
  // The masthead sentence — the statement the phone could never reach.
  await expect(frame.getByRole("heading", { name: "The parts every chat is built from" })).toBeVisible();
  await expect(frame.getByText("Tags label your library.", { exact: false })).toBeVisible();
  // …and one line per collection, from the contributions' own blurbs — no host string table, so a fourth
  // collection appears here from the same ONE door row.
  await expect(frame.getByText("Color-coded labels", { exact: false })).toBeVisible();
  await expect(frame.getByText("Find/replace that runs on input", { exact: false })).toBeVisible();
  await expect(frame.getByText("Keyword-triggered lore", { exact: false })).toBeVisible();

  // IT IS ACTUALLY ON THE PHONE'S SCREEN, not merely in the DOM: rendered inside the 430px pane, above the
  // first group band, with no horizontal overflow.
  const [frameBox, bandBox] = await Promise.all([frame.boundingBox(), listPane.getByRole("button", { name: TAGS_BAND }).boundingBox()]);
  if (frameBox === null || bandBox === null) {
    throw new Error("the mobile teaching frame or the first band did not render a box");
  }
  expect(frameBox.width, "the frame fits the phone pane").toBeLessThanOrEqual(PHONE_VIEWPORT_PX);
  expect(frameBox.y + frameBox.height, "the frame leads the list").toBeLessThanOrEqual(bandBox.y + 1);
  const overflow = await frame.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow, "no sideways scroll on a phone").toBe(0);
});

// ── #978 F1 · THE LIST'S ROW HEIGHT IS ONE GOVERNED BOX ──────────────────────────────────────────────
//
// The settings bands measured 290.2 × 16.0px on the live surface at BOTH pointer classes (side-eye
// 2026-09-02 F1, byte-identical to the 08-30 drive) while their COLLECTION siblings in the same list
// measured the governed `control-sm` box — one component, two heights, and Lighthouse `target-size`
// failing on nine nodes with a 20px safe clickable space. The cause is an AXIS mistake, not a missing
// size: the band Button is a child of a VERTICAL `Stack`, so `flex-1`'s `flex-basis: 0%` lands on the
// BLOCK axis and defeats the sealed `h-control-sm`; the box then falls back to min-content.
//
// The pin is DYNAMIC on both halves — every band the list renders, against the RESOLVED token — because
// the count is history (nine today) and the token is pointer-CONDITIONAL (44 coarse / 32 fine). A frozen
// nine or a literal 32 would ratify today's registry and fail a correct retune.
function controlSmPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.height = "var(--spacing-control-sm)";
    document.body.append(probe);
    const px = probe.getBoundingClientRect().height;
    probe.remove();
    return px;
  });
}

/** Every rendered band's height, in DOM order — zero-boxed (unmounted/hidden) bands dropped, so the
 *  LENGTH is a real measured count and a silent empty sweep can never read as a pass. */
function bandHeights(pane: Locator): Promise<readonly number[]> {
  return pane
    .locator('[data-slot="config-band"]')
    .evaluateAll((bands) => bands.map((band) => band.getBoundingClientRect().height).filter((height) => height > 0));
}

test("every band in the LIST is the governed control-sm box — one row height, not two", async ({ mount, page }) => {
  await stub(page);
  const listPane = await mount(<ConfigListDefaultStory />);
  await listPane.getByRole("button", { name: "reset groups" }).click();

  expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches), "the fine-pointer arm must be active").toBe(true);
  const floor = await controlSmPx(page);
  await expect.poll(async () => (await bandHeights(listPane)).length, "the sweep must have measured bands at all").toBeGreaterThan(1);
  const heights = await bandHeights(listPane);
  expect(new Set(heights), `all ${String(heights.length)} bands are the resolved control-sm box (${String(floor)}px)`).toEqual(new Set([floor]));
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true });

  test("every band in the LIST is the governed box at a COARSE pointer too", async ({ mount, page }) => {
    await stub(page);
    const listPane = await mount(<ConfigListDefaultStory />);
    await listPane.getByRole("button", { name: "reset groups" }).click();

    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the coarse arm must be active").toBe(true);
    const floor = await controlSmPx(page);
    await expect.poll(async () => (await bandHeights(listPane)).length, "the sweep must have measured bands at all").toBeGreaterThan(1);
    const heights = await bandHeights(listPane);
    expect(new Set(heights), `all ${String(heights.length)} bands are the resolved coarse control-sm box (${String(floor)}px)`).toEqual(new Set([floor]));
  });
});

// ── #978 F4 · THE LIST TELLS THE TRUTH ABOUT CONTENT'S ORDER ─────────────────────────────────────────
//
// The LIST used to paint the registry's RAW declaration order while CONTENT painted the advanced sections
// last, inside a collapsed fold — so the map advertised `… Avatars · Sizing & motion · Message details …`
// over a pane that renders `… Avatars · Message details …` and hides Sizing & motion 2200px down behind a
// disclosure the map never mentioned (side-eye 2026-09-02 F4). ONE partition contract now owns the order
// for both panes, and the fold's rows are announced as what they are.
const APPEARANCE_BAND = "Appearance";
/** The canonical Appearance sequence: the plain sections in declaration order, then the "Customize this
 *  look" cohort. LIST rows render `navLabel ?? label`, so "Message details" is the declared abbreviation
 *  of the "Message details & actions" heading. */
const APPEARANCE_ROWS = ["Looks", "Message style", "Avatars", "Message details", "Background", "Library", "Sizing & motion", "Reading typography", "Effects"];
const APPEARANCE_FOLD = "Customize this look";
function readRowTitles(scope: Locator): Promise<readonly string[]> {
  return scope.locator('[data-slot="list-row-title"]').evaluateAll((rows) => rows.map((row) => (row.textContent ?? "").trim()));
}

test("the LIST paints the Appearance group in CONTENT's order, with the fold's sections last", async ({ mount, page }) => {
  await stub(page);
  const listPane = await mount(<ConfigListDefaultStory />);
  await listPane.getByRole("button", { name: "reset groups" }).click();
  await listPane.getByRole("button", { name: APPEARANCE_BAND }).click();

  await expect
    .poll(() => readRowTitles(listPane.locator('[data-config-group="appearance"]')), "the map's sequence is the pane's sequence")
    .toEqual(APPEARANCE_ROWS);
});

test("the LIST says the last three Appearance sections live inside the fold", async ({ mount, page }) => {
  await stub(page);
  const listPane = await mount(<ConfigListDefaultStory />);
  await listPane.getByRole("button", { name: "reset groups" }).click();
  await listPane.getByRole("button", { name: APPEARANCE_BAND }).click();

  // A NAMED nested group, not a badge per row: the fold is ONE place in the pane, so the map states it
  // once and a screen reader hears those rows inside a group called by the disclosure's own label.
  const fold = listPane.getByRole("group", { name: APPEARANCE_FOLD });
  await expect(fold, "the fold cohort is announced by the disclosure's own label").toBeVisible();
  await expect.poll(() => readRowTitles(fold)).toEqual(["Sizing & motion", "Reading typography", "Effects"]);
});

// The fold's rows carry a SECOND indent step on top of the group's, so the naming costs width — and a
// point measurement at the roomy default would not prove the range. This is the OTHER end: the narrowest
// real docked pane (271px, both panels open), where the list already clips (#1106).
test("the fold's label and its extra indent still fit the NARROWEST docked pane (271px)", async ({ mount, page }) => {
  await stub(page);
  const listPane = await mount(<ConfigListNarrowStory />);
  await listPane.getByRole("button", { name: "reset groups" }).click();
  await listPane.getByRole("button", { name: APPEARANCE_BAND }).click();

  const fold = listPane.getByRole("group", { name: APPEARANCE_FOLD });
  await expect(fold).toBeVisible();
  const foldKicker = listPane.getByText(APPEARANCE_FOLD, { exact: true });
  await expect.poll(async () => [...(await overflows(foldKicker)), ...(await overflows(fold.locator('[data-slot="list-row-title"]')))]).toEqual([0, 0, 0, 0]);
});

// The ANCHOR, not a defect proof: CONTENT already painted this sequence before the fix (the pane was
// never the liar — the LIST was), so this pin is GREEN-BEFORE and is labelled as what it is. Its job is
// to make the canonical order above a claim about the RENDERED pane rather than a literal two tests
// agree on: if a future contribution reorders CONTENT, this reds and the LIST pins red with it.
test("the CONTENT pane paints the canonical sequence the LIST now advertises (parity anchor)", async ({ mount, page }) => {
  await stub(page);
  const host = await mount(<ConfigHostStory height={720} target="appearance" width={1100} />);

  // The fold is collapsed at rest, so its sections are not in the pane yet — open it and read the whole
  // rendered sequence. This is the map/territory claim itself: the LIST row title at index i is the
  // CONTENT heading at index i (or its declared abbreviation).
  await host.getByRole("button", { name: new RegExp(APPEARANCE_FOLD) }).click();
  const headings = host.locator('[data-slot="config-content"] h3');
  const readHeadings = (): Promise<readonly string[]> => headings.evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").trim()));
  await expect.poll(readHeadings, "every declared Appearance section is rendered once the fold is open").toHaveLength(APPEARANCE_ROWS.length);

  const rendered = await readHeadings();
  for (const [index, row] of APPEARANCE_ROWS.entries()) {
    expect(rendered[index]?.startsWith(row), `CONTENT heading ${String(index)} ("${String(rendered[index])}") is the LIST's row "${row}"`).toBe(true);
  }
});

// ── #1212 · THE BULK TOGGLE FOLLOWS THE MEMBERS ─────────────────────────────────────────────────────
// Measured: regex at count 0 drew "Select scripts" — enabled, focusable, `aria-disabled` unset — over a
// library with nothing to select. Population must decide what a control CAN DO (it must never decide
// whether a row is a door — that is the OTHER half of ruling 1, pinned in the content CT).
/** The same host, with ONE appearance knob moved off its default — the state `useConfigModified` derives the
 *  `@modified` marks from (a section's `owns` claim vs `DEFAULT_USER_SETTINGS`). `avatarShape` is an
 *  Appearance-owned key, so the mark lands on the Appearance band and on the User shelf above it. */
function stubModified(page: Page): Promise<TrpcRecorder> {
  return stub(page, MANY_TAGS, SCRIPTS, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_config",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, avatarShape: "square" } },
      configUnreadable: null,
      updatedAt: 0,
    }),
  });
}

// #1725 moved the toggle to the library's own control row, so BOTH arms of this ruling are asserted with the
// library OPEN — which is also the only state in which a reader could meet the control at all.
test("the BULK toggle is drawn only where there are members to select", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  const listPane = workspace.locator(LIST_PANE);
  const content = workspace.locator(CONTENT_PANE);

  // Tags are EMPTY in this stub and declare no bulk mode either — their library offers none.
  await listPane.getByRole("button", { name: TAGS_BAND }).click();
  await expect(content.getByRole("button", { name: ANY_BULK_TOGGLE })).toHaveCount(0);
  // Regex is populated and declares one, so its library draws it.
  await listPane.getByRole("button", { name: REGEX_BAND }).click();
  await expect(content.getByRole("button", { name: "Select scripts" })).toBeVisible();
});

test("…and it disappears when its library empties", async ({ mount, page }) => {
  // The regex library is EMPTY here (the same stub the collection-band CT uses for its first-run arm), so
  // the one collection that declares a bulk mode has nothing to select — and offers nothing.
  await stub(page, [], []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  const content = workspace.locator(CONTENT_PANE);

  await workspace.locator(LIST_PANE).getByRole("button", { name: REGEX_BAND }).click();
  await expect(content.getByRole("button", { name: ANY_BULK_TOGGLE })).toHaveCount(0);
  // …while the create verb, which works at every count, is untouched.
  await expect(content.getByRole("button", { name: "New script" })).toBeVisible();
});

// ── #1217 · THE AUTO-OPENED ARRIVAL GROUP FOLDS WHEN THE READER MOVES ON ────────────────────────────
// Auto-open is not user intent: the disclosure store is a memory of what the READER opened, and the
// arrival default writes into it on nobody's behalf. Measured: after entering a library, Appearance's nine
// rows sat expanded above it (the library 57% down the pane, 7 of 28 rows visible).
test("the group the arrival default opened folds itself once the reader is somewhere else", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  const listPane = workspace.locator(LIST_PANE);
  const arrival = listPane.getByRole("button", { name: FIRST_GROUP_LABEL, exact: true });
  await expect(arrival).toHaveAttribute("aria-expanded", "true");

  await listPane.getByRole("button", { name: TAGS_BAND }).click();
  await expect(arrival, "the arrival group folds when the location moves").toHaveAttribute("aria-expanded", "false");
  // …and the group the reader actually chose is where they are. It used to be asserted as `aria-expanded`
  // on the tags band; #1725 took that attribute off collection bands with the rows it disclosed, so the
  // claim is now what it always meant — the LOCATION moved — and it is read off the marker that survives.
  await expect(listPane.getByRole("button", { name: TAGS_BAND })).toHaveAttribute("aria-current", "true");
});

test("…but a group the READER opened stays open — the fold is the auto-open's undo, not a new accordion", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  const listPane = workspace.locator(LIST_PANE);

  // Open a second group deliberately, then move on: C-12's per-device memory is the reader's and survives.
  await listPane.getByRole("button", { name: "Chat behavior", exact: true }).click();
  await listPane.getByRole("button", { name: TAGS_BAND }).click();
  await expect(listPane.getByRole("button", { name: "Chat behavior", exact: true })).toHaveAttribute("aria-expanded", "true");
});

// ── #1218 · THE ARRIVAL FOCUS TARGET IS VISIBLE ─────────────────────────────────────────────────────
// The Tab-walk receipt: focus landed on `div[aria-label="Settings groups"]`, `tabindex=-1`,
// `:focus-visible` true, `outline: none` — a keyboard reader arrived somewhere with no indicator at all.
// The fix takes the row's SECOND arm (move the landing to the search box) rather than its first (paint a
// ring on the programmatic stop), because "a programmatic-only focus target must not paint a ring" is a
// recorded rule for every section surface and the shell modal's body. The fork is stated in the source.
test("arriving lands focus on the ACTIVE GROUP'S BAND — a real control with a visible focus ring", async ({ mount, page }) => {
  await stub(page);
  const section = await mount(<ConfigSectionArrivalStory />);

  // The bounce is what a rail switch does, and it is the only arrangement in which arrival focus exists at
  // all (`useFocusOnMount` declines on a cold load, where activeElement is `<body>`).
  await section.getByRole("button", { name: "Leave Configuration" }).click();
  await section.getByRole("button", { name: "Back to Configuration" }).click();

  const band = section.locator(LIST_PANE).locator(`[data-slot="config-band"][data-config-group="${FIRST_GROUP_ID}"]`);
  await expect(band).toBeFocused();
  // A REAL CONTROL, so it announces where the reader is and paints the house ring — the two things the old
  // target (a `tabIndex={-1}` scroller with `outline-none`) could not do.
  await expect(band).toHaveRole("button");
  await expect(band).toHaveAccessibleName(/\S/);
  await expect
    .poll(() =>
      band.evaluate((el: HTMLElement) => {
        const style = getComputedStyle(el);
        return `${style.outlineStyle}/${style.outlineWidth}/${style.boxShadow}`;
      }),
    )
    .not.toBe("none/0px/none");
});

// ── #1214 · THE A11Y TRIO ───────────────────────────────────────────────────────────────────────────
// (1) the band's name welded its mark onto the label ("AppearanceModified"); (2) the shelf drew TWO
// identical kickers ("USER MODIFIED"), same step, same tracking, same ink; (3) the expanded rows were not an
// owned, named set in the accessibility tree. All three are read off the RENDERED tree here.
test("a modified band announces its label and its mark as separate words", async ({ mount, page }) => {
  await stubModified(page);
  const workspace = await mount(<ConfigWorkspaceStory />);

  // The fixture moves an APPEARANCE-owned key, so Appearance is the band that wears the mark.
  const band = workspace.locator(LIST_PANE).locator(`[data-slot="config-band"][data-config-group="${FIRST_GROUP_ID}"]`);
  await expect(band.getByText(CONFIG_MODIFIED_MARK)).toBeVisible();
  // The name CONTAINS the visible label (WCAG 2.5.3) and the mark is a separate word, never welded to it.
  await expect(band).toHaveAccessibleName(`${FIRST_GROUP_LABEL} ${CONFIG_MODIFIED_MARK}`);
});

// A fresh account's first run seeds its background library with the shipped plates. A library is content, not a
// setting moved off its default, so it marks nothing; the avatar-shape stub above is the control that does.
test("a seeded background library marks no shelf as modified", async ({ mount, page }) => {
  await stub(page, MANY_TAGS, SCRIPTS, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_config",
      schemaVersion: 1,
      config: {
        ...DEFAULT_USER_SETTINGS,
        appearance: {
          ...DEFAULT_USER_SETTINGS.appearance,
          backgroundLibrary: [
            { entryId: "entry_seeded_plate", assetId: "asset_01j0000000000000000000000p", assetHash: "hash_seeded_plate", mime: "image/jpeg", name: "Plate" },
          ],
        },
      },
      configUnreadable: null,
      updatedAt: 0,
    }),
  });
  const workspace = await mount(<ConfigWorkspaceStory />);

  const shelf = workspace.locator(LIST_PANE).locator('[data-config-shelf="user"]');
  await expect(shelf).toBeVisible();
  await expect(appearanceRows(workspace).first()).toBeVisible();
  await expect(shelf.locator('[data-slot="config-shelf-modified"]')).toHaveCount(0);
});

test("the shelf's modified mark is a BADGE, not a second kicker of the same rank", async ({ mount, page }) => {
  await stubModified(page);
  const workspace = await mount(<ConfigWorkspaceStory />);

  const shelf = workspace.locator(LIST_PANE).locator('[data-config-shelf="user"]');
  const mark = shelf.locator('[data-slot="config-shelf-modified"]');
  await expect(mark).toBeVisible();
  // The shelf's NAME is still the kicker alone — the mark is not part of it.
  await expect(shelf).toHaveAccessibleName("User");
  // …and it is visibly a different KIND of thing: a badge box, not a bare run of kicker text.
  await expect(mark).toHaveAttribute("data-slot", "config-shelf-modified");
  await expect
    .poll(() => mark.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor))
    .not.toBe(
      await shelf
        .locator("p,span")
        .first()
        .evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor),
    );
});

test("an expanded band's rows are an OWNED, NAMED group, not flat siblings", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  const listPane = workspace.locator(LIST_PANE);

  // A settings group: its rows are a named group whose name is the band's own.
  const rows = listPane.locator(`[data-config-group="${FIRST_GROUP_ID}"] [role="group"]`).first();
  await expect(rows).toBeVisible();
  await expect(rows).toHaveAccessibleName(FIRST_GROUP_LABEL);
  // THE COLLECTION HALF OF #1214-3 IS RETIRED (#1725). It asserted the same anatomy over the contribution's
  // member rows, which were an owned, named group INSIDE this pane. The owner moved those rows to CONTENT,
  // where they are the pane's own content rather than a disclosed set under a band — so there is no band to
  // name them and no `role="group"` for a band to label. The settings half above is untouched and is the
  // whole live subject; nothing about a collection band goes unasserted (its name, count and one-act door
  // are `components/config-list-collection-group.ct.tsx`'s, swept across all four libraries).
  await listPane.getByRole("button", { name: TAGS_BAND }).click();
  await expect(listPane.locator('[data-collection="tags"] [role="group"]')).toHaveCount(0);
});

// ── #1169 · THE MAP'S LAST MILE, AND THE PANE'S VOICE BUDGET ────────────────────────────────────────
//
// The 2026-09-05 cohort census across the four LIST panes found the `@modified` verdict propagating UP — shelf, band —
// and stopping one level above the row that NAMES the location: `useConfigModified` derives BOTH grains in
// one pass and the LIST spent only the group one, so a reader who had changed one setting was told "a
// group under User changed" and then handed nine identical section rows. The same census judged the pane's
// FOUR voices and found two of them carrying STATE, which is the shape #1214-2 already moved off the shelf.
/** The Appearance SECTION that owns `avatarShape` — the key `stubModified` moves. Named here rather than
 *  derived so the assertion is about the ROW, not a second copy of the section registry's key partition. */
const MODIFIED_SECTION_ROW = "Avatars";
/** The Appearance group's own section rows, mounted (the arrival default expands this group). */
function appearanceRows(workspace: Locator): Locator {
  return workspace.locator(LIST_PANE).locator(`[data-config-group="${FIRST_GROUP_ID}"] [data-slot="list-row-root"]`);
}

test("the section ROW says WHICH section differs from its default", async ({ mount, page }) => {
  await stubModified(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  const rows = appearanceRows(workspace);
  await expect.poll(() => rows.count(), "the arrival group's rows must be mounted at all").toBeGreaterThan(1);

  // EXACTLY ONE row wears the mark, and it is the section whose `owns` claim holds the moved key — the
  // whole point of the SECTION grain (a group-grain answer would mark all nine).
  const marked = rows.filter({ hasText: CONFIG_MODIFIED_MARK });
  await expect(marked).toHaveCount(1);
  await expect(marked.locator('[data-slot="list-row-title"]')).toHaveText(MODIFIED_SECTION_ROW);
  // It reaches AT as the row's DESCRIPTION, never its NAME — `ListRow`'s #512 contract, which is why the
  // mark can be added at all without every settings row announcing its own state on every focus move.
  const body = marked.locator('[data-slot="list-row-body"]');
  await expect(body).toHaveAccessibleName(MODIFIED_SECTION_ROW);
  await expect(body).toHaveAccessibleDescription(new RegExp(CONFIG_MODIFIED_MARK));
});

/** Every mounted Appearance row's height, zero-boxed rows dropped — so the LENGTH is a real measured count
 *  and a silent empty sweep can never read as a pass (the band sweep's own discipline). */
function appearanceRowHeights(workspace: Locator): Promise<readonly number[]> {
  return appearanceRows(workspace).evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height).filter((height) => height > 0));
}

// THE MARK MUST NOT MOVE THE ROW. This is the mechanism half of the refusal recorded at `SubcategoryRow`:
// the peers' rest-visible-state slot (`ListRow.markers`, the chats row's `Archived` badge) takes a `sm`
// Badge BOX (~30px) that a title-only 35px row cannot absorb, so a modified row would out-grow its
// unmodified siblings and the LIST's pitch would depend on the reader's settings. `meta` is a 16px
// title-line datum and costs nothing. Measured against the OTHER rows in the same group rather than a
// literal, so a correct density retune moves them together and this stays true.
test("…and the mark does not change the row's pitch — one height across the whole group", async ({ mount, page }) => {
  await stubModified(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: fine)").matches), "the fine-pointer arm must be active").toBe(true);
  await expect.poll(async () => (await appearanceRowHeights(workspace)).length, "the sweep must have measured rows at all").toBeGreaterThan(1);

  const heights = await appearanceRowHeights(workspace);
  expect(new Set(heights), `all ${String(heights.length)} section rows share one pitch, marked or not`).toEqual(new Set([heights[0]]));
});

test.describe("coarse pointer — the section row", () => {
  test.use({ hasTouch: true });

  test("…at a COARSE pointer too, where the row box is the touch floor", async ({ mount, page }) => {
    await stubModified(page);
    const workspace = await mount(<ConfigWorkspaceStory />);
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the coarse arm must be active").toBe(true);
    await expect.poll(async () => (await appearanceRowHeights(workspace)).length, "the sweep must have measured rows at all").toBeGreaterThan(1);

    const heights = await appearanceRowHeights(workspace);
    expect(new Set(heights), `all ${String(heights.length)} section rows share one coarse pitch, marked or not`).toEqual(new Set([heights[0]]));
    // …and that one pitch IS the resolved coarse control box, not a smaller number that merely agrees with
    // itself: the census's open question about this row was whether it clears the finger floor.
    const floor = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.height = "var(--spacing-control-md)";
      document.body.append(probe);
      const px = probe.getBoundingClientRect().height;
      probe.remove();
      return px;
    });
    expect(heights[0], `the section row clears the resolved coarse control-md floor (${String(floor)}px)`).toBeGreaterThanOrEqual(floor);
  });
});

// THE BAND'S MARK IS A BADGE (the voice budget: STATE is never a NAME voice). It was a `Text voice="kicker"`
// — and the band's own label was `voice="interactiveKicker"`, i.e. the same micro-caps register — so a
// modified band read as two labels of equal rank, which is verbatim the #1214-2 defect the shelf's mark was
// moved off for. The pin is the DELTA between the two boxes on one rendered band, never a token value.
//
// IT NO LONGER NAMES THE LABEL BY ITS VOICE (#1839). This test addressed the band's name as
// `[data-voice="interactiveKicker"]`, so the moment that band left the caps register for `label` the
// locator resolved to nothing and the test timed out — a pin coupled to the value it was not about. The
// band's name has a stable identity of its own (`data-slot="band-label"`, which `Band` stamps); the voice
// is the subject of the #1839 arms below, and this one is about the MARK.
test("the band's modified mark is a BADGE, not a second name of the same rank", async ({ mount, page }) => {
  await stubModified(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  const band = workspace.locator(LIST_PANE).locator(`[data-slot="config-band"][data-config-group="${FIRST_GROUP_ID}"]`);
  const mark = band.locator('[data-slot="config-group-modified"]');
  await expect(mark).toBeVisible();

  const [markBg, labelBg] = await Promise.all([
    mark.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor),
    band.locator('[data-slot="band-label"]').evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor),
  ]);
  expect(markBg, "the mark is a box; the band's name is not").not.toBe(labelBg);
  // AND THE #1099 CLAUSE'S MECHANISM SURVIVES: the band is `h-control-sm`, a FIXED box, so a marked band is
  // exactly as tall as the resolved token — the reason that clause preferred text was "no growth", and a
  // box in a fixed-height control does not grow it.
  const box = await controlSmPx(page);
  await expect.poll(() => band.evaluate((el: HTMLElement) => el.getBoundingClientRect().height)).toBe(box);
});

// ── #1839 · A SHELF KICKER AND A BAND LABEL ARE TWO REGISTERS, NOT ONE STEP APART ────────────────────
// Side-eye called F23 live for a THIRD review running (2026-08-30, 2026-09-02, 2026-09-06, verbatim each
// time): the LIST's shelf headings measured 10.5px/600/CAPS and its group bands 13px/600/CAPS — same
// weight, same case, 2.5px apart, the only difference between them being tracking. A shelf is a HEADING
// OVER DOORS and a band IS a door; two roles that far apart in intent must not be that close in
// appearance. The type scale is closed, so the fix spends no new size: the shelf keeps the caps register
// (`voice="kicker"`) and the band leaves it (`voice="label"`), which separates them on case, weight and
// tracking at once.
//
// READ AS RESOLVED COMPUTED STYLE, never as a class string, and at BOTH pane widths: the claim is about
// what the reader sees, and a register that held at one width and not the other would be no register.
/** A run's type register — the axes a reader actually distinguishes two roles by. */
async function typeRegister(node: Locator): Promise<{ readonly size: string; readonly weight: string; readonly transform: string }> {
  return await node.evaluate((el: Element) => {
    const style = getComputedStyle(el);
    return { size: style.fontSize, weight: style.fontWeight, transform: style.textTransform };
  });
}

for (const width of [1440, 990] as const) {
  test(`#1839: the shelf kicker and the band label are two registers at ${String(width)}px`, async ({ mount, page }) => {
    await stub(page);
    const component = await mount(<ConfigHostStory width={width} />);
    const listPane = component.locator(LIST_PANE);
    // The shelf's own name run — the same node #1214's badge test measures against.
    const shelfKicker = listPane.locator('[data-config-shelf="user"]').locator("p,span").first();
    const bandLabel = listPane.locator(`[data-slot="config-band"][data-config-group="${FIRST_GROUP_ID}"] [data-slot="band-label"]`);
    await expect(bandLabel).toBeVisible();

    const shelf = await typeRegister(shelfKicker);
    const band = await typeRegister(bandLabel);
    expect(shelf.transform, "the SHELF is the caps register").toBe("uppercase");
    expect(band.transform, "a band is a door, not a second shelf heading — it leaves the caps register").toBe("none");
    expect(band.size, `the two must not be one step apart: shelf ${shelf.size}/${shelf.weight}, band ${band.size}/${band.weight}`).not.toBe(shelf.size);
  });
}
