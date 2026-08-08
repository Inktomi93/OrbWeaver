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

test("a zero-member group keeps its band and says so, with its own create verb", async ({ mount, page }) => {
  await stub(page, []);
  const workspace = await mount(<ConfigWorkspaceStory />);
  await workspace.getByRole("button", { name: "reset groups" }).click();

  const roster = workspace.locator(ROSTER);
  await expect(roster.getByText("No tags yet.")).toBeVisible();
  // The empty slot repeats the collection's OWN create verb as the inline next step, BESIDE the band's `+`
  // (two affordances, one verb, both in the roster — the drawn design, `empty-states.html:191-193`).
  await expect(roster.getByRole("button", { name: "New tag" })).toHaveCount(2);
  // …and the ZERO group's band offers NO disclosure (side-eye 2026-08-06 P2): the chevron used to open a
  // panel onto nothing, one row above the card that had already said the library was empty. Scoped to the
  // tags group — its populated siblings in this story keep their own toggles, which is the control.
  await expect(roster.locator('[data-collection="tags"]').getByRole("button", { expanded: false })).toHaveCount(0);
  await expect(roster.locator('[data-collection="tags"]').getByRole("button", { expanded: true })).toHaveCount(0);
  await expect(roster.getByRole("button", { expanded: false })).toHaveCount(2);
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
