// CT: the Configuration WELCOME — variant C "The Hearth" (program #102, the owner pick of 2026-08-16).
//
// Every assertion here is a RENDERED fact — a box, a resolved custom property, a computed font size —
// because the four defects this rebuild answers were all invisible to a class list: a 595px column inside
// a 917px pane, a ramp that stopped at the title step, a 2-track grid with a permanent empty cell, and
// ~380px of void under the last card. An authored-string test would have stayed green through all four.
//
// THE CORPUS IS THE VARIABLE. The whole point of the shape is that hero-vs-rail is decided by what you
// have BUILT, so the stubs drive three states through ONE story: the real dev corpus (one built library,
// two not), an all-built corpus, and the cold first run where nothing is built at all. Empty states are
// load-bearing here, not an afterthought.
//
// NO CLOCK, DELIBERATELY: nothing on this surface renders a relative time, so there is no wall-clock read
// to freeze. The counts are the fixtures' own array lengths.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ConfigWelcomeStory } from "../_ct-stories.tsx";

const WELCOME = '[data-slot="config-welcome"]';
const CONTENT = '[data-slot="config-content"]';
/** The hero's accessible name is its own CONTENT, and the blurb is the half the roster band does not
 *  carry — so the blurb is how the door is addressed, the roster CT's own convention. */
const TAGS_LAUNCHER = /Color-coded labels/;
/** Every collection's create verb as one pattern — `New tag` / `New script` / `New book` is the door
 *  array's whole create vocabulary, so a count over this pattern is a total claim. */
const ANY_CREATE_VERB = /^New /;
/** The BUILT column's own marker — a second attribute beside `data-collection`, so the column's `:has()`
 *  test and the card's identity can never be confused for one another. */
const BUILT = "[data-config-built]";
const UNBUILT = "[data-config-unbuilt]";

/** The measured production pane the story mounts at (`_ct-stories.tsx`'s `CONTENT_PANE_PX`). Restated as
 *  the assertion's own expectation rather than imported — a `_ct-stories` module may export only
 *  components, and a width the test does not state is a width the test cannot hold anyone to. */
const PANE_PX = 917;

/** The pre-rebuild welcome rendered in `mx-auto max-w-prose` — 595px of a 917px pane, 65%. The rebuilt
 *  surface has no centre cap at all, so its own box is the pane minus the region's two insets. Stated as a
 *  FLOOR well above the old width: the exact number tracks the `--spacing-section` token. */
const OLD_CAPPED_WIDTH_PX = 595;

function tagRow(index: number, usage: number): Record<string, unknown> {
  return {
    id: `tag_${String(index).padStart(3, "0")}`,
    name: `tag-${String(index).padStart(3, "0")}`,
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: index,
    isHiddenOnCard: false,
    usage: { characters: usage, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: usage },
  };
}

/** 28 tags, the dev corpus the mockups were drawn against — and a DESCENDING usage spread, so "most used"
 *  is a claim the ranking can actually be wrong about (a flat spread would pass on insertion order).
 *
 *  NO PER-TAG USAGE MAY EQUAL THE LIBRARY TOTAL. The trim assertion below is "the hero does not restate
 *  the band's 28", and a first tag whose own usage was also 28 made that test fail against a CORRECT
 *  surface — the fixture, not the code, was printing the forbidden number. Capping the spread one below
 *  the total keeps the assertion about the thing it names. */
const TAG_COUNT = 28;
const TAGS = Array.from({ length: TAG_COUNT }, (_unused, index) => tagRow(index, Math.max(1, TAG_COUNT - index - 1)));

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
    updatedAt: 1_760_000_000_000,
    substituteRegex: "none",
  },
];

const BOOKS = [
  {
    id: "world_book_reach000001",
    name: "The Ninefold Reach",
    description: null,
    createdAt: 1,
    entryCount: 42,
    usage: { characters: 2, personas: 0, chats: 0, global: true, total: 3 },
  },
];

interface Corpus {
  readonly tags?: readonly unknown[];
  readonly scripts?: readonly unknown[];
  readonly books?: readonly unknown[];
}

function stub(page: Page, corpus: Corpus): Promise<unknown> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => corpus.tags ?? [],
    "tag.createTag": () => tagRow(TAG_COUNT, 0),
    "regex.listScripts": () => corpus.scripts ?? [],
    "regex.listGlobal": () => [],
    "regex.listScriptUsage": () => ({ presets: [], characters: [], rooms: [] }),
    "regex.createScript": () => SCRIPTS[0],
    "worldInfo.listBooksWithUsage": () => corpus.books ?? [],
    "worldInfo.listGlobal": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
  });
}

/** SETTLE BARRIER. Every arm below is a verdict on a COUNT, and until the counts land every collection
 *  reads as not-built — the in-flight state, where the rail legitimately holds all three. So each test
 *  waits for the rendered partition it is about to measure, never for a request count. */
async function settled(pane: Locator, built: number, unbuilt: number): Promise<void> {
  await expect(pane.locator(BUILT)).toHaveCount(built);
  await expect(pane.locator(UNBUILT)).toHaveCount(unbuilt);
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await locator.boundingBox();
  if (found === null) {
    throw new Error("expected a rendered box");
  }
  return found;
}

/** A custom property as THIS document resolves it — so every geometry assertion tracks a token retune
 *  instead of freezing today's pixels. */
function resolvedPx(scope: Locator, token: string): Promise<number> {
  return scope.evaluate((el: HTMLElement, name: string): number => {
    const probe = document.createElement("div");
    probe.style.width = `var(${name})`;
    el.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, token);
}

// ── THE WIDTH ───────────────────────────────────────────────────────────────────────────────────────
// Measured before: the welcome rendered in a 595px `mx-auto max-w-prose` column inside a 917px pane —
// ~160px of dead void down each side, 65% of the pane used. The cap is gone; the MEASURE moved onto the
// paragraph, which is where a measure belongs.
test("the welcome FILLS the content pane — no centred column", async ({ mount, page }) => {
  await stub(page, { tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 1, 2);

  const inset = await resolvedPx(pane.locator(CONTENT), "--spacing-section");
  expect(inset).toBeGreaterThan(0);
  const welcome = await box(pane.locator(WELCOME));
  expect(welcome.width, "the welcome spans the pane minus the region's own two insets").toBeCloseTo(PANE_PX - inset * 2, 0);
  expect(welcome.width, "and it is nowhere near the old max-w-prose cap").toBeGreaterThan(OLD_CAPPED_WIDTH_PX);

  // …and the teaching line is capped on the PARAGRAPH, not on the page — the whole distinction the old
  // `mx-auto max-w-prose` collapsed by capping the SURFACE instead. Pinned against the RESOLVED token, not
  // merely "narrower than its parent": a line that is narrower by accident would pass the weaker claim,
  // and the measure is the thing under test.
  //
  // (`--reading-measure` is declared in @orb/ui's theme.css, which the CT harness has always loaded, so
  // this assertion reads the same before and after #114 — that commit restored the CLIENT tier's cap on
  // the transcript's `message-content-column`, a rule this surface does not use.)
  // PROBED IN THE PARAGRAPH'S OWN FONT CONTEXT, which is load-bearing: `--reading-measure` is `75ch`, and
  // `ch` resolves against the ELEMENT's font. Probing it on the content region (16px) instead of on the
  // capped line (the 15px reading step) reads 686.39px against a correct 643.5px render — a 16/15 ratio
  // exactly, i.e. the instrument disagreeing with itself, not a defect.
  const line = pane.getByText("Tags label your library.", { exact: false });
  const paragraph = await box(line);
  const measure = await resolvedPx(line, "--reading-measure");
  expect(measure, "the reading measure resolves in this document").toBeGreaterThan(0);
  expect(paragraph.width, "the teaching line is capped at the reading measure").toBeCloseTo(measure, 0);
  expect(measure, "…and the measure caps the LINE, leaving the surface wider").toBeLessThan(welcome.width);
});

// ── THE RAMP ────────────────────────────────────────────────────────────────────────────────────────
// Measured before: the surface topped out at the `Heading level={2}` title step (16px). `--text-display`
// (24px) and `--text-headline` (20px) existed in tokens.json and appeared NOWHERE here. The rebuild
// spends all six steps, one per role.
test("the surface renders the full six-step ramp, display step included", async ({ mount, page }) => {
  await stub(page, { tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 1, 2);

  const display = await resolvedPx(pane.locator(CONTENT), "--text-display");
  const headline = await resolvedPx(pane.locator(CONTENT), "--text-headline");
  const title = await resolvedPx(pane.locator(CONTENT), "--text-title");

  const fontPx = (locator: Locator): Promise<number> => locator.evaluate((el: HTMLElement) => Number.parseFloat(getComputedStyle(el).fontSize));

  // The MASTHEAD is the display step — the surface's one opening statement, and still a real heading.
  const masthead = pane.getByRole("heading", { name: "The parts every chat is built from" });
  await expect(masthead).toBeVisible();
  expect(await fontPx(masthead), "the masthead rides --text-display").toBeCloseTo(display, 1);

  // The BUILT library's name is the headline step — the one item this surface promotes.
  expect(await fontPx(pane.locator(BUILT).getByText("Tags", { exact: true })), "the built library's name rides --text-headline").toBeCloseTo(headline, 1);

  // A NOT-BUILT library's name is the title step below it.
  expect(await fontPx(pane.getByRole("heading", { name: "Regex scripts" })), "a not-built library's name rides --text-title").toBeCloseTo(title, 1);

  // Six DISTINCT rendered sizes across the surface — the spread the ramp exists to produce (before: 3).
  const sizes = await pane.locator(WELCOME).evaluate((root: HTMLElement) => {
    const seen = new Set<string>();
    for (const node of root.querySelectorAll("*")) {
      if ((node.textContent ?? "").trim().length > 0) {
        seen.add(getComputedStyle(node).fontSize);
      }
    }
    return [...seen];
  });
  expect(sizes.length, `the rendered ramp is ${String(sizes.length)} steps: ${sizes.join(" ")}`).toBeGreaterThanOrEqual(6);
});

// ── THE SHAPE (#99's grid hole) ─────────────────────────────────────────────────────────────────────
// The hole was the symptom of forcing THREE collections into ONE even grid, so the fix is to stop
// treating them as three equals — not to re-tune a track count. The library you built leads; the two you
// have not sit in the rail beside it. There is no even grid left to have a hole in.
test("the built library LEADS and the not-built ones sit in the rail beside it", async ({ mount, page }) => {
  await stub(page, { tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 1, 2);

  const welcome = await box(pane.locator(WELCOME));
  const hero = await box(pane.locator(BUILT));
  const [regex, world] = await Promise.all([box(pane.locator('[data-config-unbuilt="regex"]')), box(pane.locator('[data-config-unbuilt="worldInfo"]'))]);

  // The lead column starts on the surface's own left edge — one left edge for the copy and the hero.
  expect(Math.abs(hero.x - welcome.x), "the hero starts on the masthead's left edge").toBeLessThanOrEqual(1);
  // SIDE BY SIDE, not stacked: the rail begins after the hero ends. This is the split, and it is the
  // assertion that fails the instant the container step stops engaging at the real pane width.
  expect(regex.x, "the rail sits beside the hero, not under it").toBeGreaterThan(hero.x + hero.width);
  // The hero is the DOMINANT track (`lead` is 1.55fr/1fr, deliberately unequal).
  expect(hero.width, "the built library takes the wide track").toBeGreaterThan(regex.width);
  // The two not-built libraries share the rail's column and stack — the mock's 1280px drawing exactly.
  expect(Math.abs(regex.x - world.x), "the rail's slots share one column").toBeLessThanOrEqual(1);
  expect(world.y, "and they stack inside it").toBeGreaterThan(regex.y);
  // NO HOLE AT ANY WIDTH: every collection is rendered exactly once, in one of the two columns.
  await expect(pane.locator("[data-collection]")).toHaveCount(3);
});

// ── THE PROMOTION IS PAID FOR ───────────────────────────────────────────────────────────────────────
// The 2026-08-08 trim ruling drops the count and the create verb from a POPULATED launcher because the
// roster band already carries both. That leaves promoting one to hero weight needing a reason, and the
// reason is content: `usePreview` shows what is actually IN the library, which the collapsed band does
// not carry. This test is the pair of claims at once — the wall is there, and the trim still holds.
test("the hero shows the library's real contents and still sheds the count + create verb", async ({ mount, page }) => {
  await stub(page, { tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 1, 2);

  const hero = pane.locator(BUILT);
  // MOST USED, ranked — the fixture's usage descends with the index, so the top chip is the first tag and
  // a wall in insertion order would pass only by accident. The wall is a top-N GLANCE, never the roster:
  // it is capped, and it says how much of the library it is not showing.
  await expect(hero.getByText("Most used")).toBeVisible();
  const chips = hero.locator('[data-slot="text"][data-voice="datum"]');
  const shown = await chips.count();
  expect(shown, "the wall is capped, not the whole library").toBeLessThan(TAG_COUNT);
  expect(shown, "…and it is a real glance, not one chip").toBeGreaterThan(1);
  await expect(hero.getByText(`+${String(TAG_COUNT - shown)} more`), "the remainder is derived from the count").toBeVisible();

  // THE TRIM (owner ruling 2026-08-08, C7 arm 2) — no count numeral, no create verb, on the populated arm.
  await expect(hero.getByText(String(TAG_COUNT), { exact: true }), "the hero does not restate the band's count").toHaveCount(0);
  await expect(hero.getByRole("button"), "and it contains no create verb (the island IS the control)").toHaveCount(0);
  await expect(pane.locator(WELCOME).getByRole("button", { name: "New tag" })).toHaveCount(0);
});

// ── THE COLD FIRST RUN ──────────────────────────────────────────────────────────────────────────────
// Empty states are load-bearing, and this one is the whole surface: a brand-new user has built nothing,
// so there is no hero to lead with. The rail must then take the PANE, not the 1fr track it would have had
// beside an absent lead column — otherwise the cold reader gets the exact squeezed-column defect this
// pass is deleting, on the one visit where the pane is nothing but invitations.
test("with NOTHING built the invitations take the whole pane — no empty lead track, no hole", async ({ mount, page }) => {
  await stub(page, {});
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 0, 3);

  const welcome = await box(pane.locator(WELCOME));
  const slots = await Promise.all(["tags", "regex", "worldInfo"].map(async (id) => box(pane.locator(`[data-config-unbuilt="${id}"]`))));
  const spanned = Math.max(...slots.map((slot) => slot.x + slot.width)) - Math.min(...slots.map((slot) => slot.x));
  expect(spanned, "the invitations span the surface instead of a leftover rail").toBeCloseTo(welcome.width, 0);

  // Each keeps its count(0) + create verb — the 2026-08-03 cold-first-timer verdict, untouched. The door
  // array's whole create vocabulary is `New tag` / `New script` / `New book`, so the pattern is total.
  await expect(pane.locator(WELCOME).getByRole("button", { name: ANY_CREATE_VERB })).toHaveCount(3);
  await expect(pane.locator(WELCOME).getByRole("button", { name: "New tag" })).toBeVisible();
  await expect(pane.locator(WELCOME).getByText("0", { exact: true })).toHaveCount(3);
});

// ── THE FULLY-BUILT CORPUS ──────────────────────────────────────────────────────────────────────────
// The other end of the same axis, and the CD3 test. When every library is built the rail has nothing to
// name, so the band must not render over nothing — and the surface must still promote exactly ONE island,
// or it has no focal at all.
test("with EVERYTHING built the rail's band disappears and exactly ONE island is focal", async ({ mount, page }) => {
  await stub(page, { tags: TAGS, scripts: SCRIPTS, books: BOOKS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 3, 0);

  // A band over an empty group is chrome that lies about what is under it. The claim is VISIBILITY, not
  // DOM count: the column stands itself down with `display: none` (which also drops it from the
  // accessibility tree), and `toHaveCount` would count a node no reader can reach.
  await expect(pane.getByText("Not built yet")).toBeHidden();

  // CD3: exactly one element carries the accent stripe at rest. Read off the PAINTED pseudo-element, not
  // a class list — `first:` is the whole verdict and a class assertion would survive the variant breaking.
  const striped = await pane
    .locator(BUILT)
    .evaluateAll((cards) => cards.filter((card) => Number.parseFloat(getComputedStyle(card, "::after").width) > 0).length);
  expect(striped, "one focal, no more and no fewer").toBe(1);

  // …and the three islands stack in the lead column rather than leaving the rail as void.
  const welcome = await box(pane.locator(WELCOME));
  const first = await box(pane.locator(BUILT).first());
  expect(first.width, "with no rail to hold, the lead column takes the pane").toBeCloseTo(welcome.width, 0);
});

// ── NOT PINNED HERE: THE FIRST PAINT (an honest gap, stated rather than faked) ───────────────────────
// A live `snap --isolated` drive against the real corpus reported an unexpected 0.073 CLS —
// `[data-slot=config-hearth]` moving 541px sideways — because a SETTLING count read as "not built", so
// the pane painted a rail-only one-column layout and then slid it half the pane when the tag count
// landed. `UnbuiltLibrary` now renders nothing while a declared count is still undefined, and the live
// re-drive shows the shift gone (that measurement is the fix's evidence).
//
// It has NO CT, and the reason is the harness, not the surface: holding a count in the `undefined` state
// needs a response held open, and `route-trpc.ts` invokes a responder SYNCHRONOUSLY — it never awaits one
// — so an async responder yields a malformed batch that fails every query rather than suspending it, and
// the surface under test never mounts. Racing a real response instead would be the passes-isolated /
// flakes-under-contention shape this repo bans. Giving `routeTrpc` a deferred-responder arm is a
// shared-harness change every CT suite depends on, so it is the orchestrator's call, not this lane's.

// ── THE DOOR ────────────────────────────────────────────────────────────────────────────────────────
// The island is the control (`Card interactive`), its accessible name is its own content, and it clears
// the coarse tap floor. Keyboard reachability is the half a pointer test cannot see.
test("the hero is an operable door, by pointer and by keyboard", async ({ mount, page }) => {
  await stub(page, { tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 1, 2);

  // Named by its own content — the blurb and the wall are what the roster band does NOT carry, so naming
  // the control by them keeps this pane's whole contribution readable to a screen reader.
  const hero = pane.getByRole("button", { name: TAGS_LAUNCHER });
  await expect(hero).toBeVisible();
  const heroBox = await box(hero);
  expect(heroBox.height, "a door a thumb cannot land on is not a door").toBeGreaterThanOrEqual(44);

  await hero.focus();
  await expect(hero).toBeFocused();
});
