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
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { CorpusHomeDefaultPaneStory, CorpusHomeThreePaneStory } from "../_ct-stories.tsx";

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

/** The focal treatment as PAINT: no single-edge accent border on the rounded island, and the sanctioned
 *  ::before ring at its token's own strength rather than dimmed to a third of it. */
function focalPaint(page: Page): Promise<{ startWidth: string; endWidth: string; ringOpacity: string; ringShadow: string }> {
  return page.locator("[data-corpus-focal]").evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const ring = globalThis.getComputedStyle(el, "::before");
    return { startWidth: style.borderInlineStartWidth, endWidth: style.borderInlineEndWidth, ringOpacity: ring.opacity, ringShadow: ring.boxShadow };
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
