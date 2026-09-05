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
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
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

function tagRow(index: number): Record<string, unknown> {
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

/** The first list ROW, scoped to the list (program #102). The welcome's hero previews the library's
 *  most-used tags by NAME, so an unscoped `getByText("tag-002")` is a strict-mode violation: it matches the
 *  row AND a preview chip. Every use below means the ROW. */
function firstRow(workspace: Locator): Locator {
  return workspace.locator(LIST_PANE).getByText(FIRST_ROW);
}

/** A list ROW by any text it carries, scoped to the LIST. Every collection now declares a welcome
 *  preview (side-eye 2026-08-19 P1-2), so the launcher walls print member NAMES and SCENTS for all three
 *  — "strip ooc" and "42 entries · attached ×3" each match a row AND a chip. Clicking the chip opens the
 *  collection instead of the member, which is a silent wrong-target, not a failure. Every use below means
 *  the ROW; it is the `firstRow` rule generalized. */
function listRow(workspace: Locator, text: string): Locator {
  return workspace.locator(LIST_PANE).getByText(text);
}

/** One regex fixture row — the shape `regex.listScripts` returns. */
function scriptRow(over: {
  readonly id: string;
  readonly name: string;
  readonly findRegex: string;
  readonly placement: readonly string[];
}): Record<string, unknown> {
  return {
    replaceString: "",
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    // A fixed edit stamp (X-16's `RegexScriptRow.updatedAt`) — the wall clock never reaches a fixture.
    updatedAt: 1_760_000_000_000,
    substituteRegex: "none",
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

/** The list row TITLE spans, scoped to one collection's group — the span `truncate` acts on. */
function rowTitles(listPane: Locator, collectionId: string): Locator {
  return listPane.locator(`[data-collection="${collectionId}"] [data-slot="list-row-title"]`);
}

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
  tags: readonly unknown[] = MANY_TAGS,
  scripts: readonly unknown[] = SCRIPTS,
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    // The fourth collection (casts) + the viewer projection the LIST's `when` gate reads (#866 S1).
    "rosterPreset.list": [],
    // The workspace story now mounts the CONTEXT through the real resolve (#866 S3), and a selected
    // group's skimmer sections read the settings blob — fed the real defaults, never an inert null.
    "settings.getUserSettings": () => ({ userId: "user_ct_config", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    // The Looks section (#866 S4) reads the theme library — three seeds, no owned rows.
    "settings.listThemes": () => [
      { id: "theme_00000000000000000000000001", name: "Hearth", override: {}, css: null, isSeed: true, isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "theme_00000000000000000000000002", name: "Mocha", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
      { id: "theme_00000000000000000000000003", name: "Light", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
    ],
    "sessions.me": { userId: "user_ct_config", handle: "ct_config", globalRole: "user" },
    "tag.listTagsWithUsage": () => tags,
    "tag.createTag": () => tagRow(TAG_COUNT),
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

test("every group starts COLLAPSED, showing its band, count and create verb — never its rows", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // The list is the MAP: all three libraries are named, counted, and creatable at rest, in DOOR ORDER.
  const listPane = workspace.locator(LIST_PANE);
  await expect(listPane.getByRole("button", { name: TAGS_BAND })).toBeVisible();
  await expect(listPane.getByText(String(TAG_COUNT))).toBeVisible();
  await expect(listPane.getByRole("button", { name: "New tag" })).toBeVisible();
  await expect(listPane.getByRole("button", { name: "New script" })).toBeVisible();
  await expect(listPane.getByRole("button", { name: "New book" })).toBeVisible();
  // REGISTRY ORDER IS SHELF ORDER (C-1 as amended by #866 S1: `(shelf, order, id)`): tags · regex scripts ·
  // world info · casts, top-down on the Collections shelf.
  await expect
    .poll(() => listPane.locator('[data-slot="config-group"][data-collection]').evaluateAll((groups) => groups.map((g) => g.getAttribute("data-collection"))))
    .toEqual(["tags", "regex", "worldInfo", "rosterPreset"]);
  await expect(listPane.getByRole("button", { name: WORLD_INFO_BAND })).toHaveAttribute("aria-expanded", "false");
  // …and not one of the 400 ROWS is mounted. Scoped to the list (program #102): the claim is about the
  // collapsed group's rows, and the welcome's hero legitimately prints tag NAMES in its preview wall — an
  // unscoped count would be answering a different question with this fixture's ranking.
  await expect(listPane.getByRole("button", { name: TAGS_BAND })).toHaveAttribute("aria-expanded", "false");
  await expect(listPane.getByText("tag-000")).toHaveCount(0);
});

test("expanding a 400-member group renders its rows and offers the count-driven filter", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: TAGS_BAND }).click();
  await expect(workspace.locator(LIST_PANE).getByRole("button", { name: TAGS_BAND })).toHaveAttribute("aria-expanded", "true");
  await expect(firstRow(workspace)).toBeVisible();

  // The filter is HOST chrome, shown by COUNT — and applied by the contribution's own rows.
  const filter = workspace.getByRole("textbox", { name: "Filter tags" });
  await expect(filter).toBeVisible();
  await filter.fill("tag-137");
  await expect(workspace.locator(LIST_PANE).getByText("tag-137")).toBeVisible();
  await expect(firstRow(workspace)).toHaveCount(0);

  // Create stays reachable with a 400-row list open (the band is chrome, not a list item).
  await expect(workspace.locator(LIST_PANE).getByRole("button", { name: "New tag" })).toBeVisible();
});

test("a small group gets NO filter (the affordance is count-driven, not per-collection)", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: REGEX_BAND }).click();
  await expect(listRow(workspace, "strip ooc")).toBeVisible();
  await expect(workspace.getByRole("textbox", { name: "Filter regex scripts" })).toHaveCount(0);
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
test("the group band draws IMPORT only for a collection that declares one", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const listPane = workspace.locator(LIST_PANE);
  await expect(listPane.getByRole("button", { name: "Import a world-info book" })).toBeVisible();
  await expect(listPane.getByRole("button", { name: "Import a regex script" })).toBeVisible();
  await expect(listPane.getByRole("button", { name: ANY_IMPORT_TRIGGER })).toHaveCount(2);
});

// The BULK-SELECT toggle is the same DATA-declared band grammar (REGX2). Only regex declares one today, and
// the assertion is that the band draws it for exactly that collection — a toggle on a library with no bulk
// verbs behind it would be a control that does nothing.
test("the group band draws the BULK toggle only for a collection that declares one", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const listPane = workspace.locator(LIST_PANE);
  const toggle = listPane.getByRole("button", { name: "Select scripts" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(listPane.getByRole("button", { name: ANY_BULK_TOGGLE })).toHaveCount(1);
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

test("the group create verb fires the OWNER's create mutation", async ({ mount, page }) => {
  const trpc = await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(LIST_PANE).getByRole("button", { name: "New tag" }).click();
  await expect.poll(() => trpc.lastInput("tag.createTag"), { intervals: [20, 50, 100] }).toEqual({ input: { name: "New tag" } });
});

test("a zero-member group keeps its band and says so — with exactly ONE create verb in the list", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const listPane = workspace.locator(LIST_PANE);
  await expect(listPane.getByText("No tags yet.")).toBeVisible();
  // ONE, not two (side-eye 2026-08-08 P2). The empty slot used to repeat the band's verb — and with the
  // Configuration launcher card carrying a third copy, "New tag" rendered three times on one screen. The
  // band's `+` is the list's standing create affordance at every count, so it is the one that stays here;
  // the launcher card keeps the other (the owner's C7 arm-2 onboarding ruling). The COUNT is the assertion —
  // a re-added inline verb reds this immediately.
  await expect(listPane.getByRole("button", { name: "New tag" })).toHaveCount(1);
  // …and the ZERO group's band offers NO disclosure (side-eye 2026-08-06 P2): the chevron used to open a
  // panel onto nothing, one row above the card that had already said the library was empty. Scoped to the
  // tags group — its populated siblings in this story keep their own toggles, which is the control.
  await expect(listPane.locator('[data-collection="tags"]').getByRole("button", { expanded: false })).toHaveCount(0);
  await expect(listPane.locator('[data-collection="tags"]').getByRole("button", { expanded: true })).toHaveCount(0);
  // Scoped to the COLLECTION bands: the nine settings-group bands on the other shelves are disclosures too.
  await expect(listPane.locator('[data-slot="collection-band"]').getByRole("button", { expanded: false })).toHaveCount(2);
});

// …AND ITS BAND STILL LINES UP WITH ITS SIBLINGS (side-eye 2026-08-08 P3). Standing the disclosure down also
// dropped the chevron's 16px box and the 4px joint, so a zero-member band's glyph started 20px left of every
// populated sibling's and the list's left edge became data-dependent. The pin is the rendered X of the
// COLLECTION GLYPH in each band — the empty group's against a populated sibling's — because a reserved gutter
// is a geometric fact and an `invisible` class is not. `svg` index 1 in both bands: 0 is the chevron (real on
// a populated band, `invisible` on the empty one), 1 is the collection's own glyph.
test("a zero-member band RESERVES the disclosure gutter — its glyph aligns with its populated siblings'", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const listPane = workspace.locator(LIST_PANE);
  const glyphOf = (collection: string): Locator => listPane.locator(`[data-collection="${collection}"] [data-slot="collection-band"] svg`).nth(1);
  const emptyGlyph = glyphOf("tags");
  const populatedGlyph = glyphOf("worldInfo");
  await expect(emptyGlyph).toBeVisible();
  await expect(populatedGlyph).toBeVisible();

  const [emptyBox, populatedBox] = await Promise.all([emptyGlyph.boundingBox(), populatedGlyph.boundingBox()]);
  if (emptyBox === null || populatedBox === null) {
    throw new Error("a collection band did not render its glyph");
  }
  expect(Math.abs(emptyBox.x - populatedBox.x), "the zero-member band's glyph shares the siblings' left edge").toBeLessThanOrEqual(1);
});

// …AND IT SAYS ZERO (same finding). Every populated band carries its count, so the one band with nothing in it
// was also the one band that declined to say how much — leaving "this library is empty" and "the count has not
// loaded yet" indistinguishable at the exact moment the number is the point.
test("a zero-member band renders its count", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const band = workspace.locator(LIST_PANE).locator('[data-collection="tags"] [data-slot="collection-band"]');
  await expect(band.getByText("0", { exact: true })).toBeVisible();
});

// …AND IT IS ONE LINE, NOT A CARD AND NOT A ROW.
//
// ═══ THE RULING FORK, STATED (#1211 · side-eye 2026-08-08 P2, and its own no-deletion clause) ═══
//
// THE RECORDED RULING here was "a centered CARD, not a row", pinned as the copy centered inside its dashed
// frame with the frame taller than the copy. #1211 measured the SHELF instead of the slot and found the card
// itself was the defect: on the live desktop surface at this lane's base commit the one POPULATED library
// was a 32px band while each of the three EMPTY groups totalled 75px, of which a 39px dashed box — the
// loudest, tallest and only bordered thing on the Collections shelf was the part with nothing in it. So the
// card is gone and `collection-group-empty` is now the copy's own line (13px; the group totals 49px).
//
// THIS FILE'S OWN NO-DELETION CLAUSE IS OBEYED, NOT OVERRULED. Its words: "a removed affordance whose
// geometry pin is simply deleted leaves the slot with NO shape guard at all — which is how the 'broken table
// row' shipped the first time." That is exactly why this is a RETARGET and not a deletion, for the second
// time. The guard's MECHANISM is unchanged — a rendered-geometry claim about the slot's shape, never a class
// list — and only its CONDITION moved: the slot must now be exactly its copy (no frame box to be padded
// inside), a SINGLE line that never outweighs the band that names it, and aligned on the band's own content
// edge rather than centered in a box. A future card cannot come back under it: a frame would make the slot
// taller than its copy, and a shared line with a verb would move the copy off that edge.
test("the zero-member slot is ONE LINE on the band's edge — no frame around it, and it never outweighs the band", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const group = workspace.locator(LIST_PANE).locator('[data-collection="tags"]');
  const slot = group.locator('[data-slot="collection-group-empty"]');
  const copy = group.getByText("No tags yet.");
  await expect(copy).toBeVisible();
  await expect(slot).toBeVisible();

  const band = group.locator('[data-slot="collection-band"] [data-slot="config-band"]');
  // The disclosure gutter's glyph — the band's own content edge, which is the column the line claims. On a
  // zero-member band it is the RESERVED spacer, so it is `visibility: hidden` by design (the two tests above
  // own that ruling): it is asserted attached, never visible, and it still has the box this measures.
  const gutter = band.locator("svg").first();
  await expect(gutter).toBeAttached();

  // Measured as three named deltas rather than one object so a failure says WHICH half of the claim broke.
  const geometry = async (): Promise<{ framePadding: number; edgeDrift: number; bandRatio: number }> => {
    const [slotBox, copyBox, bandBox, gutterBox] = await Promise.all([slot.boundingBox(), copy.boundingBox(), band.boundingBox(), gutter.boundingBox()]);
    if (slotBox === null || copyBox === null || bandBox === null || gutterBox === null) {
      return { framePadding: Number.POSITIVE_INFINITY, edgeDrift: Number.POSITIVE_INFINITY, bandRatio: Number.POSITIVE_INFINITY };
    }
    // The column claim is about the TEXT's start, not the slot's border box — the slot carries the same
    // horizontal padding the band button does, which is exactly how the two columns come to agree.
    const inset = await slot.evaluate((el: Element): number => Number.parseFloat(getComputedStyle(el).paddingLeft));
    return { framePadding: slotBox.height - copyBox.height, edgeDrift: Math.abs(slotBox.x + inset - gutterBox.x), bandRatio: slotBox.height / bandBox.height };
  };

  // NO FRAME: the slot IS the copy — nothing wraps it with padding of its own. A returning card fails here.
  await expect.poll(async (): Promise<number> => (await geometry()).framePadding).toBeLessThanOrEqual(0.5);
  // ON THE BAND'S EDGE: the line starts in the disclosure gutter's column, not centred and not on the pane
  // edge. A verb sharing the line, or a re-centred box, moves the copy off it.
  await expect.poll(async (): Promise<number> => (await geometry()).edgeDrift).toBeLessThanOrEqual(1);
  // AND QUIETER THAN ITS BAND. At the defect the slot was 39px against a 32px band (1.22); one line is well
  // under 1, and the assertion is the INEQUALITY, not a remembered px.
  await expect.poll(async (): Promise<number> => (await geometry()).bandRatio).toBeLessThan(1);
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

/** Expand the regex group in a list-only story and settle on its rows. */
async function openRegexRows(listPane: Locator): Promise<void> {
  await listPane.getByRole("button", { name: "reset groups" }).click();
  await listPane.getByRole("button", { name: REGEX_BAND }).click();
  await expect(listPane.getByText("Format dialogue quotes")).toBeVisible();
}

/** The width claim itself, so the two mounts assert the identical thing: every script NAME and the band's
 *  own KICKER render whole. (Spelled as a helper rather than a `for` over the two story COMPONENTS —
 *  playwright-ct rewrites imported components into generated consts, and a component referenced both in
 *  JSX and as an array value is declared twice: `SyntaxError: Identifier … has already been declared`.) */
async function listOverflows(listPane: Locator): Promise<readonly number[]> {
  await openRegexRows(listPane);
  const titles = rowTitles(listPane, "regex");
  await expect(titles).toHaveCount(SCRIPTS.length);
  const kicker = listPane.getByText("Regex scripts", { exact: true });
  await expect(kicker).toBeVisible();
  return [...(await overflows(titles)), ...(await overflows(kicker))];
}

/** One zero per script NAME plus one for the band's own KICKER — the whole list, rendered whole. */
const NOTHING_CLIPS = [...SCRIPTS.map(() => 0), 0];

test("nothing in the list clips with BOTH panels open (271px)", async ({ mount, page }) => {
  await stub(page);
  const overflow = await listOverflows(await mount(<ConfigListNarrowStory />));
  expect(overflow, "every script name and the band's own name render whole, not as ellipses").toEqual(NOTHING_CLIPS);
});

test("nothing in the list clips at the docked default (307px)", async ({ mount, page }) => {
  await stub(page);
  const overflow = await listOverflows(await mount(<ConfigListDefaultStory />));
  expect(overflow, "every script name and the band's own name render whole, not as ellipses").toEqual(NOTHING_CLIPS);
});

// FORK 2: THE PATTERN LEADS THE SCENT. The old subtitle spelled every pipeline stage in words first
// ("history sent to the model · rendered transcript · model output · …"), so the two data that actually
// tell two rows apart — the find pattern and the edit stamp — were pushed past the ellipsis at EVERY pane
// width. The stages are still said, as glyphs carrying their own accessible names, in the subtitle's lead
// slot; the words they replace cost 396-572px of a 133px column.
/** The scent line of the three-stage fixture row — the widest scent this library draws. */
function busiestScent(listPane: Locator): Locator {
  return listPane
    .locator('[data-collection="regex"] [data-slot="list-row-root"]')
    .filter({ hasText: "Format dialogue quotes" })
    .locator('[data-slot="list-row-subtitle"]');
}

test("a list row's scent LEADS with the find pattern, and the stages ride as named glyphs", async ({ mount, page }) => {
  await stub(page);
  const listPane = await mount(<ConfigListNarrowStory />);
  await openRegexRows(listPane);

  const subtitle = busiestScent(listPane);
  // The VISIBLE text, not the source: the pattern is the first thing after the glyph lead.
  await expect(subtitle).toContainText('/"([^"]+)"/g');
  await expect(subtitle, "the stage names no longer spend the line").not.toContainText("history sent to the model");
  // …and the stages are still ANNOUNCED — the glyphs carry the labels the words used to, all three of them
  // (a script bites on a SET, and a strip that showed one of them would say less than the words did).
  await expect(subtitle.getByLabel("History sent to the model")).toBeVisible();
  await expect(subtitle.getByLabel("Rendered transcript")).toBeVisible();
  await expect(subtitle.getByLabel("Model output")).toBeVisible();
});

// …AND THE WHOLE LINE FITS THE PANE THE READER ARRIVES IN. Scoped to the DEFAULT docked width on purpose,
// and DEMOTED from a both-widths claim by measurement: at the both-open 271px the busiest scent — three
// glyphs, a 12-character pattern and a relative stamp — still overruns by 30px, and every remaining byte
// on that line is load-bearing (the pattern is X-15/X-16's discriminator for two authored rows, the stamp
// is X-16's for two just-created ones). What the fix owed and delivers is that the PATTERN LEADS, so the
// clipped end is now the tail rather than everything; the report's own receipt bar was the unclipped
// TITLE, which holds at both widths above.
test("the busiest scent fits the docked default pane (307px) whole", async ({ mount, page }) => {
  await stub(page);
  const listPane = await mount(<ConfigListDefaultStory />);
  await openRegexRows(listPane);

  expect(await overflows(busiestScent(listPane)), "the stage words used to want 396-572px of a 133px column").toEqual([0]);
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

    await workspace.locator(LIST_PANE).getByRole("button", { name: band }).click();
    const group = workspace.locator(LIST_PANE).locator(`[data-collection="${collectionId}"]`);
    const list = group.getByRole("list");
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

  const miss = workspace.locator(LIST_PANE).getByRole("status");
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
      updatedAt: 0,
    }),
  });
}

test("the BULK toggle is drawn only where there are members to select", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  const listPane = workspace.locator(LIST_PANE);

  // Tags are EMPTY in this stub and regex is populated: the toggle regex declares appears for regex only.
  await expect(listPane.locator('[data-collection="tags"]').getByRole("button", { name: ANY_BULK_TOGGLE })).toHaveCount(0);
  await expect(listPane.getByRole("button", { name: "Select scripts" })).toBeVisible();
});

test("…and it disappears when its library empties", async ({ mount, page }) => {
  // The regex library is EMPTY here (the same stub the collection-band CT uses for its first-run arm), so
  // the one collection that declares a bulk mode has nothing to select — and offers nothing.
  await stub(page, [], []);
  const workspace = await mount(<ConfigWorkspaceStory />);

  await expect(workspace.locator(LIST_PANE).getByRole("button", { name: ANY_BULK_TOGGLE })).toHaveCount(0);
  // …while the create verb, which works at every count, is untouched.
  await expect(workspace.locator(LIST_PANE).getByRole("button", { name: "New script" })).toBeVisible();
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
  // …and the group the reader actually chose is the open one.
  await expect(listPane.getByRole("button", { name: TAGS_BAND })).toHaveAttribute("aria-expanded", "true");
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
  // A COLLECTION group: the same anatomy over the contribution's own rows.
  await listPane.getByRole("button", { name: TAGS_BAND }).click();
  const memberRows = listPane.locator('[data-collection="tags"] [role="group"]').first();
  await expect(memberRows).toBeVisible();
  await expect(memberRows).toHaveAccessibleName(/^Tags/);
});

// ── #1169 · THE MAP'S LAST MILE, AND THE PANE'S VOICE BUDGET ────────────────────────────────────────
//
// The 2026-09-05 cohort census across the four LIST panes (docs/reviews/misc/
// 2026-09-05-config-list-pane-divergence.md) found the `@modified` verdict propagating UP — shelf, band —
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
// — and the band's own label is `voice="interactiveKicker"`, i.e. the same micro-caps register — so a
// modified band read as two labels of equal rank, which is verbatim the #1214-2 defect the shelf's mark was
// moved off for. The pin is the DELTA between the two boxes on one rendered band, never a token value.
test("the band's modified mark is a BADGE, not a second name of the same rank", async ({ mount, page }) => {
  await stubModified(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  const band = workspace.locator(LIST_PANE).locator(`[data-slot="config-band"][data-config-group="${FIRST_GROUP_ID}"]`);
  const mark = band.locator('[data-slot="config-group-modified"]');
  await expect(mark).toBeVisible();

  const [markBg, labelBg] = await Promise.all([
    mark.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor),
    band.locator('[data-voice="interactiveKicker"]').evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor),
  ]);
  expect(markBg, "the mark is a box; the band's name is not").not.toBe(labelBg);
  // AND THE #1099 CLAUSE'S MECHANISM SURVIVES: the band is `h-control-sm`, a FIXED box, so a marked band is
  // exactly as tall as the resolved token — the reason that clause preferred text was "no growth", and a
  // box in a fixed-height control does not grow it.
  const box = await controlSmPx(page);
  await expect.poll(() => band.evaluate((el: HTMLElement) => el.getBoundingClientRect().height)).toBe(box);
});
