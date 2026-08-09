// CT: the Configuration workspace — the host frame over the REAL tag + regex + world-info collections.
//
// This is the seam's acceptance test: the host draws bands, disclosure, counts, create and the filter; the
// contributions draw rows, editors and context bodies; and the ONE kinded selection routes between them.
//
// AT SCALE, ON PURPOSE (owner ruling 2026-08-02): the tags fixture is FOUR HUNDRED rows, because that is
// the owner's real library and every decision here — collapsed by default, the count-driven filter, the
// windowed rows — exists for that size. A five-row toy would pass while the shipped surface stalled.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ConfigRosterNarrowStory, ConfigWorkspaceStory } from "../_ct-stories.tsx";

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

/** Every collection's create verb, as one pattern — the door array's whole create vocabulary is
 *  `New tag` / `New script` / `New book`. */
const ANY_CREATE_VERB = /^New /;
/** The two launcher CARDS the launcher tests drive, addressed by their BLURB — the accessible name of an
 *  operable card is its own content, and the blurb is the half the roster band does not carry. */
const TAGS_LAUNCHER = /Colour-coded labels/;
const WORLD_INFO_LAUNCHER = /Keyword-triggered lore/;
/** The coarse-pointer tap floor (WCAG 2.5.5 / the house `size-control-md` coarse step). */
const TOUCH_FLOOR_PX = 44;

// The workspace mounts all three panes, and TWO of them legitimately offer a collection's create verb: the
// group BAND (the per-group `+`) and the welcome's LAUNCHER CARD. That is the drawn design, so the CTs
// address the region they mean by its slot rather than by a bare name.
const ROSTER = '[data-slot="config-roster"]';
const WELCOME = '[data-slot="config-welcome"]';

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

/** The FIRST row the tag roster renders. Its default order is MOST-USED (tag-experience audit 2026-08-03,
 *  `sortTagsBy`), and this fixture's usage is `index % 3` — so the window opens on the `%3 === 2` bucket,
 *  not on `tag-000`. Naming it here keeps these host assertions about the HOST (rows mounted, filter
 *  applied) instead of quietly re-asserting the owner's comparator. */
const FIRST_ROW = "tag-002";

const SCRIPTS = [
  {
    id: "regex_script_stripooc",
    name: "strip ooc",
    findRegex: "/^\\s*ooc:.*$/gim",
    replaceString: "",
    placement: ["AI_OUTPUT"],
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    // A fixed edit stamp (X-16's `RegexScriptRow.updatedAt`) — the wall clock never reaches a fixture.
    updatedAt: 1_760_000_000_000,
    substituteRegex: "none",
  },
];

const BOOK = {
  id: "world_book_reach000001",
  name: "The Ninefold Reach",
  description: null,
  createdAt: 1,
  entryCount: 42,
  usage: { characters: 2, personas: 0, chats: 0, global: true, total: 3 },
};
const BOOKS = [BOOK];

function stub(page: Page, tags: readonly unknown[] = MANY_TAGS): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => tags,
    "tag.createTag": () => tagRow(TAG_COUNT),
    "regex.listScripts": () => SCRIPTS,
    "regex.listGlobal": () => [],
    // The regex CONTEXT arm's reverse rosters (REGROSTER) — this host only proves that the arm MOUNTS;
    // what the rosters say is pinned by the regex feature's own CT.
    "regex.listScriptUsage": () => ({ presets: [], characters: [], rooms: [] }),
    "regex.createScript": () => SCRIPTS[0],
    "worldInfo.listBooksWithUsage": () => BOOKS,
    "worldInfo.getBook": () => ({ id: BOOK.id, name: "The Ninefold Reach", description: null, createdAt: 1 }),
    "worldInfo.listEntries": () => [],
    "worldInfo.listGlobal": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
    "worldInfo.importFile": () => ({ created: true }),
  });
}

test("every group starts COLLAPSED, showing its band, count and create verb — never its rows", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // The roster is the MAP: all three libraries are named, counted, and creatable at rest, in DOOR ORDER.
  const roster = workspace.locator(ROSTER);
  await expect(roster.getByRole("button", { name: TAGS_BAND })).toBeVisible();
  await expect(roster.getByText(String(TAG_COUNT))).toBeVisible();
  await expect(roster.getByRole("button", { name: "New tag" })).toBeVisible();
  await expect(roster.getByRole("button", { name: "New script" })).toBeVisible();
  await expect(roster.getByRole("button", { name: "New book" })).toBeVisible();
  // DOOR ORDER IS ROSTER ORDER (C-1, extended by R2): tags · regex scripts · world info, top-down.
  await expect
    .poll(() => roster.locator('[data-slot="collection-group"]').evaluateAll((groups) => groups.map((g) => g.getAttribute("data-collection"))))
    .toEqual(["tags", "regex", "worldInfo"]);
  await expect(roster.getByRole("button", { name: WORLD_INFO_BAND })).toHaveAttribute("aria-expanded", "false");
  // …and not one of the 400 rows is mounted.
  await expect(roster.getByRole("button", { name: TAGS_BAND })).toHaveAttribute("aria-expanded", "false");
  await expect(workspace.getByText("tag-000")).toHaveCount(0);
});

test("expanding a 400-member group renders its rows and offers the count-driven filter", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(ROSTER).getByRole("button", { name: TAGS_BAND }).click();
  await expect(workspace.locator(ROSTER).getByRole("button", { name: TAGS_BAND })).toHaveAttribute("aria-expanded", "true");
  await expect(workspace.getByText(FIRST_ROW)).toBeVisible();

  // The filter is HOST chrome, shown by COUNT — and applied by the contribution's own rows.
  const filter = workspace.getByRole("textbox", { name: "Filter tags" });
  await expect(filter).toBeVisible();
  await filter.fill("tag-137");
  await expect(workspace.getByText("tag-137")).toBeVisible();
  await expect(workspace.getByText(FIRST_ROW)).toHaveCount(0);

  // Create stays reachable with a 400-row list open (the band is chrome, not a list item).
  await expect(workspace.locator(ROSTER).getByRole("button", { name: "New tag" })).toBeVisible();
});

test("a small group gets NO filter (the affordance is count-driven, not per-collection)", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(ROSTER).getByRole("button", { name: REGEX_BAND }).click();
  await expect(workspace.getByText("strip ooc")).toBeVisible();
  await expect(workspace.getByRole("textbox", { name: "Filter regex scripts" })).toHaveCount(0);
});

test("no selection renders the host WELCOME with a launcher card per collection", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const welcome = workspace.locator(WELCOME);
  await expect(welcome.getByRole("heading", { name: "The parts every chat is built from" })).toBeVisible();
  // Each card is drawn from the CONTRACT (label · icon · count · blurb · create), never a host string table.
  await expect(welcome.getByText("Colour-coded labels for characters, chats, books, personas and presets.")).toBeVisible();
  await expect(welcome.getByText("Find/replace that runs on input, output, or both — everywhere, or only where you attach it.")).toBeVisible();
  await expect(welcome.getByText("Keyword-triggered lore your characters draw on — a book fires where you attach it.")).toBeVisible();
});

/** One launcher card in the welcome, by its collection id. */
function launcher(workspace: Locator, collectionId: string): Locator {
  return workspace.locator(WELCOME).locator(`[data-collection="${collectionId}"]`);
}

/** SETTLE BARRIER for the launcher arms: each ROSTER band prints its own collection's count, off the SAME
 *  cache-first hook the launcher reads. Until a band shows its number that collection's count is
 *  `undefined` — the in-flight state, where a launcher legitimately still draws its create verb — so a
 *  populated-arm assertion made before this barrier would be asserting a flash. */
async function bandCount(workspace: Locator, collectionId: string, count: number): Promise<void> {
  await expect(workspace.locator(ROSTER).locator(`[data-collection="${collectionId}"] [data-slot="collection-band"]`).getByText(String(count))).toBeVisible();
}

// C7 arm 2 (split-the-class, 2026-08-08): with both panes docked and populated, `Tags · 400 · New tag`
// rendered in the roster band AND in the welcome's launcher card — two homes for one concept on one screen.
// The fix is per-CHILD (the documented rules-of-hooks trap: a "switch voice when populated" parent would
// have to read N owner count hooks in a loop), and it sheds ONLY the duplicated half: a populated card keeps
// the blurb, which is the one thing the band does not carry.
test("a POPULATED collection's launcher sheds the count + create the roster band already carries", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await bandCount(workspace, "tags", TAG_COUNT);
  await bandCount(workspace, "regex", SCRIPTS.length);
  await bandCount(workspace, "worldInfo", BOOKS.length);

  const welcome = workspace.locator(WELCOME);
  // The restatement is gone from the LANDING — every CREATE verb on screen is the roster's. (This used to
  // read `welcome.getByRole("button")).toHaveCount(0)`; the card itself is a button now — the launcher of
  // the test below — so the assertion says what it always meant: no collection's create verb is restated
  // here. `New tag` / `New script` / `New book` is the door array's whole create vocabulary.)
  await expect(welcome.getByRole("button", { name: ANY_CREATE_VERB })).toHaveCount(0);
  await expect(launcher(workspace, "tags").getByText(String(TAG_COUNT))).toHaveCount(0);
  // …and the teaching sentence the pane exists for stays, on every card.
  await expect(welcome.getByRole("heading", { name: "The parts every chat is built from" })).toBeVisible();
  await expect(welcome.getByText("Colour-coded labels for characters, chats, books, personas and presets.")).toBeVisible();
  await expect(welcome.getByText("Keyword-triggered lore your characters draw on — a book fires where you attach it.")).toBeVisible();
});

// …AND IT IS STILL A CONTROL (side-eye 2026-08-08 P1, the C7 re-check). Shedding the count + create left a
// populated card with NO affordance at all — no click target, no keyboard stop, and 62% of its empty
// sibling's height — so the pane's three cards read as failed-to-load chrome. The card is the LAUNCHER its
// own name claims: clicking it takes the reader to that library in the LIST, through the same
// `goToCollection` intent every other cross-surface "manage it over there" door fires.
//
// The card's accessible NAME is its own content (label + blurb) — the blurb is what the roster band does not
// carry, so naming the control by it keeps the one thing this pane adds readable to a screen reader.
test("a POPULATED launcher card is a real control — clicking it opens that collection's group in the LIST", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await bandCount(workspace, "tags", TAG_COUNT);

  const roster = workspace.locator(ROSTER);
  const band = roster.getByRole("button", { name: TAGS_BAND });
  await expect(band).toHaveAttribute("aria-expanded", "false");

  const card = workspace.locator(WELCOME).getByRole("button", { name: TAGS_LAUNCHER });
  await expect(card).toBeVisible();
  // A launcher a thumb cannot land on is not a launcher: the card clears the touch floor by a wide margin
  // (it is a three-line island), and the assertion guards the day someone trims it to a strip.
  const box = await card.boundingBox();
  if (box === null) {
    throw new Error("the populated launcher card did not render a box");
  }
  expect(box.height, "the launcher clears the coarse touch floor").toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);

  await card.click();
  await expect(band).toHaveAttribute("aria-expanded", "true");
  await expect(workspace.getByText(FIRST_ROW)).toBeVisible();
});

// …AND IT SAYS SO AT REST (side-eye 2026-08-08 P2). Hover, focus ring and keyboard operability all require
// the pointer or the keyboard to have ALREADY arrived; at rest the one operable card was pixel-identical to
// its two inert siblings, so a sighted scan had no way to learn which one was a door. The pin is the
// DIFFERENCE — a glyph the populated card renders and the inert ones do not — because "give it an
// affordance" is only satisfied by something the siblings lack.
test("a POPULATED launcher card carries a resting affordance its inert siblings do not", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await bandCount(workspace, "tags", 0);
  await bandCount(workspace, "worldInfo", BOOKS.length);

  // One frame, both arms: `tags` is empty (inert card), `regex`/`worldInfo` are populated (launchers).
  const glyphCount = async (collectionId: string): Promise<number> => launcher(workspace, collectionId).locator("svg").count();
  const [inert, populated] = await Promise.all([glyphCount("tags"), glyphCount("worldInfo")]);
  expect(populated, "the launchable card draws a glyph the inert card does not").toBeGreaterThan(inert);
});

// …AND THE CARD GRID READS IN THE SAME COLUMN AS THE COPY ABOVE IT (side-eye 2026-08-08 P3). The grid had no
// width of its own inside a centered Stack, so its auto-fit tracks shrink-to-fit — measured 473px under a
// 595px paragraph, giving one block of teaching copy TWO left edges. The pin is the two boxes' left edges.
test("the launcher grid shares the welcome paragraph's column — one left edge, not two", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const welcome = workspace.locator(WELCOME);
  const paragraph = welcome.getByText("Tags label your library.", { exact: false });
  await expect(paragraph).toBeVisible();
  const [paragraphBox, cardBox] = await Promise.all([paragraph.boundingBox(), launcher(workspace, "tags").boundingBox()]);
  if (paragraphBox === null || cardBox === null) {
    throw new Error("the welcome paragraph or its first launcher card did not render a box");
  }
  expect(Math.abs(cardBox.x - paragraphBox.x), "the grid's first column starts on the paragraph's left edge").toBeLessThanOrEqual(1);
});

// …AND IT IS REACHABLE WITHOUT A POINTER (same finding). The card was a plain `<div>`: no tab stop, no
// Enter/Space, no focus ring — the launcher pane was keyboard-dead in full. The pin is the rendered
// affordance (focus lands, Enter operates), not the attribute that produces it.
test("the populated launcher card takes keyboard focus and operates on Enter", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();
  await bandCount(workspace, "worldInfo", BOOKS.length);

  const band = workspace.locator(ROSTER).getByRole("button", { name: WORLD_INFO_BAND });
  await expect(band).toHaveAttribute("aria-expanded", "false");

  const card = workspace.locator(WELCOME).getByRole("button", { name: WORLD_INFO_LAUNCHER });
  await card.focus();
  await expect(card).toBeFocused();
  await card.press("Enter");
  await expect(band).toHaveAttribute("aria-expanded", "true");
});

// THE EMPTY STATE IS UNTOUCHED (the 2026-08-03 "genuinely good teaching state" verdict, which was the
// COLD-FIRST-TIMER test): at zero the card's count + create ARE the onboarding next step, and the roster
// band is not a duplicate of them so much as the same first step said where the user is looking. The tags
// collection is empty here while its two siblings are populated — one frame carrying both arms, so the
// populated shed cannot be a blanket removal.
test("an EMPTY collection's launcher keeps its count and create verb — the first-run teacher", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await bandCount(workspace, "tags", 0);
  await bandCount(workspace, "regex", SCRIPTS.length);

  const tags = launcher(workspace, "tags");
  await expect(tags.getByText("0")).toBeVisible();
  await expect(tags.getByRole("button", { name: "New tag" })).toBeVisible();
  // The control, in the same frame: the populated siblings shed theirs. (`getByRole` searches DESCENDANTS,
  // so a populated card being a button ITSELF does not satisfy this — it still asserts an empty card body.)
  await expect(launcher(workspace, "regex").getByRole("button")).toHaveCount(0);
  await expect(launcher(workspace, "worldInfo").getByRole("button")).toHaveCount(0);
  // …and the EMPTY card is not a launcher: its create button is the affordance, and an interactive card
  // wrapping a button is the nested-interactive shape the band's own header rules out.
  await expect(tags).not.toHaveAttribute("role", "button");
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

  const roster = workspace.locator(ROSTER);
  await expect(roster.getByRole("button", { name: "Import a world-info book" })).toBeVisible();
  await expect(roster.getByRole("button", { name: "Import a regex script" })).toBeVisible();
  await expect(roster.getByRole("button", { name: ANY_IMPORT_TRIGGER })).toHaveCount(2);
});

// The BULK-SELECT toggle is the same DATA-declared band grammar (REGX2). Only regex declares one today, and
// the assertion is that the band draws it for exactly that collection — a toggle on a library with no bulk
// verbs behind it would be a control that does nothing.
test("the group band draws the BULK toggle only for a collection that declares one", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const roster = workspace.locator(ROSTER);
  const toggle = roster.getByRole("button", { name: "Select scripts" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(roster.getByRole("button", { name: ANY_BULK_TOGGLE })).toHaveCount(1);
});

test("selecting a member routes CONTENT to its owner's editor and CONTEXT to its owner's arm", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  // A TAG: its editor mounts in CONTENT, and its collection declares NO context arm — so the pane shows
  // that collection's OWN copy, not a generic "nothing selected" over a selected thing.
  await workspace.locator(ROSTER).getByRole("button", { name: TAGS_BAND }).click();
  await workspace.getByText(FIRST_ROW).click();
  await expect(workspace.getByRole("heading", { name: FIRST_ROW })).toBeVisible();
  await expect(workspace.getByText("Nothing to attach")).toBeVisible();

  // A SCRIPT: the same host, a different owner's editor and a real context body.
  await workspace.locator(ROSTER).getByRole("button", { name: REGEX_BAND }).click();
  await workspace.getByText("strip ooc").click();
  await expect(workspace.getByRole("textbox", { name: "Name" })).toBeVisible();
  await expect(workspace.getByText("Runs in every chat")).toBeVisible();

  // A BOOK (R2): the book editor mounts in CONTENT and the activation panel fills CONTEXT — the surfaces the
  // retired rail section owned, framed by the same host as its two siblings.
  await workspace.locator(ROSTER).getByRole("button", { name: WORLD_INFO_BAND }).click();
  await workspace.getByText("42 entries · attached ×3").click();
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

  await workspace.locator(ROSTER).getByRole("button", { name: WORLD_INFO_BAND }).click();
  await workspace.getByText("42 entries · attached ×3").click();
  // Barrier on the SETTLED editor — the heading only exists once the book read has landed.
  const heading = workspace.getByRole("heading", { name: "The Ninefold Reach" });
  await expect(heading).toBeVisible();

  const content = workspace.locator(CONTENT);
  const inset = await resolvedSectionPx(content);
  expect(inset).toBeGreaterThan(0);
  await expect
    .poll(() =>
      content.evaluate((el: HTMLElement) => {
        const style = getComputedStyle(el);
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
      }),
    )
    .toEqual([`${inset}px`, `${inset}px`, `${inset}px`, `${inset}px`]);

  // …and the editor's own content actually STARTS inside it — the region's origin is no longer the
  // heading's origin (the report's `heading box → x=363, y=48` against `region origin x=363, y=48`).
  const regionBox = await content.boundingBox();
  const headingBox = await heading.boundingBox();
  if (regionBox === null || headingBox === null) {
    throw new Error("the content region or its editor heading did not render a box");
  }
  expect(headingBox.x, "the editor heading clears the region's left edge").toBeGreaterThanOrEqual(regionBox.x + inset);
  expect(headingBox.y, "the editor heading clears the region's top edge").toBeGreaterThanOrEqual(regionBox.y + inset);
});

test("the editor's PRIMARY action no longer touches the pane boundary", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  await workspace.locator(ROSTER).getByRole("button", { name: WORLD_INFO_BAND }).click();
  await workspace.getByText("42 entries · attached ×3").click();
  // `[data-cta]` — the editor's HEADER primary, the one whose right edge the report measured ON the pane
  // boundary. (The empty-list state offers a second "New entry"; that one is not the trailing-edge case.)
  const primary = workspace.locator(CONTENT).getByRole("button", { name: NEW_ENTRY }).and(workspace.locator("[data-cta]"));
  await expect(primary).toBeVisible();

  const content = workspace.locator(CONTENT);
  const inset = await resolvedSectionPx(content);
  const regionBox = await content.boundingBox();
  const primaryBox = await primary.boundingBox();
  if (regionBox === null || primaryBox === null) {
    throw new Error("the content region or its primary did not render a box");
  }
  // The reported state was `content.right === "New entry".right`. A full token of clearance now.
  expect(primaryBox.x + primaryBox.width, "the primary's right edge clears the pane boundary").toBeLessThanOrEqual(regionBox.x + regionBox.width - inset);
});

// The welcome carried its OWN `p-block` — the reason the missing editor inset read as deliberate rather
// than as a hole. With the region padding it would double, so it was dropped; this pins that it did not
// come back (the welcome and an editor must start at the SAME x).
test("the welcome does not double the region's inset", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const welcome = workspace.locator(WELCOME);
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

  await workspace.locator(ROSTER).getByRole("button", { name: "New tag" }).click();
  await expect.poll(() => trpc.lastInput("tag.createTag"), { intervals: [20, 50, 100] }).toEqual({ input: { name: "New tag" } });
});

test("a zero-member group keeps its band and says so — with exactly ONE create verb in the roster", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const roster = workspace.locator(ROSTER);
  await expect(roster.getByText("No tags yet.")).toBeVisible();
  // ONE, not two (side-eye 2026-08-08 P2). The empty slot used to repeat the band's verb — and with the
  // Configuration launcher card carrying a third copy, "New tag" rendered three times on one screen. The
  // band's `+` is the roster's standing create affordance at every count, so it is the one that stays here;
  // the launcher card keeps the other (the owner's C7 arm-2 onboarding ruling). The COUNT is the assertion —
  // a re-added inline verb reds this immediately.
  await expect(roster.getByRole("button", { name: "New tag" })).toHaveCount(1);
  // …and the ZERO group's band offers NO disclosure (side-eye 2026-08-06 P2): the chevron used to open a
  // panel onto nothing, one row above the card that had already said the library was empty. Scoped to the
  // tags group — its populated siblings in this story keep their own toggles, which is the control.
  await expect(roster.locator('[data-collection="tags"]').getByRole("button", { expanded: false })).toHaveCount(0);
  await expect(roster.locator('[data-collection="tags"]').getByRole("button", { expanded: true })).toHaveCount(0);
  await expect(roster.getByRole("button", { expanded: false })).toHaveCount(2);
});

// …AND ITS BAND STILL LINES UP WITH ITS SIBLINGS (side-eye 2026-08-08 P3). Standing the disclosure down also
// dropped the chevron's 16px box and the 4px joint, so a zero-member band's glyph started 20px left of every
// populated sibling's and the roster's left edge became data-dependent. The pin is the rendered X of the
// COLLECTION GLYPH in each band — the empty group's against a populated sibling's — because a reserved gutter
// is a geometric fact and an `invisible` class is not. `svg` index 1 in both bands: 0 is the chevron (real on
// a populated band, `invisible` on the empty one), 1 is the collection's own glyph.
test("a zero-member band RESERVES the disclosure gutter — its glyph aligns with its populated siblings'", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const roster = workspace.locator(ROSTER);
  const glyphOf = (collection: string): Locator => roster.locator(`[data-collection="${collection}"] [data-slot="collection-band"] svg`).nth(1);
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

  const band = workspace.locator(ROSTER).locator('[data-collection="tags"] [data-slot="collection-band"]');
  await expect(band.getByText("0", { exact: true })).toBeVisible();
});

// …AND IT IS A CARD, NOT A ROW (side-eye 2026-08-08). The copy and the (then-present) create verb sat
// side-by-side on one line inside the dashed box, which at the roster's real width read as a broken table row
// rather than as the house empty-state grammar. RETARGETED 2026-08-08 P2: the verb left the slot entirely
// (one action, one home — see the count assertion above), so the two sibling boxes it used to measure no
// longer exist. What survives is the same CLAIM about the slot — a centered CARD, not a row — pinned on the
// copy's box against its dashed frame: centered inside it, and given its own block band rather than sharing a
// line. Both are rendered facts; a class list is not.
//
// This is deliberately NOT a deletion. The old assertion's subject was the affordance; the finding removed the
// affordance, and a removed affordance whose geometry pin is simply deleted leaves the slot with NO shape
// guard at all — which is how the "broken table row" shipped the first time.
test("the zero-member slot is a centered CARD — its copy sits on its own centered band inside the frame", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const group = workspace.locator(ROSTER).locator('[data-collection="tags"]');
  const copy = group.getByText("No tags yet.");
  await expect(copy).toBeVisible();
  const frame = group.locator('[data-slot="collection-group-empty"]');
  const [copyBox, frameBox] = await Promise.all([copy.boundingBox(), frame.boundingBox()]);
  if (copyBox === null || frameBox === null) {
    throw new Error("the empty slot's copy or its frame did not render a box");
  }
  expect(Math.abs(copyBox.x + copyBox.width / 2 - (frameBox.x + frameBox.width / 2)), "the copy is centered in its frame").toBeLessThanOrEqual(1);
  // Its own band: the copy does not share a line with anything — nothing else in the frame overlaps its rows.
  expect(copyBox.height, "the copy has a real line box").toBeGreaterThan(0);
  expect(frameBox.height, "the frame is taller than its copy (the card's own padding)").toBeGreaterThan(copyBox.height);
});

// The band's KICKER at the pane it actually lives in (side-eye 2026-08-06 P3). "REGEX SCRIPTS" is the
// longest label the door array carries, and at the docked pane's real 307px content width it lost its last
// two pixels to the ellipsis — a truncated group name in a roster whose entire job is naming the groups.
// The assertion is the SPAN'S BOX (scrollWidth vs clientWidth), not a screenshot: `truncate` is silent, so
// the only honest question is whether the text needed more room than it got.
test("the longest group kicker survives the docked pane's real width — no ellipsis on a group name", async ({ mount, page }) => {
  await stub(page);
  const roster = await mount(<ConfigRosterNarrowStory />);
  await roster.getByRole("button", { name: "reset groups" }).click();

  const kicker = roster.getByText("Regex scripts", { exact: true });
  await expect(kicker).toBeVisible();
  const overflow = await kicker.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBe(0);
});
