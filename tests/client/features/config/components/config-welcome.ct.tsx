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
import type { TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { ConfigWelcomeStory } from "../_ct-stories.tsx";

const WELCOME = '[data-slot="config-welcome"]';
const CONTENT = '[data-slot="config-content"]';
/** THE HERO'S DOOR, as of the 2026-08-19 fork (see the `BuiltLibrary` header): the island is a named
 *  REGION and the door is a real button, so the control is addressed by the verb it performs — not, as it
 *  was until this pass, by a ~45-word recitation of the card's whole content. */
const TAGS_LAUNCHER = "Open Tags →";
/** An accessible name a screen-reader user can act on without listening to the library first. The measured
 *  defect was ~45 WORDS; this ceiling is stated in characters so it also fails a name that grows back by
 *  absorbing the blurb. */
const MAX_CONTROL_NAME_CHARS = 30;
/** The coarse-pointer tap floor (WCAG 2.5.5 / the house `size-control-md` coarse step). */
const TOUCH_FLOOR_PX = 44;
/** `--shadow-glow`'s own ring alpha (`packages/ui/src/styles/theme.css`) — the multiplier that turns the
 *  focal pseudo's opacity into how much accent actually paints. */
const SHADOW_GLOW_RING_ALPHA = 0.4;
/** How much accent a SIBLING island's border carries once `enableThemeColorization` retints
 *  `--color-border` (`packages/client/src/styles/globals.css`: `color-mix(… primary 22% …)`). */
const COLORIZED_BORDER_ACCENT_SHARE = 0.22;
/** Every collection's create verb as one pattern — `New tag` / `New script` / `New book` is the door
 *  array's whole create vocabulary, so a count over this pattern is a total claim. */
const ANY_CREATE_VERB = /^New /;
/** The wall's derived remainder chip, whatever number it lands on. */
const ANY_REMAINDER = /^\+\d+ more$/;
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

/** TWO LIBRARY MEMBERS WITH THE SAME NAME — the owner's corpus has two books called "Shitty stories", and
 *  the wall keyed its chips on `entry.label` (side-eye 2026-08-19 P1-1: the only console error on the
 *  surface, on every visit). A name is not an identity; a chip wall built on one is a wall React is free to
 *  drop or duplicate rows of, and the `+N more` count is derived from `shown.length`, so a dropped chip
 *  makes the remainder LIE about how much of the library is hidden. */
const DUPLICATE_NAME = "tag-000";
const SAME_NAME_TAGS = [{ ...tagRow(0, 9), id: "tag_dupe_a", name: DUPLICATE_NAME }, { ...tagRow(1, 8), id: "tag_dupe_b", name: DUPLICATE_NAME }, tagRow(2, 7)];

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

/** A regex library authored in ONE SITTING — every row carries the same edit stamp, which is the owner's
 *  real state and the one the recency ranking has nothing to say about (side-eye 2026-08-19 P2-2: twelve
 *  chips all reading "yesterday"). Three rows, because the claim is about a WALL: one chip has no repetition
 *  to be about. */
const SAME_STAMP_SCRIPTS = ["strip ooc", "Format dialogue quotes", "Trim narrator asides"].map((name, index) => ({
  ...SCRIPTS[0],
  id: `regex_script_samestamp${String(index)}`,
  name,
}));

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
  /** The FOURTH collection (casts joined the closed tuple, #866 S1 / F-1). Absent = an empty library, which
   *  is the honest default for every test below: the cast collection declares no `preview` yet, so a BUILT
   *  cast would be exactly the hollow shell the lead column's grammar forbids — it belongs in the rail until
   *  it can pay for a hero. */
  readonly casts?: readonly unknown[];
}

/** One saved cast in the `rosterPreset.list` wire shape (the cast-picker CT's fixture, un-branded). */
const CAST = {
  id: "roster_preset_ct_welcome",
  name: "Adventuring Cast",
  description: "",
  memberCount: 2,
  members: [
    { characterId: "character_ct_1", position: 0, talkativeness: null, disabled: false, name: "Ash", avatarHash: null },
    { characterId: "character_ct_2", position: 1, talkativeness: 0.8, disabled: false, name: "Brook", avatarHash: null },
  ],
  anchorPersonaId: null,
  hasGroupConfig: true,
  rules: [],
  createdAt: 1,
  updatedAt: 1,
};

/** The route table on its own, so the first-paint tests can swap ONE procedure for a `trpcHold()` without
 *  re-spelling the other nine. */
function stubRoutes(corpus: Corpus): TrpcRoutes {
  return {
    // The fourth collection (casts) + the viewer projection the LIST's `when` gate reads (#866 S1).
    "rosterPreset.list": () => corpus.casts ?? [],
    "sessions.me": { userId: "user_ct_welcome", handle: "ct_welcome", globalRole: "user" },
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
  };
}

function stub(page: Page, corpus: Corpus): Promise<unknown> {
  return routeTrpc(page, stubRoutes(corpus));
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
  await settled(pane, 1, 3);

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
  await settled(pane, 1, 3);

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
  await settled(pane, 1, 3);

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
  await expect(pane.locator("[data-collection]")).toHaveCount(4);
});

// ── THE PROMOTION IS PAID FOR ───────────────────────────────────────────────────────────────────────
// The 2026-08-08 trim ruling drops the count and the create verb from a POPULATED launcher because the
// roster band already carries both. That leaves promoting one to hero weight needing a reason, and the
// reason is content: `preview` shows what is actually IN the library, which the collapsed band does
// not carry. This test is the pair of claims at once — the wall is there, and the trim still holds.
test("the hero shows the library's real contents and still sheds the count + create verb", async ({ mount, page }) => {
  await stub(page, { tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 1, 3);

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
  await expect(pane.locator(WELCOME).getByRole("button", { name: "New tag" })).toHaveCount(0);
  // …and the ONE button it does carry is the door, not a verb the band already owns. (Until the 2026-08-19
  // fork this assertion read `toHaveCount(0)` — "the island IS the control"; that ruling is superseded and
  // its reasoning is preserved verbatim in the `BuiltLibrary` header.)
  await expect(hero.getByRole("button"), "the hero's only control is its door").toHaveCount(1);
  await expect(hero.getByRole("button", { name: TAGS_LAUNCHER })).toBeVisible();
});

// ── THE 45-WORD NAME (side-eye 2026-08-19 P3 · owner-ruled arm 3) ───────────────────────────────────
// Before: `Card interactive` made the whole island a button, so its accessible name was its entire content
// — icon, label, blurb, twelve chips with their counts, the "+N more", and the door line, ~45 words recited
// before the word "button". The content-as-name ruling that produced it was protecting the blurb and the
// census from being hidden by an `aria-label` verb; making them a LABEL hid them just as thoroughly, as
// unnavigable text. The island is now a named region and the door is the control.
test("the door is a short-named control and the census is CONTENT, not part of a label", async ({ mount, page }) => {
  await stub(page, { tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 1, 3);

  const door = pane.getByRole("button", { name: TAGS_LAUNCHER });
  // The name the assistive tech actually computes, not the source string.
  const name = await door.evaluate((el: HTMLElement) => el.textContent ?? "");
  expect(name.trim().length, `the control's accessible name is "${name.trim()}"`).toBeLessThan(MAX_CONTROL_NAME_CHARS);

  // The island is ADDRESSABLE (the ARIA sweep's map-dom-fallback finding) without swallowing its contents:
  // a named region's name does not replace its subtree the way a button's does.
  const island = pane.getByRole("region", { name: "Tags" });
  await expect(island).toBeVisible();
  // …and every part of the census is still reachable AS CONTENT inside it — the exposure the superseded
  // ruling wanted, now actually navigable.
  await expect(island.getByText("Most used")).toBeVisible();
  await expect(island.getByText("Color-coded labels", { exact: false })).toBeVisible();
  // The library's NAME is a real heading now that it is not inside a button (it could not be before).
  await expect(island.getByRole("heading", { name: "Tags", level: 3 })).toBeVisible();
});

// ── THE COLD FIRST RUN ──────────────────────────────────────────────────────────────────────────────
// Empty states are load-bearing, and this one is the whole surface: a brand-new user has built nothing,
// so there is no hero to lead with. The rail must then take the PANE, not the 1fr track it would have had
// beside an absent lead column — otherwise the cold reader gets the exact squeezed-column defect this
// pass is deleting, on the one visit where the pane is nothing but invitations.
test("with NOTHING built the invitations take the whole pane — no empty lead track, no hole", async ({ mount, page }) => {
  await stub(page, {});
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 0, 4);

  const welcome = await box(pane.locator(WELCOME));
  const slots = await Promise.all(["tags", "regex", "worldInfo", "rosterPreset"].map(async (id) => box(pane.locator(`[data-config-unbuilt="${id}"]`))));
  const spanned = Math.max(...slots.map((slot) => slot.x + slot.width)) - Math.min(...slots.map((slot) => slot.x));
  expect(spanned, "the invitations span the surface instead of a leftover rail").toBeCloseTo(welcome.width, 0);

  // Each keeps its count(0) + create verb — the 2026-08-03 cold-first-timer verdict, untouched. The door's
  // whole create vocabulary is `New tag` / `New script` / `New book` / `New cast`, so the pattern is total.
  await expect(pane.locator(WELCOME).getByRole("button", { name: ANY_CREATE_VERB })).toHaveCount(4);
  await expect(pane.locator(WELCOME).getByRole("button", { name: "New tag" })).toBeVisible();
  await expect(pane.locator(WELCOME).getByText("0", { exact: true })).toHaveCount(4);
});

// ── THE FULLY-BUILT CORPUS ──────────────────────────────────────────────────────────────────────────
// The other end of the same axis, and the CD3 test. When every library is built the rail has nothing to
// name, so the band must not render over nothing — and the surface must still promote exactly ONE island,
// or it has no focal at all.
test("with EVERYTHING built the rail's band disappears and exactly ONE island is focal", async ({ mount, page }) => {
  await stub(page, { tags: TAGS, scripts: SCRIPTS, books: BOOKS, casts: [CAST] });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 4, 0);

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

// ── CD3 UNDER COLORIZATION (side-eye 2026-08-19, "the single-focal collapses under maximal") ────────
// `appearance.enableThemeColorization` retints `--color-border` to 22% of the accent, so on the all-built
// arm every sibling island's border carries accent — while the focal's own halo painted at an effective
// 0.12 (`--shadow-glow`'s 0.4 ring × a 30% pseudo). The one element that is supposed to carry the accent
// carried the LEAST of it, and CD3 became arm-conditional. The claim is now unconditional, so the pin
// drives BOTH appearance arms and asserts they agree.
test("exactly one focal at rest, and its accent does not collapse under theme colorization", async ({ mount, page }) => {
  await stub(page, { books: BOOKS, scripts: SCRIPTS, tags: TAGS, casts: [CAST] });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 4, 0);

  // Read off the PAINTED pseudo-elements, per card — a class-list assertion would survive the variant
  // breaking, and `first:` is the whole CD3 verdict.
  const readFocal = (): Promise<{ glow: number[]; striped: number }> =>
    pane.locator(BUILT).evaluateAll((cards) => ({
      // `content: none` means the pseudo does not EXIST — and its computed `opacity` still reads the
      // inherited 1, which is exactly the false positive an opacity-only read produces on a card that
      // paints no halo at all. Existence first, then strength.
      glow: cards.map((card) => {
        const painted = getComputedStyle(card, "::before");
        return painted.content === "none" ? 0 : Number.parseFloat(painted.opacity);
      }),
      striped: cards.filter((card) => Number.parseFloat(getComputedStyle(card, "::after").width) > 0).length,
    }));

  const setArms = (colorized: boolean, shadows: boolean): Promise<void> =>
    page.evaluate(
      ({ colorized: on, shadows: withShadow }) => {
        // The TOTAL appearance state this test depends on, stated rather than assumed — CDP/attribute
        // emulation leaks between tests when only the deltas are written.
        document.documentElement.toggleAttribute("data-theme-colorization", on);
        document.documentElement.toggleAttribute("data-shadow", withShadow);
      },
      { colorized, shadows },
    );

  // The four appearance arms this treatment has to hold on: colorization × the elevation (shadow) arm.
  const arms = await Promise.all(
    [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ].map(async ([colorized, shadows]) => {
      await setArms(colorized === true, shadows === true);
      return { colorized, read: await readFocal(), shadows };
    }),
  );

  for (const { colorized, read, shadows } of arms) {
    expect(read.striped, `one focal, no more and no fewer (colorized=${String(colorized)} shadow=${String(shadows)})`).toBe(1);
    // 0.4 (the `--shadow-glow` ring's own alpha) × this opacity must clear the 0.22 of accent a colorized
    // sibling BORDER carries, or the focal is the weakest accent on its own grid.
    const focalGlow = read.glow[0] ?? 0;
    expect(focalGlow * SHADOW_GLOW_RING_ALPHA, "the focal's resting ring out-weighs a colorized sibling border").toBeGreaterThan(COLORIZED_BORDER_ACCENT_SHARE);
    // …and the other two islands carry NO halo at all, on every arm.
    const sibling = read.glow.slice(1).filter((opacity) => opacity > 0);
    expect(sibling, "only the focal has a halo").toHaveLength(0);
  }
});

// ── THE FIRST PAINT (pinned as of 2026-08-17 — this block used to state it as an honest gap) ─────────
// A live `snap --isolated` drive against the real corpus reported an unexpected 0.073 CLS —
// `[data-slot=config-hearth]` moving 541px sideways — because a SETTLING count read as "not built", so
// the pane painted a rail-only one-column layout and then slid it half the pane when the tag count
// landed. `UnbuiltLibrary` now renders nothing while a DECLARED count is still undefined.
//
// The gap this block described was the harness, not the surface: `route-trpc.ts` invoked every responder
// synchronously, so there was no way to hold a count in the `undefined` state, and racing a real response
// would have been the passes-isolated / flakes-under-contention shape this repo bans. `trpcHold()` closed
// it. The hold suspends the whole BATCH it lands in — which here is the truth, not a limitation: the
// three count queries mount in one tick and land in one HTTP response in production too, so a single hold
// reproduces the real first paint exactly.
//
// Both assertions below are barriers on SETTLED rendered states, never on a flash: "held" is stable until
// the test releases it, and "released" is the corpus partition the other tests already wait on.

test("a settling count paints NO slot — the in-flight arm is neither column (the 541px slide)", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, { ...stubRoutes({ tags: TAGS }), "tag.listTagsWithUsage": hold });
  const pane = await mount(<ConfigWelcomeStory />);
  await hold.requested;

  // The surface IS mounted and painted — the teaching frame does not wait on a count. Without this
  // barrier the zero-slot claim below would also pass on a blank page, which is the wrong reason.
  await expect(pane.getByRole("heading", { name: "The parts every chat is built from" })).toBeVisible();

  // THE DEFECT, in one number: pre-fix all three collections read as not-built while their counts were in
  // flight, so THREE invitations painted across the full pane and then reflowed into a 1.55fr/1ff split
  // when the counts landed. A settling count is not a verdict, so nothing paints.
  await expect(pane.locator("[data-collection]"), "a count in flight is not a verdict — no slot, in either column").toHaveCount(0);
  // …AND NEITHER DOES THE GRID (2026-08-19). Suppressing the SLOTS was only half of it: the track count is
  // a `:has()` verdict over what rendered, so one count landing a frame ahead of its siblings painted the
  // hero across the whole pane and then reflowed it into the lead track — the 0.0283 residue, root-caused
  // from the browser's own shift sources (843→482.75px on the hero's door row). The hearth now stands down
  // until no collection is still settling, so its first paint is its final geometry.
  await expect(pane.locator('[data-slot="config-hearth"]'), "the hearth does not paint a geometry it is about to change").toBeHidden();

  hold.release(TAGS);
  await settled(pane, 1, 3);
  // …and the geometry the reader FIRST sees is the settled one, because the slots that could have moved
  // were never rendered before it: the hero on the surface's left edge, the rail beside it.
  const welcome = await box(pane.locator(WELCOME));
  const hero = await box(pane.locator(BUILT));
  const rail = await box(pane.locator('[data-config-unbuilt="regex"]'));
  expect(Math.abs(hero.x - welcome.x)).toBeLessThanOrEqual(1);
  expect(rail.x, "the rail arrives beside the hero — it never occupied the pane first").toBeGreaterThan(hero.x + hero.width);
});

test("landing the counts shifts NOTHING — the browser's own layout-shift score across the release is zero", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, { ...stubRoutes({ tags: TAGS }), "tag.listTagsWithUsage": hold });
  const pane = await mount(<ConfigWelcomeStory />);
  await hold.requested;
  await expect(pane.getByRole("heading", { name: "The parts every chat is built from" })).toBeVisible();

  // Installed AFTER the held state has painted and WITHOUT `buffered`, so the score covers exactly one
  // transition: the counts landing. `hadRecentInput` entries are excluded exactly as CLS excludes them
  // (there is no input here — the filter is what keeps the number comparable to the snap drive's 0.073).
  //
  // A live OBSERVER, not `performance.getEntriesByType("layout-shift")`: the timeline query reads empty in
  // this browser, and the version of this test that used it PASSED against the deliberately-broken source
  // — a vacuous green. The running total lands on an attribute rather than a `globalThis` stash because
  // reading a stash back needs an `as unknown as` double cast, which `no-test-fabrication` refuses.
  const shiftAttr = "ctLayoutShift";
  await page.evaluate((attr: string) => {
    // The layout-shift entry fields are not in lib.dom — narrowed structurally, the same way
    // packages/client/src/lib/motion-stats.ts does it.
    interface LayoutShiftEntry extends PerformanceEntry {
      readonly value: number;
      readonly hadRecentInput: boolean;
    }
    let total = 0;
    document.documentElement.dataset[attr] = "0";
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShiftEntry[]) {
        total += entry.hadRecentInput ? 0 : entry.value;
      }
      document.documentElement.dataset[attr] = String(total);
    }).observe({ type: "layout-shift" });
  }, shiftAttr);

  hold.release(TAGS);
  await settled(pane, 1, 3);

  // A shift is only ever scored against content that was ALREADY on screen, so this is the direct
  // measurement of the reported defect: pre-fix the two rail invitations were on screen and moved half the
  // pane; now they arrive in place and there is nothing below the hearth for the new rows to push.
  const shift = await page.evaluate((attr: string) => Number(document.documentElement.dataset[attr] ?? "0"), shiftAttr);
  expect(shift, "the counts landing must not move a pixel of already-painted content").toBe(0);
});

// ── THE DOOR ────────────────────────────────────────────────────────────────────────────────────────
// The island is the control (`Card interactive`), its accessible name is its own content, and it clears
// the coarse tap floor. Keyboard reachability is the half a pointer test cannot see.
test("the hero is an operable door, by pointer and by keyboard", async ({ mount, page }) => {
  await stub(page, { tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 1, 3);

  const door = pane.getByRole("button", { name: TAGS_LAUNCHER });
  await expect(door).toBeVisible();
  // The island stays the whole pointer target (its `onClick` mirrors the door's), so the tap floor is
  // measured there — the door's own coarse floor rides `Button`'s `::after` touch-target pseudo, which a
  // bounding box structurally cannot see.
  const islandBox = await box(pane.locator(BUILT));
  expect(islandBox.height, "a door a thumb cannot land on is not a door").toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);

  await door.focus();
  await expect(door).toBeFocused();
});

// ── THE HOLLOW LAUNCHERS (side-eye 2026-08-19 P1-2) ─────────────────────────────────────────────────
// On the OWNER's corpus every collection has count>0, so all three land in the lead column — and only tags
// declared a preview, so the pane rendered one 198px census beside two 106px hollow shells. The lead
// column's whole grammar is "a hero has a preview"; it was true 1/3. This is the all-built arm, which is
// exactly the owner's state.
test("every hero in the lead column shows real contents — no hollow shells", async ({ mount, page }) => {
  await stub(page, { tags: TAGS, scripts: SCRIPTS, books: BOOKS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 3, 1);

  // EACH card carries a wall — asserted per collection, because a total count would pass on three walls in
  // one card. The kicker is the CONTRIBUTION's own word for its rank: a hardcoded host "Most used" over a
  // recency ranking and an attachment ranking would be two lies out of three.
  const previews = [
    ["tags", "Most used", "tag-000"],
    ["regex", "Recently edited", "strip ooc"],
    ["worldInfo", "Most attached", "The Ninefold Reach"],
  ] as const;
  await Promise.all(
    previews.flatMap(([id, kicker, chip]) => {
      const card = pane.locator(`[data-config-built="${id}"]`);
      return [
        expect(card.getByText(kicker, { exact: true }), `${id} names its own rank`).toBeVisible(),
        expect(card.getByText(chip, { exact: false }), `${id} shows a real member`).toBeVisible(),
        expect(card.locator('[data-slot="text"][data-voice="datum"]').first(), `${id}'s chip carries a datum`).toBeVisible(),
      ];
    }),
  );

  // THE MEASURED DEFECT, as geometry: the hollow shells were 106px against the census's 198px. The claim is
  // RELATIVE, never a frozen pixel — a preview-bearing card cannot be a bare name+blurb+door stub, and the
  // three cards no longer differ by ~2x.
  const heights = await pane.locator(BUILT).evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
  expect(heights.length).toBe(3);
  expect(Math.min(...heights), "no card is a hollow name+blurb+door shell").toBeGreaterThan(120);
  expect(Math.max(...heights) / Math.min(...heights), "the lead column is not one hero and two stubs").toBeLessThan(2);
});

// ── THE BLURB'S MEASURE (side-eye 2026-08-19 P3) ────────────────────────────────────────────────────
// The masthead was capped on the paragraph and the launcher blurbs were not — 161ch latent. A measure
// belongs to the line, and this pane's lead column grows with the window.
test("every launcher blurb is capped at the reading measure, like the masthead", async ({ mount, page }) => {
  await stub(page, { tags: TAGS, scripts: SCRIPTS, books: BOOKS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 3, 1);

  const measured = await Promise.all(
    (["tags", "regex", "worldInfo"] as const).map(async (id) => {
      const blurb = pane.locator(`[data-config-built="${id}"]`).locator('[data-slot="text"][data-voice="gloss"]').first();
      // Probed IN THE BLURB'S OWN FONT CONTEXT — `--reading-measure` is a `ch` value and `ch` resolves
      // against the ELEMENT's font, so probing it on the pane reads a different number for the same rule.
      const [measure, drawn] = await Promise.all([resolvedPx(blurb, "--reading-measure"), box(blurb)]);
      return { drawn, id, measure };
    }),
  );
  for (const { drawn, id, measure } of measured) {
    expect(measure, "the reading measure resolves in this document").toBeGreaterThan(0);
    expect(drawn.width, `${id}'s blurb is capped, not pane-wide`).toBeLessThanOrEqual(measure + 1);
  }
});

// ── THE BLURB'S STEP (side-eye 2026-08-19 P3) ───────────────────────────────────────────────────────
// The island blurbs are the surface's TEACHING sentences — what a library is for, read by someone who has
// not built it yet — and they were set at the `gloss` voice's own 10.5px micro step, the footnote step.
// `prose` is the house statement for exactly this ("this text is sentences, not a label"): it lifts the
// step and relaxes the leading and changes nothing else, so a blurb is still unmistakably the gloss voice.
test("the island blurbs are read at the prose step, not the 10.5px footnote step", async ({ mount, page }) => {
  await stub(page, { books: BOOKS, scripts: SCRIPTS, tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 3, 1);

  const micro = await resolvedPx(pane.locator(CONTENT), "--text-micro");
  const label = await resolvedPx(pane.locator(CONTENT), "--text-label");
  expect(label, "the two steps are distinct in this document").toBeGreaterThan(micro);

  const blurbs = pane.locator(WELCOME).locator('[data-slot="text"][data-voice="gloss"]');
  const sizes = await blurbs.evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
  // Three heroes + the cast library's rail invitation (empty in this fixture) — every island teaches.
  expect(sizes.length, "every island — the three heroes and the cast invitation — carries a blurb").toBe(4);
  for (const size of sizes) {
    expect(size, `a teaching sentence renders at ${String(size)}px`).toBeCloseTo(label, 1);
  }
});

// ── A NAME IS NOT AN IDENTITY (side-eye 2026-08-19 P1-1) ────────────────────────────────────────────
// The wall keyed its chips on `entry.label`. The owner's corpus has two books named the same thing, so
// every visit logged React's duplicate-key error — the only console error on the surface — and left the
// wall's membership up to reconciliation, while `+N more` kept counting `shown.length` as if nothing had
// been dropped. The preview entry now carries the member's own `id` and the wall keys on it.
//
// THIS PIN IS A FENCE, NOT THE DEFECT PROOF, and the difference is stated rather than smuggled: the
// duplicate-key error is a DEV-ONLY React warning and playwright-ct runs PRODUCTION React, so no CT can
// observe it. What it holds is the user-visible consequence — both same-named members are shown, each with
// its own datum, and the remainder still describes the library.
test("two members with the SAME NAME both appear in the wall, and the remainder still adds up", async ({ mount, page }) => {
  await stub(page, { tags: SAME_NAME_TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 1, 3);

  const hero = pane.locator('[data-config-built="tags"]');
  const chips = hero.locator('[data-slot="badge"]').filter({ hasText: DUPLICATE_NAME });
  await expect(chips, "the same name twice is two members, not one").toHaveCount(2);
  // …and they are distinguishable: each chip carries its own ranking datum.
  const details = await chips.locator('[data-slot="text"][data-voice="datum"]').evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
  expect(new Set(details).size, `the two chips read ${details.join(" / ")}`).toBe(2);
  // The whole library is on screen, so the derived remainder must not be drawn at all.
  await expect(hero.getByText(ANY_REMAINDER), "nothing is hidden, so nothing claims to be").toHaveCount(0);
});

// ── THE TWELVE-IDENTICAL-VALUES WALL (side-eye 2026-08-19 P2-2) ─────────────────────────────────────
// The regex library ranks by RECENCY, so on a library authored in one sitting all twelve chips printed the
// same word ("yesterday") — the ugliest block left on the surface, and a column of one repeated value is
// not a datum, it is noise that reads as a rendering bug. A detail with ONE distinct value across a wall of
// several discriminates nothing, so the host omits the slot and the chip wall carries names alone.
test("a detail that is the same on every chip is dropped — the wall carries names alone", async ({ mount, page }) => {
  await stub(page, { scripts: SAME_STAMP_SCRIPTS, tags: TAGS });
  const pane = await mount(<ConfigWelcomeStory />);
  await settled(pane, 2, 2);

  const regex = pane.locator('[data-config-built="regex"]');
  // The wall is still there, and it is still the library's own members.
  await expect(regex.getByText("Recently edited", { exact: true })).toBeVisible();
  await expect(regex.locator('[data-slot="badge"]')).toHaveCount(SAME_STAMP_SCRIPTS.length);
  await expect(regex.locator('[data-slot="text"][data-voice="datum"]'), "a value repeated on every chip is not a datum").toHaveCount(0);

  // …and the rule is about DISTINCTNESS, not about regex: the tag wall's usage totals vary, so it keeps
  // every one of its details.
  const tagDetails = await pane
    .locator('[data-config-built="tags"]')
    .locator('[data-slot="text"][data-voice="datum"]')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
  expect(new Set(tagDetails).size, "a varying detail is kept").toBeGreaterThan(1);
});
