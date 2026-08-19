// CT: the corpus overview's COMPOSITION at the owner's default pane width — the three rendered defects the
// 2026-08-18 corpus rail pass measured on the live surface (reports/design/rail-corpus-2026-08-18.md P1-2,
// P1-3, P2-1). Every assertion here is a GEOMETRY or a COMPUTED PAINT, because all three defects were
// invisible to a class-list or a role query: the code already had the split, the button already existed, and
// the focal island was already marked.
//
// WHY A DEDICATED MOUNT. `corpus-content.ct.tsx` mounts the CONTENT REGION at 720px — the right host for the
// region's own inset and scroll. It cannot answer "does the designed layout render in the owner's view",
// because that question is about ONE width: the 868.8125px this surface's `@container` resolves to at a 1280
// viewport with the list pane docked and the context pane collapsed. `CorpusHomeDefaultPaneStory` IS that
// width (its own doc carries the snap receipt).
//
// WHAT EACH TEST PINS:
//   • THE SPLIT RENDERS (P1-2). `cols="lead"` breathes at `@4xl` = 896px, so the split missed the real pane
//     by 27px and the mock's composition — map island beside the readiness rail — was a layout the owner had
//     literally never seen. The assertion is the user-visible fact, not the track template: the rail sits
//     BESIDE the island (to its right, sharing its vertical band), never under it.
//   • THE ONE DOOR IS A CONTROL (P1-3). "Run the passes again" computed 869x32, transparent, borderless,
//     muted 13px, centred — a caption, not a button. It now paints a real fill and is BOUNDED (it does not
//     stretch across its whole column).
//   • THE FOCAL IS RINGED, NOT TABBED (P2-1). The island wore a 3px accent border-left on a rounded Card —
//     `design-audit`'s `side-tab` + `border-accent-on-rounded`, a §6 absolute ban — while the sanctioned
//     ::before ring was dimmed to `opacity: 0.3` (effective ring alpha 0.12). The stripe is gone and the ring
//     carries the focal at its token's own strength, in BOTH phases (the invitation holds the focal while the
//     library is un-analysed; the map reclaims it after).
//
// BARRIER DISCIPLINE: every test waits on `[data-corpus-focal]`, the node only the SETTLED arm produces —
// the surface's testid attaches while its single QueryBoundary still reads "Loading your corpus…".

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { CorpusHomeDefaultPaneStory, CorpusHomeNarrowPaneStory, CorpusHomeThreePaneStory, CorpusHomeWidePaneStory } from "../_ct-stories.tsx";

const FAMILIES = [
  {
    label: "mixed",
    genre: null,
    tone: null,
    artStyle: null,
    palette: null,
    mood: null,
    size: 2,
    members: [
      { characterId: "character_jfc", name: "JFC", avatarHash: null },
      { characterId: "character_elias", name: "Elias Thorn", avatarHash: null },
    ],
    model: "Qwen/Qwen3-VL-Embedding-2B",
  },
  {
    label: "mixed",
    genre: null,
    tone: null,
    artStyle: null,
    palette: null,
    mood: null,
    size: 1,
    members: [{ characterId: "character_orphan", name: "Morgatha", avatarHash: null }],
    model: "Qwen/Qwen3-VL-Embedding-2B",
  },
];

/** A library with characters and a finished VISUAL pass only — the invitation holds the focal. */
const UNANALYSED: TrpcRoutes = {
  "discovery.home": {
    coverage: { characters: 10, digests: 0, segments: 0 },
    sceneThemes: [],
    arcThemes: [],
    duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
  },
  "discovery.catalog": { totalDistilled: 0, genres: [], tones: [], topTags: [] },
  "discovery.visualArchetypes": FAMILIES,
  "discovery.forgottenGems": [],
  "discovery.unusedCharacters": [],
  "discovery.modelRouting": [],
  "discovery.themes": [],
  "discovery.topKeywords": [],
  "discovery.themeDrift": [],
  "settings.getUserSettings": { userId: "user_me", schemaVersion: 1, updatedAt: 1, config: { memory: { enabled: true } } },
  "workloads.list": [],
};

/** …and the same library after the semantic pass — the map reclaims the focal and the rail carries the
 *  surface's one remaining door. */
const ANALYSED: TrpcRoutes = {
  ...UNANALYSED,
  "discovery.home": {
    coverage: { characters: 10, digests: 40, segments: 12 },
    sceneThemes: [{ id: "theme_1", clusterIdx: 0, level: "scene", name: "The long road", size: 7 }],
    arcThemes: [],
    duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
  },
  "discovery.catalog": { totalDistilled: 6, genres: [{ value: "fantasy", count: 6 }], tones: [], topTags: [] },
};

/** The focal island's box and the readiness rail's, read together — the two boxes whose relationship IS the
 *  composition. Taken from the rail's own kicker heading rather than a wrapper, so the measurement survives
 *  any re-nesting of the track child. */
async function composition(page: Page): Promise<{ islandRight: number; islandTop: number; islandBottom: number; railLeft: number; railTop: number }> {
  const island = await page.locator("[data-corpus-focal]").boundingBox();
  const rail = await page.getByRole("heading", { name: "Readiness" }).boundingBox();
  if (island === null || rail === null) {
    throw new Error("the corpus focal island or the readiness rail did not render a box");
  }
  return { islandRight: island.x + island.width, islandTop: island.y, islandBottom: island.y + island.height, railLeft: rail.x, railTop: rail.y };
}

test("THE DESIGNED TWO-COLUMN SPLIT RENDERS at the owner's default pane width (P1-2)", async ({ mount, page }) => {
  await routeTrpc(page, ANALYSED);
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();
  await expect(component.getByRole("heading", { name: "Readiness" })).toBeVisible();

  const box = await composition(page);
  expect(box.railLeft, "the readiness rail sits BESIDE the focal island, not under it").toBeGreaterThanOrEqual(box.islandRight);
  expect(box.railTop, "…and shares its vertical band, which is what makes it a column rather than a tail").toBeLessThan(box.islandBottom);
});

test("…and the split is CONDITIONAL: the three-pane width still stacks the two tracks", async ({ mount, page }) => {
  // The container query is the whole mechanism — an unconditional two-column grid would be a different
  // defect, not a fix, and this is the pane state that catches it: list docked AND context open, 484.81px.
  await routeTrpc(page, ANALYSED);
  await mount(<CorpusHomeThreePaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  const box = await composition(page);
  expect(box.railLeft, "at the three-pane width the rail returns UNDER the island").toBeLessThan(box.islandRight);
  expect(box.railTop, "…which is what stacking means").toBeGreaterThanOrEqual(box.islandBottom);
});

test("THE SURFACE'S ONE DOOR IS A CONTROL: a painted, bounded button (P1-3)", async ({ mount, page }) => {
  await routeTrpc(page, ANALYSED);
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  const door = component.getByRole("button", { name: "Run the passes again" });
  await expect(door).toBeVisible();
  const painted = await door.evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const parent = el.parentElement;
    return {
      fill: style.backgroundColor,
      border: style.borderTopWidth,
      width: el.getBoundingClientRect().width,
      columnWidth: parent === null ? 0 : parent.getBoundingClientRect().width,
    };
  });
  expect(painted.fill !== "rgba(0, 0, 0, 0)" || painted.border !== "0px", "the one door paints a fill or an edge — a control, not a caption").toBe(true);
  expect(painted.width, "…and it is BOUNDED: a button that spans its whole column reads as a banner").toBeLessThan(painted.columnWidth);
});

// ── THE RECOVERY DOOR AND THE DRILL-OUT DOOR (side-eye corpus re-pass A5 / A7) ────────────────────────
// Two doors on this surface were broken in opposite ways: one DISAPPEARED in the state that needed it, and
// one led somewhere it could not deliver. Both are pinned as rendered affordances, in both arms.

/** The rail's failure arm needs a viewer (rows are attributed to `sessions.me`) and a terminal pass row. */
const FAILED_PASS: TrpcRoutes = {
  ...ANALYSED,
  "sessions.me": { userId: "user_me", globalRole: "user", handle: "me" },
  "workloads.list": [
    {
      id: "workload_failed",
      kind: "distill-characters",
      status: "failed",
      ownerId: "user_me",
      mode: "singular",
      createdAt: 10,
      params: {},
      progress: null,
      error: "the embed model refused the batch",
      result: null,
    },
  ],
};

const JOBS_DOOR = /All jobs in Settings/;
const FAMILIES_DOOR = /All families/;

test("A5: the readiness failure keeps the door to the log it names", async ({ mount, page }) => {
  await routeTrpc(page, FAILED_PASS);
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  // SETTLED barrier for this arm: the failure sentence itself, which only the terminal row produces.
  await expect(component.locator('[data-slot="readiness-rerun-failure"]')).toBeVisible();
  // THE DEFECT: the branch that tells you to go read the error log was the one branch that deleted the
  // route to it — the two were a ternary. The message is conditional; the door is not.
  await expect(component.getByRole("button", { name: JOBS_DOOR })).toBeVisible();
});

test("…and the jobs door is present in the CLEAN arm too — the fix did not just move the hole", async ({ mount, page }) => {
  await routeTrpc(page, ANALYSED);
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  await expect(component.getByRole("button", { name: JOBS_DOOR })).toBeVisible();
  await expect(component.locator('[data-slot="readiness-rerun-failure"]')).toHaveCount(0);
});

test("A7: 'All families' renders only when its destination will actually draw them", async ({ mount, page }) => {
  await routeTrpc(page, ANALYSED);
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  await expect(component.getByRole("button", { name: FAMILIES_DOOR })).toBeVisible();
});

test("…and it is GONE on the undistilled library, where the Archetypes tab answers with an invitation", async ({ mount, page }) => {
  // `UNANALYSED` carries families (the island is at its LOUDEST here) with `totalDistilled: 0` — the exact
  // state the old comment called impossible ("populated whenever this island renders at all") and the one
  // where the tab's #154 gate refuses to draw a single cluster.
  await routeTrpc(page, UNANALYSED);
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();

  await expect(component.getByText("The shape of your library"), "the island itself still renders").toBeVisible();
  await expect(component.getByRole("button", { name: FAMILIES_DOOR })).toHaveCount(0);
});

/** The focal treatment as PAINT: no single-edge accent border on the rounded island, and the sanctioned
 *  ::before ring at its token's own strength rather than dimmed to a third of it. */
function focalPaint(page: Page): Promise<{ startWidth: string; endWidth: string; ringOpacity: string; ringShadow: string }> {
  return page.locator("[data-corpus-focal]").evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const ring = globalThis.getComputedStyle(el, "::before");
    return { startWidth: style.borderInlineStartWidth, endWidth: style.borderInlineEndWidth, ringOpacity: ring.opacity, ringShadow: ring.boxShadow };
  });
}

/** Every truncating span inside the family-map plates, with whether it is actually CLIPPING. `truncate` is
 *  a promise the text can be read at all — a plate column narrow enough to exercise it is the defect. */
function plateGeometry(page: Page): Promise<{ rows: number; plateWidths: number[]; clipped: string[] }> {
  return page.locator('[data-corpus-focal="familyMap"]').evaluate((el) => {
    const grid = el.querySelector(".grid");
    if (grid === null) {
      throw new Error("the family map rendered no plate grid");
    }
    const plates = [...grid.children];
    return {
      rows: new Set(plates.map((plate) => Math.round(plate.getBoundingClientRect().top))).size,
      plateWidths: plates.map((plate) => Math.round(plate.getBoundingClientRect().width)),
      clipped: [...grid.querySelectorAll(".truncate")].filter((t) => t.scrollWidth > t.clientWidth + 1).map((t) => t.textContent ?? ""),
    };
  });
}

// THE PLATE FLOOR IS 16rem, AND THAT IS THE ANSWER, NOT A LAG (#256). `corpus-family-map.tsx` carried a
// comment claiming a 13rem floor — the MOCK's number, never the code's — and the drift was filed as
// "plates 1-up in the new lead column, a 13rem arm would give 2-up matching the mock". Measured on this
// story pair, both ends of the surface's real width range, with the 13rem arm injected as the A/B:
//
//   pane 868.81px (lead column, grid 483px):  16rem → 1-up, plate 483px, ZERO clipped spans
//                                             13rem → 2-up, plate 237px, the gloss CLIPS
//   pane 484.81px (stacked,     grid 459px):  16rem → 1-up, plate 459px, ZERO clipped spans
//                                             13rem → 2-up, plate 225px, the gloss CLIPS
//
// A plate is an AvatarStack + a two-line text column, and the gloss is `N members · <every member name>`.
// At 13rem the text column falls to ~143-155px and the gloss stops being readable — on the CT's own
// two-short-name fixture, i.e. the best case. The mock's 2-up is a picture of a plate that does not carry
// this text. So the code was right and the COMMENT was repaired; this test is the fence that keeps the
// number from drifting back on a screenshot's say-so.
for (const [pane, Story] of [
  ["the owner's default pane", CorpusHomeDefaultPaneStory],
  ["the three-pane width", CorpusHomeThreePaneStory],
] as const) {
  test(`THE FAMILY PLATES STAY READABLE at ${pane} (#256 — the 16rem floor)`, async ({ mount, page }) => {
    await routeTrpc(page, ANALYSED);
    await mount(<Story />);
    await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

    const geometry = await plateGeometry(page);
    expect(geometry.clipped, "no plate's name or gloss may clip — that is what the 16rem floor buys").toEqual([]);
    expect(
      Math.min(...geometry.plateWidths),
      "…and every plate fills its column: a floor that tiles them 2-up here is the narrower plate this rejects",
    ).toBeGreaterThanOrEqual(256);
  });
}

for (const [phase, routes] of [
  ["UN-ANALYSED (the invitation holds it)", UNANALYSED],
  ["ANALYSED (the map reclaims it)", ANALYSED],
] as const) {
  test(`THE FOCAL IS RINGED, NOT TABBED — ${phase} (P2-1)`, async ({ mount, page }) => {
    await routeTrpc(page, routes);
    await mount(<CorpusHomeDefaultPaneStory />);
    await expect(page.locator("[data-corpus-focal]")).toBeVisible();

    const paint = await focalPaint(page);
    expect(paint.startWidth, "no side-tab: the island's leading edge is the Card's own hairline, like every other edge").toBe(paint.endWidth);
    expect(paint.ringShadow, "the focal is still PAINTED — the rationed glow rides the sanctioned ::before carrier").not.toBe("none");
    expect(
      paint.ringOpacity,
      "…at the token's own strength; 0.3 made the sanctioned ring effectively invisible and left the banned stripe doing the work",
    ).toBe("1");
  });
}

// ── A6: THE "NEVER PLAYED" LIST OWNS REAL listitem CHILDREN (side-eye corpus re-pass 2026-08-19) ──────
// The re-pass listed this list beside "Distilled catalog" as a `role="list"` with div children (axe
// `aria-required-children` 0). Unlike the catalog, this one renders through the shared `VirtualList`, which
// ships `role="list"` on its scroller and `role="listitem"` + setsize/posinset on every measured row shell
// (packages/ui/src/primitives/virtual-list/virtual-list.tsx) — with the virtualizer's own viewport div in
// between. This is the RENDERED check of that chain, because a source read cannot tell whether the
// intervening node breaks the ownership: it asserts the roles the browser actually computes.
const NEVER_PLAYED: TrpcRoutes = {
  ...ANALYSED,
  "discovery.unusedCharacters": [
    { characterId: "character_imai", name: "Imai", avatarHash: null },
    { characterId: "character_kestrel", name: "Kestrel", avatarHash: null },
  ],
};

test("the Never-played list announces as a list of listitems, not a bag of divs (A6)", async ({ mount, page }) => {
  await routeTrpc(page, NEVER_PLAYED);
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();

  const list = component.getByRole("list", { name: "Never played characters" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").first().getByRole("button", { name: "Imai" })).toBeVisible();
});

// ── §5 `distill`: THE MASTHEAD STATES EACH NUMBER ONCE ───────────────────────────────────────────────
// The h1 read "327 characters, distilled into 24 story themes" while the figure block beside it printed 327
// and 24 again. The derivation is unit-tested at every phase boundary; this is the RENDERED half — that the
// surface actually prints one of each, and that the figure block DISAPPEARS rather than repeating itself.
test("the masthead never prints a number its own sentence just said (§5 distill)", async ({ mount, page }) => {
  await routeTrpc(page, ANALYSED);
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();

  await expect(component.getByRole("heading", { level: 1 })).toHaveText("Ten characters, distilled into one story theme.");
  // The sentence spends `characters` and `storyThemes`; the only figure left to state is the visual
  // families, so THAT is the hero — and "10" (the character count) appears nowhere as a figure.
  await expect(component.getByText("visual families", { exact: true })).toBeVisible();
  await expect(component.getByText("characters", { exact: true })).toHaveCount(0);
  await expect(component.getByText("story themes", { exact: true })).toHaveCount(0);
});

/** More bars than any single-line fallback could produce — the claim is "a composition", not "a bar". */
const SKELETON_BAR_FLOOR = 5;
/** The eyebrow bar is `w-1/6` of the pane: a band, not the exact sixth, so re-tuning the taste does not
 *  re-red the test — what it must never be is 1 (an unregistered utility, so the bar filled the pane). */
const SKELETON_EYEBROW_MIN_RATIO = 0.05;
const SKELETON_EYEBROW_MAX_RATIO = 0.4;

// ── §5: THE LOADING STATE IS THE SURFACE'S SHAPE, NOT A SENTENCE IN A VOID ───────────────────────────
// The CONTENT pane fell back to a bare "Loading your corpus…" gloss in the corner of an 869x800 empty
// rectangle for the 1-2s its eight reads take, while the LIST pane beside it ran proper skeletons.
// `trpcHold()` is the release valve that makes the PENDING render a stable state instead of a flash.
test("the pending corpus renders a skeleton composition, not a lone sentence (§5)", async ({ mount, page }) => {
  const held = trpcHold();
  await routeTrpc(page, { ...ANALYSED, "discovery.home": held });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await held.requested;

  const skeleton = component.locator('[data-slot="corpus-home-skeleton"]');
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("aria-busy", "true");
  // It is a COMPOSITION: more than one placeholder bar, in the shape the settled surface takes. Polled,
  // not sampled — the bars mount with the fallback and a single count can read mid-commit.
  await expect.poll(() => skeleton.locator('[data-slot="skeleton"]').count()).toBeGreaterThan(SKELETON_BAR_FLOOR);
  await expect(component.getByText("Loading your corpus…")).toHaveCount(0);

  // THE BARS ARE FRACTIONS OF THEIR OWN TRACK, and an unregistered utility fails SILENTLY — the div simply
  // fills its parent, which no class-string assertion can see. Measured instead: the masthead eyebrow is a
  // slice of the pane, not the whole of it (it is `w-1/6`; the band brackets the fraction without pinning
  // the exact number, which is a taste call).
  const eyebrow = skeleton.locator('[data-slot="skeleton"]').first();
  const eyebrowWidth = (await eyebrow.boundingBox())?.width ?? 0;
  const paneWidth = (await skeleton.boundingBox())?.width ?? 0;
  expect(paneWidth).toBeGreaterThan(0);
  expect(eyebrowWidth / paneWidth).toBeGreaterThan(SKELETON_EYEBROW_MIN_RATIO);
  expect(eyebrowWidth / paneWidth).toBeLessThan(SKELETON_EYEBROW_MAX_RATIO);

  // …and it gives way to the real surface when the reads land (the fallback is a fallback, not a state).
  held.release((ANALYSED as Record<string, unknown>)["discovery.home"]);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();
});

// ── B7 + §5: THE MASTHEAD STACKS BEFORE IT SQUEEZES, AND THE RIGHT COLUMN DOES NOT STOP ──────────────
// Both are RANGE properties, so both are measured at more than one width. B7: at 430px the h1 wrapped to
// six one-word lines in a ~130px column because a `flex-wrap` Row cannot wrap around a `min-w-0` child.
// §5: at 1224px the readiness column ended ~250px above the island beside it, because the grid was
// `items-start` and the rail's height is fixed by construction while the island's grows with the library.
const MANY_FAMILIES = Array.from({ length: 8 }, (_, i) => ({
  label: "mixed",
  genre: null,
  tone: null,
  artStyle: null,
  palette: null,
  mood: null,
  size: 1,
  members: [{ characterId: `character_${i}`, name: `Member ${i}`, avatarHash: null }],
  model: "Qwen/Qwen3-VL-Embedding-2B",
}));
/** A library whose ISLAND is the tall column — eight family plates against a five-row rail, which is the
 *  shape that produced the audited void. */
const TALL_ISLAND: TrpcRoutes = { ...ANALYSED, "discovery.visualArchetypes": MANY_FAMILIES };
/** How close the two columns' feet must come. Not zero: the tracks carry different content and the last
 *  hairline row's own border rounds; a quarter of the audited 250px gap would still be a visible void. */
const FOOT_TOLERANCE_PX = 24;

/** How far the readiness column's foot sits above the island's, in px — the audited void, measured. */
async function footGap(page: Page): Promise<number> {
  const island = await page.locator("[data-corpus-focal]").boundingBox();
  const rail = await page.locator('[data-slot="readiness-rail"]').boundingBox();
  if (island === null || rail === null) {
    throw new Error("the focal island or the readiness rail did not render a box");
  }
  return island.y + island.height - (rail.y + rail.height);
}

// TWO EXPLICIT MOUNTS, not a loop over a story tuple: playwright-ct hoists each imported story into one
// generated const, and a story named in a second `as const` tuple array in the same file collides with the
// first ("Identifier … has already been declared", at bundle eval — not a test failure, a build one).
test("THE READINESS COLUMN MEETS THE ISLAND'S FOOT at the owner's default pane (§5)", async ({ mount, page }) => {
  await routeTrpc(page, TALL_ISLAND);
  await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();

  const gap = await footGap(page);
  expect(gap, `the readiness column stops ${Math.round(gap)}px above the island`).toBeLessThanOrEqual(FOOT_TOLERANCE_PX);
});

test("…and at a wide pane, where the audited void was measured (§5)", async ({ mount, page }) => {
  await routeTrpc(page, TALL_ISLAND);
  await mount(<CorpusHomeWidePaneStory />);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();

  const gap = await footGap(page);
  expect(gap, `the readiness column stops ${Math.round(gap)}px above the island`).toBeLessThanOrEqual(FOOT_TOLERANCE_PX);
});

test("the mobile masthead STACKS rather than squeezing the headline into a column (B7)", async ({ mount, page }) => {
  await routeTrpc(page, ANALYSED);
  const component = await mount(<CorpusHomeNarrowPaneStory />);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();

  const headline = await component.getByRole("heading", { level: 1 }).boundingBox();
  const hero = await component.getByText("visual families", { exact: true }).boundingBox();
  if (headline === null || hero === null) {
    throw new Error("the masthead did not render its headline and its figure");
  }
  // STACKED: the figure sits BELOW the headline, not beside it …
  expect(hero.y, "the figure block belongs under the headline at a phone width").toBeGreaterThanOrEqual(headline.y + headline.height);
  // … which is what gives the sentence the pane's whole width instead of a ~130px column.
  const paneWidth = 430;
  expect(headline.width, "the headline gets the pane, not a sliver of it").toBeGreaterThan(paneWidth / 2);
});
