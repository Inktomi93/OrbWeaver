// CT: the corpus overview's COMPOSITION at the owner's default pane width — the three rendered defects the
// 2026-08-18 corpus rail pass measured on the live surface (the corpus rail design review, P1-2,
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

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import {
  CorpusHomeDefaultPaneStory,
  CorpusHomeNarrowPaneStory,
  CorpusHomePopulatedStory,
  CorpusHomeThreePaneStory,
  CorpusHomeWarmQueueStory,
  CorpusHomeWidePaneStory,
} from "../_ct-stories.tsx";

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

/** The viewer-identity read (#649) — spread FIRST into every `routeTrpc` call in this file. The corpus
 *  surface's run-the-pass door resolves the viewer off it, and it is nobody's subject here. Unfed it
 *  answered `routeTrpc`'s null, so this mount's viewer resolved through its no-data branch and nothing in
 *  thirty-three mounts exercised the identity-dependent path. The `userId` matches the settings row the
 *  route bags below already carry, so the two ambient reads describe ONE viewer rather than two. */
const CORPUS_VIEWER_ROUTE: TrpcRoutes<"sessions.me"> = {
  "sessions.me": { userId: "user_me", handle: "me", globalRole: "user" },
};

/** A library with characters and a finished VISUAL pass only — the invitation holds the focal. */
const UNANALYSED: TrpcRoutes<
  | "discovery.home"
  | "discovery.catalog"
  | "discovery.visualArchetypes"
  | "discovery.forgottenGems"
  | "discovery.unusedCharacters"
  | "discovery.modelRouting"
  | "discovery.topKeywords"
  | "discovery.themeDrift"
  | "settings.getUserSettings"
  | "workloads.list"
> = {
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
  "discovery.topKeywords": [],
  "discovery.themeDrift": [],
  "settings.getUserSettings": userSettingsView({ memory: { enabled: true } }, { userId: castId<UserId>("user_me"), updatedAt: 1 }),
  "workloads.list": [],
};

/** …and the same library after the semantic pass — the map reclaims the focal and the rail carries the
 *  surface's one remaining door. */
const ANALYSED: TrpcRoutes<"discovery.home" | "discovery.catalog"> = {
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
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED });
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
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED });
  await mount(<CorpusHomeThreePaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  const box = await composition(page);
  expect(box.railLeft, "at the three-pane width the rail returns UNDER the island").toBeLessThan(box.islandRight);
  expect(box.railTop, "…which is what stacking means").toBeGreaterThanOrEqual(box.islandBottom);
});

test("THE SURFACE'S ONE DOOR IS A CONTROL: a painted, bounded button (P1-3)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED });
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
const FAILED_PASS: TrpcRoutes<"sessions.me" | "workloads.list"> = {
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

/** The queue read itself DOWN — the state three of the five rail rows silently mis-reported (#1546). */
const QUEUE_DOWN: TrpcRoutes<"workloads.list"> = {
  ...ANALYSED,
  "workloads.list": () => trpcError({ message: "the queue is down" }),
};

// ── A BROKEN RUN-HISTORY READ IS NOT FIVE PASSES THAT NEVER RAN (#1546) ──────────────────────────────
// Three rail rows read their ran/not-run half off ONE `workloads.list` query. A FAILED read collapsed into
// `false`, so the rail — the surface's single home for what has and has not run — stated "not run" for
// passes it had no evidence about, with nothing said about the failure and nothing to press.
test("a FAILED queue read reads 'unknown' on the rail, never 'not run' (#1546)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...QUEUE_DOWN });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  const rail = component.locator('[data-slot="readiness-rail"]');
  const rows = rail.locator('[data-slot="readiness-stage"]');
  await expect(rows.filter({ hasText: "Near-duplicates" })).toContainText("unknown");
  await expect(rows.filter({ hasText: "Keywords" })).toContainText("unknown");
  // A pass with OUTPUT is still read as run: the theme row has a measurement, so the queue's silence
  // cannot take it away.
  await expect(rows.filter({ hasText: "Story themes" })).toContainText("1 theme computed");
  // The claim in its negative half — no row asserts a history nobody could read.
  await expect(rail.getByText("not run", { exact: true })).toHaveCount(0);
  await expect(rail.getByText("none found", { exact: true })).toHaveCount(0);
});

test("…and the rail says WHAT could not be read, with a retry that re-asks it (#1546)", async ({ mount, page }) => {
  // A FLAG, not a request counter: the surface fires more than one round trip before it paints, so
  // "fail request one" is a different claim from "the queue is down" (the config landing's twin pin was
  // measured answering from request two).
  // WHAT THE STUB ANSWERS NEXT, as a PUSHED array rather than a boolean flip: biome narrows a
  // `= false` initializer to the literal type and reds the later flip as an always-falsy condition,
  // and the `: boolean` that would fix that is itself `noInferrableTypes`. Data, not a flag.
  type WorkloadsAnswer = TrpcWireOutput<"workloads.list"> | ReturnType<typeof trpcError>;
  const answers: WorkloadsAnswer[] = [trpcError({ message: "the queue is down" })];
  const workloadsAnswer = (): WorkloadsAnswer => answers.at(-1) ?? [];
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED, "workloads.list": workloadsAnswer });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  const rail = component.locator('[data-slot="readiness-rail"]');
  await expect(rail.getByText("Couldn't load which passes have run.")).toBeVisible();
  answers.push([]);
  await rail.getByRole("button", { name: "Retry" }).click();

  // The retry really re-asks (a Retry that only re-renders is the dead end this block exists against), and
  // the answered queue puts the rows back on their ordinary words.
  await expect(rail.getByText("Couldn't load which passes have run.")).toHaveCount(0);
  await expect(rail.locator('[data-slot="readiness-stage"]').filter({ hasText: "Near-duplicates" })).toContainText("not run");
});

const JOBS_DOOR = /All jobs in Settings/;
const FAMILIES_DOOR = /All families/;

// ── #537 · the corpus ARIA sweep: the two role-less runs of text on this surface ─────────────────────
// The readiness rail was a `<section>` full of role-less `<div>` rows and the family map an unstructured
// grid of cards: a screen reader met each as ONE flat run with no count, no boundary to step to, and no
// way to tell where a stage's NAME ended and its measurement began. Both are lists; they say so now.
test("#537 the readiness rail is a LIST of stages, not one flat run of text", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...FAILED_PASS });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  const rail = component.getByRole("list", { name: "Analysis passes" });
  await expect(rail).toBeVisible();
  // One item per stage — the count is the thing a reader gets for free from the structure.
  const stages = component.locator('[data-slot="readiness-stage"]');
  await expect.poll(async () => await stages.count()).toBeGreaterThan(1);
  const stageCount = await stages.count();
  await expect(rail.getByRole("listitem")).toHaveCount(stageCount);
});

test("#537 the family map is a LIST of plates", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...FAILED_PASS });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  const island = page.locator('[data-corpus-focal="familyMap"]');
  await expect(island).toBeVisible();

  const plates = component.getByRole("list", { name: "Visual families" });
  await expect(plates).toBeVisible();
  await expect(plates.getByRole("listitem").first()).toBeVisible();
});

test("A5: the readiness failure keeps the door to the log it names", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...FAILED_PASS });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  // SETTLED barrier for this arm: the failure sentence itself, which only the terminal row produces.
  await expect(component.locator('[data-slot="readiness-rerun-failure"]')).toBeVisible();
  // THE DEFECT: the branch that tells you to go read the error log was the one branch that deleted the
  // route to it — the two were a ternary. The message is conditional; the door is not.
  await expect(component.getByRole("button", { name: JOBS_DOOR })).toBeVisible();
});

// ── P3-F + "quieter": THE FAILURE SAYS *WHEN*, AND STOPS OUT-SHOUTING THE COLUMN ──────────────────────
// Five green checks over a red sentence read as contradicting one another: the rows report the library's
// state, the sentence reports one RUN. The kicker names that. The second half is a FORK with the P2-7 ruling
// recorded in the rail's own header (which moved this line UP from `gloss`) — re-pass #3 measured the other
// end, "CTA-amber + danger-red read as one warm mass", receipt "the CTA is the only warm element in the
// column". Both hold: the STEP stays a reading step (P2-7's concern) and the COLOUR joins the rail's quiet
// register (re-pass #3's). See the rail's own comment for the full statement.
/** The readable floor for non-interactive copy on this surface — the step P2-7 refused to go below. */
const READABLE_FLOOR_PX = 11;

test("the readiness failure is dated by a kicker and reads in the rail's quiet register (P3-F)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...FAILED_PASS });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  const block = component.locator('[data-slot="readiness-rerun-failure"]');
  await expect(block).toBeVisible();
  const paint = await block.evaluate((el) => {
    const kicker = el.firstElementChild;
    const sentence = el.lastElementChild;
    if (kicker === null || sentence === null) {
      throw new Error("the failure block did not render its kicker and its sentence");
    }
    const kickerStyle = globalThis.getComputedStyle(kicker);
    const sentenceStyle = globalThis.getComputedStyle(sentence);
    return {
      kickerText: kicker.textContent ?? "",
      kickerTop: kicker.getBoundingClientRect().top,
      sentenceTop: sentence.getBoundingClientRect().top,
      colour: sentenceStyle.color,
      quietColour: kickerStyle.color,
      sizePx: Number.parseFloat(sentenceStyle.fontSize),
    };
  });

  expect(paint.kickerText, "the sentence reports a RUN, and now says so").toBe("Last run");
  expect(paint.kickerTop, "the kicker sits over the block it dates").toBeLessThan(paint.sentenceTop);
  // The warm mass is gone: the sentence paints the same quiet ink the rail's own band label does, leaving
  // the primary CTA as the column's one warm element.
  expect(paint.colour, "the failure joined the rail's quiet register").toBe(paint.quietColour);
  // …and it did NOT go back to the footnote step P2-7 rejected.
  await expect
    .poll(
      async () =>
        (
          await block.evaluate((el) => {
            const kicker = el.firstElementChild;
            const sentence = el.lastElementChild;
            if (kicker === null || sentence === null) {
              throw new Error("the failure block did not render its kicker and its sentence");
            }
            const kickerStyle = globalThis.getComputedStyle(kicker);
            const sentenceStyle = globalThis.getComputedStyle(sentence);
            return {
              kickerText: kicker.textContent ?? "",
              kickerTop: kicker.getBoundingClientRect().top,
              sentenceTop: sentence.getBoundingClientRect().top,
              colour: sentenceStyle.color,
              quietColour: kickerStyle.color,
              sizePx: Number.parseFloat(sentenceStyle.fontSize),
            };
          })
        ).sizePx,
    )
    .toBeGreaterThanOrEqual(READABLE_FLOOR_PX);
});

test("…and the jobs door is present in the CLEAN arm too — the fix did not just move the hole", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  await expect(component.getByRole("button", { name: JOBS_DOOR })).toBeVisible();
  await expect(component.locator('[data-slot="readiness-rerun-failure"]')).toHaveCount(0);
});

test("A7: 'All families' renders only when its destination will actually draw them", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  await expect(component.getByRole("button", { name: FAMILIES_DOOR })).toBeVisible();
});

test("…and it is GONE on the undistilled library, where the Archetypes tab answers with an invitation", async ({ mount, page }) => {
  // `UNANALYSED` carries families (the island is at its LOUDEST here) with `totalDistilled: 0` — the exact
  // state the old comment called impossible ("populated whenever this island renders at all") and the one
  // where the tab's #154 gate refuses to draw a single cluster.
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...UNANALYSED });
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
    await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED });
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
    await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...routes });
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
const NEVER_PLAYED: TrpcRoutes<"discovery.unusedCharacters"> = {
  ...ANALYSED,
  "discovery.unusedCharacters": [
    { characterId: "character_imai", name: "Imai", avatarHash: null },
    { characterId: "character_kestrel", name: "Kestrel", avatarHash: null },
  ],
};

test("the Never-played list announces as a list of listitems, not a bag of divs (A6)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...NEVER_PLAYED });
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
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED });
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
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED, "discovery.home": held });
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
  held.release(ANALYSED["discovery.home"]);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();
});

test("below-fold insights do not hold the settled corpus overview hostage (#269)", async ({ mount, page }) => {
  const heldUnused = trpcHold();
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED, "discovery.unusedCharacters": heldUnused });
  const component = await mount(<CorpusHomeDefaultPaneStory />);
  await heldUnused.requested;

  // The focal map is the settled above-fold affordance. Before the split, this held query suspended the
  // one outer boundary and only the whole-surface skeleton rendered here.
  await expect(component.locator('[data-corpus-focal="familyMap"]')).toBeVisible();
  await expect(component.locator('[data-slot="corpus-home-skeleton"]')).toHaveCount(0);

  heldUnused.release([{ characterId: "character_deferred", name: "Deferred insight", avatarHash: null }]);
  await expect(component.getByRole("list", { name: "Never played characters" })).toBeVisible();
});

// ── #384: THE RAIL NEVER STATES A MEASUREMENT IT HAS NOT TAKEN ───────────────────────────────────────
// The deferral above (#269) is what makes this reachable: `topKeywords` stopped suspending the surface, so
// the rail now renders while that read is still in flight. Its keyword row fed `keywords.data?.length ?? 0`
// into the measurement branch, and on a WARM queue — the designed-for case, `workloads.list` a cache hit —
// that printed "Keywords — none found" for one round trip before flipping to the real count. That is the
// exact incident the row exists to prevent (corpus-analysis-state.ts, the #164 owner reading): a zero from a
// pass that has not answered is not a result, and the owner reasonably read one as a defect.
//
// THE MOUNT IS THE PROOF'S HALF. A hold suspends its whole BATCH (route-trpc.ts), and the overview fires the
// queue read and the keyword read in one tick — so a plain mount holding `topKeywords` also holds
// `workloads.list`, the rail falls back to its conservative "not run", and the defect is unreachable.
// `CorpusHomeWarmQueueStory` primes the queue one tick earlier, which is what puts them in separate batches.
/** A queue that has FINISHED the keyword pass — the state in which an empty keyword table is a real result. */
const WARM_KEYWORD_QUEUE: TrpcRoutes<"workloads.list"> = {
  ...ANALYSED,
  "workloads.list": [
    {
      id: "workload_keywords",
      kind: "compute-cooccurrence",
      status: "succeeded",
      ownerId: "user_me",
      mode: "singular",
      createdAt: 10,
      params: {},
      progress: null,
      error: null,
      result: null,
    },
  ],
};

test("the readiness rail states no keyword measurement while the keyword read is in flight (#384)", async ({ mount, page }) => {
  const heldKeywords = trpcHold();
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...WARM_KEYWORD_QUEUE, "discovery.topKeywords": heldKeywords });
  const component = await mount(<CorpusHomeWarmQueueStory />);
  await heldKeywords.requested;
  // SETTLED barrier: the focal island, which only the settled above-fold arm produces — the held read is
  // below the fold and must not hold it (that is #269, and this test would be measuring the skeleton).
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();

  const keywords = component.locator('[data-slot="readiness-stage"]').filter({ hasText: "Keywords" });
  await expect(keywords).toHaveCount(1);
  await expect(keywords, "an un-answered read is not a measurement — 'none found' is a claim about a table we have not read").not.toContainText("none found");
  await expect(keywords, "…and the row says which of the three states it is actually in").toContainText("checking…");

  // …and it states the real result the moment the read lands: the deferral stays, only the honesty is added.
  heldKeywords.release([]);
  await expect(keywords).toContainText("none found");
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
const TALL_ISLAND: TrpcRoutes<"discovery.visualArchetypes"> = { ...ANALYSED, "discovery.visualArchetypes": MANY_FAMILIES };
// THE FIX THAT WAS TRIED HERE IS REVERSED, AND SO ARE ITS PINS (side-eye corpus re-pass #2, P2-1). Two
// tests used to assert the rail's FOOT met the island's, which is what `flex-1` + `justify="between"` on the
// stage stack bought. The re-pass measured what it cost: pitch 101/101/101/102px over rows whose ink is
// ~33px — 67% air, uniform, the density spec's own slop tell — and a failure sentence crushed at the foot.
// The void the distribute was fixing is the cheaper defect, so the rows are natural again and THIS is the
// property that has to hold instead: consecutive stage rows are hairline-separated, with no distributed air
// between them, at every pane width and every island height. (The old foot-gap claim is deliberately NOT
// re-pinned in a weaker form — it was refuted, not loosened.)
/** The air between consecutive stage rows. Hairline rows touch, so anything above rounding IS distribution. */
const ROW_AIR_TOLERANCE_PX = 1.5;

/** Every gap between consecutive readiness rows, in px, top-to-bottom. */
async function railRowAir(page: Page): Promise<number[]> {
  const rows = await page.locator('[data-slot="readiness-stage"]').all();
  const boxes = await Promise.all(rows.map(async (row) => row.boundingBox()));
  const measured = boxes.map((box) => {
    if (box === null) {
      throw new Error("a readiness stage row did not render a box");
    }
    return box;
  });
  return measured.slice(1).map((box, index) => box.y - ((measured[index]?.y ?? 0) + (measured[index]?.height ?? 0)));
}

// TWO EXPLICIT MOUNTS, not a loop over a story tuple: playwright-ct hoists each imported story into one
// generated const, and a story named in a second `as const` tuple array in the same file collides with the
// first ("Identifier … has already been declared", at bundle eval — not a test failure, a build one).
test("THE READINESS ROWS KEEP THEIR OWN PITCH at the owner's default pane (P2-1)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...TALL_ISLAND });
  await mount(<CorpusHomeDefaultPaneStory />);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();

  const air = await railRowAir(page);
  expect(air.length, "the rail renders its five stage rows").toBe(4);
  expect(Math.max(...air), `the stage rows are ${air.map((gap) => Math.round(gap)).join("/")}px apart`).toBeLessThanOrEqual(ROW_AIR_TOLERANCE_PX);
});

test("…and at a wide pane, where the island is tallest and the spread was worst (P2-1)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...TALL_ISLAND });
  await mount(<CorpusHomeWidePaneStory />);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();

  const air = await railRowAir(page);
  expect(Math.max(...air), `the stage rows are ${air.map((gap) => Math.round(gap)).join("/")}px apart`).toBeLessThanOrEqual(ROW_AIR_TOLERANCE_PX);
});

// ── P2-6: THE FIGURE BLOCK ALIGNS WITH THE SENTENCE IT ANNOTATES ─────────────────────────────────────
// `text-right` was unconditional, so in every STACKED arm the hero numeral floated at the right edge of its
// own content-sized column while the h1 above started at the container's text edge — measured x≈79 against
// an edge of 24. Right-alignment is a two-column relationship; this is the arm that has one column.
/** Where the GLYPHS start, not where the box does. A `Text as="span"` inside a flex column is blockified, so
 *  its bounding box fills the column whatever `text-align` does — the box is blind to the exact defect. A
 *  Range over the node's contents measures the painted text. */
function textLeft(locator: ReturnType<Page["locator"]>): Promise<number> {
  return locator.evaluate((el) => {
    const range = globalThis.document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().x;
  });
}

test("the masthead figure lines up with the headline when the arms STACK (P2-6)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...TALL_ISLAND });
  const component = await mount(<CorpusHomeNarrowPaneStory />);
  await expect(page.locator("[data-corpus-focal]")).toBeVisible();

  const [headline, figure] = await Promise.all([textLeft(component.getByRole("heading", { level: 1 })), textLeft(component.getByText("8", { exact: true }))]);
  expect(
    Math.abs(figure - headline),
    `the hero numeral's glyphs start at x=${Math.round(figure)}, the headline's at ${Math.round(headline)}`,
  ).toBeLessThanOrEqual(1);
});

test("the mobile masthead STACKS rather than squeezing the headline into a column (B7)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...ANALYSED });
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE POPULATED ARM — the same surface at 327 characters / 896 chats (side-eye 2026-08-23,
// 2026-08-23; issues #553 #535 #536 #556 #557).
//
// Everything above pins the surface's COMPOSITION on a library small enough that its every list fits.
// Everything below is a VOLUME finding — a 142-route economics table whose cost column is 141/142 null, a
// 50-bar keyword canvas, a 204-row never-played list, an 8-family map whose eighth plate is unlabelled,
// and a workload history deep enough to hold a crash UNDER a later success. None of them is reachable
// from the 10-card fixture above, so the FIXTURE is what had to change; the assertions are ordinary
// geometry and ordinary roles.
//
// ONE FILE, TWO FIXTURES, and deliberately so: `test-layout` mirrors a test onto its source, and these
// pins are about `surfaces/corpus-home-surface.tsx` exactly as much as the ones above are. The separate
// STORY (`CorpusHomePopulatedStory`) is what keeps playwright-ct's generated registry unambiguous — the
// collision that rule exists for is two files importing one story NAME, not one file holding two arms.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════

// ── THE POPULATED FIXTURE ─────────────────────────────────────────────────────────────────────────────
// Proportional to the audited library rather than a copy of it: the ratios are what the assertions read
// (242 clustered of 327 owned, one labelled cost among many null ones, more keywords than any cap).

const CHARACTERS = 327;
const DISTILLED = 313;
/** Eight families summing to 242 — the audited shape, and the 85-character shortfall that is the finding. */
const FAMILY_SIZES = [50, 40, 35, 30, 28, 27, 25, 7];
const CLUSTERED = FAMILY_SIZES.reduce((total, size) => total + size, 0);
/** The biggest family — the plate whose member run is longest, i.e. the N7 worst case. */
const LARGEST_FAMILY = Math.max(...FAMILY_SIZES);
const UNFAMILIED = CHARACTERS - CLUSTERED;

/** The server's own name for the family whose portraits the VL pass could not classify
 *  (`image-analytics/retrieve.ts`). The Archetypes tab renders exactly this string; the CONTENT plate
 *  rendered its members' names instead, which is [P2-1]. */
const UNLABELLED_FAMILY = "Unanalysed portraits";
/** The gloss the unlabelled plate keeps once its label slot stops carrying the member run. */
const UNLABELLED_FAMILY_GLOSS = /25 members/;
/** The economics chart's accessible name — matched loosely so the denominator may ride the heading. */
const BUSIEST_ROUTES = /Busiest routes/;
/** The LEADING digits of a tile's text — where the rank ordinal has to be. Anchored rather than split on
 *  whitespace: adjacent spans concatenate with no separator in `textContent` (`1BBess567,106`), so a
 *  whitespace split reads the whole tile as one token and the assertion never sees the rank it found. */
const LEADING_RANK = /^\d+/u;

const POP_FAMILIES = FAMILY_SIZES.map((size, index) => ({
  label: index === 6 ? UNLABELLED_FAMILY : `Family ${index}`,
  genre: null,
  tone: null,
  // The seventh plate is the UNLABELLED arm: no art facets at all — the state that used to make the plate
  // title itself with a run of member names while its sibling surface called the same family
  // "Unanalysed portraits" ([P2-1]). The facets stay null so the fixture keeps reproducing that state.
  artStyle: index === 6 ? null : "painterly",
  palette: index === 6 ? null : "warm",
  mood: index === 6 ? null : "playful",
  size,
  members: Array.from({ length: Math.min(size, 4) }, (_, seat) => ({
    characterId: `character_${index}_${seat}`,
    name: `Member ${index}-${seat}`,
    avatarHash: null,
  })),
  model: "Qwen/Qwen3-VL-Embedding-2B",
}));

/** 50 keywords, counts 6 → 2 — the audited spread, where every bar is 72-100% of its track. */
const KEYWORDS = Array.from({ length: 50 }, (_, index) => ({ keyword: `keyword-${index}`, count: Math.max(2, 6 - Math.floor(index / 12)) }));

/** 30 routes, ONE of which reports a dollar cost. Generations and tokens are complete on all of them —
 *  which is the whole of [P1-1]: the section charted the one field its data does not carry. */
const ROUTES: TrpcWireOutput<"discovery.modelRouting"> = Array.from({ length: 30 }, (_, index) => ({
  genre: `genre-${index % 5}`,
  model: `model-${index}`,
  provider: "local",
  generations: 400 - index * 10,
  tokensOut: 260_000 - index * 5000,
  tokensOutProvenance: "estimated",
  avgGenTimeMs: 900,
  costUsd: index === 17 ? 0.080_644 : null,
}));
const PAID_ROUTES = ROUTES.filter((route) => route.costUsd !== null).length;

const UNUSED = Array.from({ length: 204 }, (_, index) => ({
  characterId: `character_unused_${index}`,
  name: `Unplayed ${index}`,
  avatarHash: null,
}));

/** Three gems in the verb's RANK order (message volume × how long quiet) whose token totals ASCEND — the
 *  audited row 2, `567,106 · 597,739 · 629,696`, where the bars climb while the rank falls. */
const GEMS: TrpcWireOutput<"discovery.forgottenGems"> = [
  {
    characterId: "character_bess",
    name: "Bess",
    avatarHash: null,
    messageCount: 900,
    lastActiveAt: 1,
    tokensOut: 567_106,
    tokensOutProvenance: "measured",
    costUsd: null,
  },
  {
    characterId: "character_azarael",
    name: "Azarael",
    avatarHash: null,
    messageCount: 800,
    lastActiveAt: 2,
    tokensOut: 597_739,
    tokensOutProvenance: "measured",
    costUsd: null,
  },
  {
    characterId: "character_bengal",
    name: "Bengal",
    avatarHash: null,
    messageCount: 700,
    lastActiveAt: 3,
    tokensOut: 629_696,
    tokensOutProvenance: "measured",
    costUsd: null,
  },
];

/** The audited workload history: a `distill-characters` crash, and a LATER successful run of the same kind
 *  two hours after it. `compute-themes` also succeeded — and produced zero themes. */
const RUNS: TrpcWireOutput<"workloads.list"> = [
  {
    id: "workload_distill_ok",
    kind: "distill-characters",
    status: "succeeded",
    ownerId: "user_me",
    mode: "singular",
    lane: "sweep",
    dependsOn: null,
    createdAt: 1_787_443_344_202,
    updatedAt: 1_787_443_344_202,
    scheduledAt: 1_787_443_344_202,
    params: {},
    progress: null,
    error: null,
    result: null,
    poison: false,
  },
  {
    id: "workload_themes_ok",
    kind: "compute-themes",
    status: "succeeded",
    ownerId: "user_me",
    mode: "singular",
    lane: "sweep",
    dependsOn: null,
    createdAt: 1_787_431_820_258,
    updatedAt: 1_787_431_820_258,
    scheduledAt: 1_787_431_820_258,
    params: {},
    progress: null,
    error: null,
    result: null,
    poison: false,
  },
  {
    id: "workload_distill_died",
    kind: "distill-characters",
    status: "worker_died",
    ownerId: "user_me",
    mode: "singular",
    lane: "sweep",
    dependsOn: null,
    createdAt: 1_787_436_170_285,
    updatedAt: 1_787_436_170_285,
    scheduledAt: 1_787_436_170_285,
    params: {},
    progress: null,
    error: "worker heartbeat went stale — row reaped",
    result: null,
    poison: false,
  },
];

const POPULATED: TrpcRoutes<
  | "discovery.home"
  | "discovery.catalog"
  | "discovery.visualArchetypes"
  | "discovery.forgottenGems"
  | "discovery.unusedCharacters"
  | "discovery.modelRouting"
  | "discovery.topKeywords"
  | "discovery.themeDrift"
  | "sessions.me"
  | "settings.getUserSettings"
  | "workloads.list"
> = {
  "discovery.home": {
    coverage: { characters: CHARACTERS, digests: 2429, segments: 2026 },
    sceneThemes: [],
    arcThemes: [],
    duplicateCounts: { characters: 1, chats: 1, identicalCharacterPairs: 3 },
  },
  // `totalCharacters` is the base the distilled count is out of (#535) — the same 327 `discovery.home`
  // reports, because both are `count(*)` over the owner's characters. A fixture that omitted it would let
  // a census assertion pass off a `?? 0` fallback.
  "discovery.catalog": { totalDistilled: DISTILLED, totalCharacters: CHARACTERS, genres: [], tones: [], topTags: [] },
  "discovery.visualArchetypes": POP_FAMILIES,
  "discovery.forgottenGems": GEMS,
  "discovery.unusedCharacters": UNUSED,
  "discovery.modelRouting": ROUTES,
  "discovery.topKeywords": KEYWORDS,
  "discovery.themeDrift": [],
  "sessions.me": { userId: "user_me", globalRole: "user", handle: "me" },
  "settings.getUserSettings": userSettingsView({ memory: { enabled: true } }, { userId: castId<UserId>("user_me"), updatedAt: 1 }),
  "workloads.list": RUNS,
};

/** The settled above-fold barrier — the focal island, which only a resolved `discovery.*` batch produces. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();
}

// ── #555 / [P1-3]: THE RAIL REPORTS THE LIBRARY'S STATE, NOT AN ARCHIVED CRASH ────────────────────────
// `lastFailure()` picked the newest terminal row with no test for a later success, so a two-hour-old
// `worker_died` was announced forever — under five green checks, beside a button inviting a 327-character
// re-run of a pass that had already succeeded. That is a trust defect and a compute bill.

test("#555: a crash a LATER run of the same kind fixed is not announced (P1-3)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  // The re-run door is the settled barrier for THIS arm: it renders in exactly the phase the failure line
  // would, so its presence proves the rail's own branch resolved rather than that the block is merely late.
  await expect(component.getByRole("button", { name: "Run the passes again" })).toBeVisible();
  await expect(
    component.locator('[data-slot="readiness-rerun-failure"]'),
    "the newest distill run SUCCEEDED — the crash under it is history, not state",
  ).toHaveCount(0);
});

test("#555: a pass that RAN and found nothing reads 'none found', not 'not run' (P1-3)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const row = component.locator('[data-slot="readiness-stage"]').filter({ hasText: "Story themes" });
  await expect(row).toHaveCount(1);
  await expect(row, "`compute-themes` succeeded and clustered nothing — that is a result, and its four siblings already say so").toContainText("none found");
});

// ── #535-surviving: EVERY DENOMINATOR NAMES ITS BASE ─────────────────────────────────────────────────
// The rail's first row read `8 families · 242 characters` on a 327-character library. 242 is the one number
// the surface never accounts for, and 85 characters in no visual family is a fact a reader can act on.

test("#535: the visual-families row names the base its count is out of", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const row = component.locator('[data-slot="readiness-stage"]').filter({ hasText: "Visual families" });
  await expect(row).toHaveCount(1);
  await expect(
    row,
    `${CLUSTERED.toString()} of ${CHARACTERS.toString()} — the ${UNFAMILIED.toString()} unfamilied characters are derivable from the row itself`,
    // No `toLocaleString` here (the `no-raw-intl-time` gate bans raw Intl by the back door, and it is
    // right to: the component groups through ONE fixed `Intl.NumberFormat`, and a test that re-derives
    // the grouping with a second formatter is asserting its own copy of the rule). Both figures are
    // three digits, which this locale does not group, so the plain numerals ARE the rendered strings.
  ).toContainText(`${CLUSTERED.toString()} of ${CHARACTERS.toString()}`);
});

// …AND THE DENOMINATOR DID NOT COST THE ROW ITS NAME (#535 N1, the regression the fix above caused). With
// the datum grown to "8 families · 242 of 327 characters" and the row spelled `label: truncate` beside
// `datum: shrink-0`, the only thing that could give was the LABEL: "Visual families" rendered "Visu…" at
// the 1280px context-closed width. The rail's whole job is naming what has and has not run.
test("#535 N1: no readiness row ellipsises the PASS NAME to fit its measurement", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const cut = await page.locator('[data-slot="readiness-stage"]').evaluateAll((rows) =>
    rows.flatMap((row) => {
      const label = row.querySelector("span");
      return label !== null && label.scrollWidth > label.clientWidth + 1 ? [label.textContent ?? ""] : [];
    }),
  );
  expect(cut, "a pass whose name is cut is the one row on the surface a first-timer cannot re-derive").toEqual([]);
});

// ── #553 / [P1-1]: THE ECONOMICS SECTION CHARTS WHAT ITS DATA CARRIES ────────────────────────────────
// 30 routes, one of which reports a dollar cost. The old guard tested SPEND, so this whole library's
// economics rendered as one bar reading $0.08 — full width, in accent orange, the visual weight saying
// "large" about the smallest number on the page — with 11,321 generations and 8M tokens rendered nowhere.

test("#553: model economics renders the COMPLETE quantities over mostly-null cost (P1-1)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  await expect(component.getByRole("heading", { name: "Model economics" })).toBeVisible();
  // The chart's own text equivalent is the honest read of a canvas series (`LabeledChartFrame` renders the
  // series as a visually-hidden table; the bars themselves are pixels).
  const table = component.getByRole("table", { name: BUSIEST_ROUTES });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row"), "the routes are ranked by a quantity every row carries, not by the one 1-in-30 of them do").not.toHaveCount(1);
  // …and the coverage of the metric that IS mostly missing is stated rather than implied by its absence.
  // N6: the clause NAMES the route it is about. The one priced route is index 17, which the 12-bar head
  // never draws — so "cost recorded for 1 of 30 routes" pointed at a row no control on this page reaches.
  await expect(component.getByText(new RegExp(`recorded across ${PAID_ROUTES.toString()} of ${ROUTES.length.toString()} routes`))).toBeVisible();
  await expect(component.getByText("$0.08 recorded across", { exact: false })).toBeVisible();
  await expect(component.getByText("model-17", { exact: false })).toBeVisible();
});

// ── N7: A FAMILY PLATE'S MEMBER RUN ENDS AT A NAME, NEVER MID-NAME ───────────────────────────────────
// The gloss joined EVERY member name and let `truncate` cut it, which on the populated library ellipsised
// mid-name on 8 of 8 plates — a column whose last word is always a fragment. The fixture that shows it is
// the POPULATED one: the 12-character arm's two short names fit, which is why the #256 clipping fence has
// been green through the whole defect.
test("N7: the family plates name a bounded member run and COUNT the rest", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const glosses = await page
    .locator('[data-corpus-focal="familyMap"] .grid')
    .evaluate((grid) =>
      [...grid.querySelectorAll("span")]
        .filter((span) => (span.textContent ?? "").includes(" members · "))
        .map((span) => ({ text: span.textContent ?? "", clipped: span.scrollWidth > span.clientWidth + 1 })),
    );

  expect(glosses.length, "every plate carries a member gloss").toBe(FAMILY_SIZES.length);
  expect(
    glosses.filter((gloss) => gloss.clipped).map((gloss) => gloss.text),
    "not one gloss may be cut — an ellipsis mid-name is the defect, and the count is what replaces the run",
  ).toEqual([]);
  // The largest family names two and counts the other 48, rather than trailing off inside a name.
  await expect(component.getByText(`${LARGEST_FAMILY.toString()} members ·`, { exact: false }).first()).toContainText("+");
});

// ── #557 / [P2-3]: THE KEYWORD CHART IS CAPPED AND SAYS SO ───────────────────────────────────────────
// 50 bars over a 6→2 spread measured 1,616px of canvas — 45% of the page, 28.69% accent in the worst 800px
// viewport against a 10% cap — for a series in which no bar is distinguishable from its neighbour.
/** The visible series ceiling. More than this is a wall; the denominator carries what was left out. */
const KEYWORD_BAR_CAP = 12;

test("#557: the keyword chart caps its series and states the denominator (P2-3)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const rows = component.getByRole("table", { name: "Top keywords" }).locator("tbody tr");
  await expect(rows).toHaveCount(KEYWORD_BAR_CAP);
  await expect(component.getByText(new RegExp(`${KEYWORD_BAR_CAP.toString()} of ${KEYWORDS.length.toString()}`))).toBeVisible();
});

// ── #556: THE CANVAS AREA IS THE ATTRIBUTED CAUSE OF THE 287ms ENTRY BLOCK ──────────────────────────
// `motion-audit --goto corpus` on the populated library: worst blocking 287ms against a 50ms budget, 4
// LoAFs with style/layout in-frame, and the in-frame script named `graphic-KEKgKdWt.js` — ECharts. The
// empty arm measured 15ms. ATTRIBUTION BEFORE OPTIMIZATION (#489's standard, and no memoization theater):
// ECharts' cost on this surface is a function of CANVAS AREA and series count, and `BarList` derives its
// height arithmetically as `items.length * 32 + 16`. At 50 keyword bars that is 1,616px — which is the
// EXACT canvas height the sweep measured (869×1,616), so the 50-bar keyword chart is not a suspect, it is
// identified. The 142-route economics table was the second un-capped series on the same surface.
//
// This pin is the geometric half, measured in the CT browser rather than inferred: total ECharts canvas
// area on the settled surface. It is what the fix moves, and it is checkable without a profiler — the
// wall-clock half belongs to `motion-audit` on a populated live stack, which a worktree cannot serve.
/** The canvas budget, in px of HEIGHT summed across every chart on the overview. The pre-fix surface drew
 *  1,616 (keywords) + 4,544 (142 routes, had the spend guard not been hiding them) on one page; two capped
 *  12-bar series is 800. The ceiling is deliberately loose — this pins the ORDER OF MAGNITUDE, which is
 *  what the 19× blocking regression was made of, not a pixel. */
const CANVAS_HEIGHT_BUDGET_PX = 1200;

test("#556: the overview's chart canvases stay inside a budget (the 287ms attribution)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);
  // SETTLED for the CHARTS specifically: the keyword series is a below-fold deferred read, so the focal
  // island alone does not prove its canvas exists yet.
  await expect(component.getByRole("table", { name: "Top keywords" })).toBeAttached();

  const canvases = await component
    .locator("canvas")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({ height: Math.round(node.getBoundingClientRect().height), width: Math.round(node.getBoundingClientRect().width) })),
    );
  const total = canvases.reduce((sum, box) => sum + box.height, 0);
  expect(total, `chart canvas heights: ${canvases.map((box) => `${box.width.toString()}x${box.height.toString()}`).join(", ")}`).toBeLessThan(
    CANVAS_HEIGHT_BUDGET_PX,
  );
});

// ── #557 / [P2-4]: "NEVER PLAYED" STATES ITS COUNT ──────────────────────────────────────────────────
// 204 of 327 characters — 62% of the library — rendered as eight names under a bare heading, with no
// denominator anywhere. A reader concludes they have eight unplayed cards.

test("#557: the never-played section states how many there are (P2-4)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  await expect(component.getByRole("list", { name: "Never played characters" })).toBeVisible();
  await expect(
    component.getByText(new RegExp(`${UNUSED.length.toString()} of ${CHARACTERS.toString()}`)),
    "the count is the actionable fact, and the list is windowed",
  ).toBeVisible();
});

// ── #557 / [P2-1]: ONE FAMILY, ONE NAME ─────────────────────────────────────────────────────────────
// The CONTENT plate for the unlabelled family printed a 120-char run of its members' names while the
// Archetypes tab 30px to its right called the same family "Unanalysed portraits". The plate's label and
// gloss slots were inverted relative to its seven siblings.

test("#557: the unlabelled family plate carries the name its sibling surface gives it (P2-1)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const island = component.locator('[data-corpus-focal="familyMap"]');
  await expect(island.getByText(UNLABELLED_FAMILY, { exact: true })).toBeVisible();
  // …and the member names it displaced live where every other plate keeps them: the gloss.
  await expect(island.getByText(UNLABELLED_FAMILY_GLOSS), "the member count and the names ride the second line, as on the seven labelled plates").toBeVisible();
});

// ── #557 / [P2-2] + #536: THE GEM SHELF'S SORT IS VISIBLE AS A DATUM ────────────────────────────────
// The shelf ranks by message volume × how long quiet and BARS token totals, so at 327 characters the bars
// visibly ascend down a descending list. The report's sanctioned arm: render the rank ordinal, so the
// sequence a reader is looking at is itself the datum rather than a claim the numbers contradict.

test("#536: each gem tile carries its rank, so the order is a stated quantity (P2-2)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const tiles = component.getByRole("list", { name: "Invested but quiet characters" }).getByRole("listitem");
  await expect(tiles).toHaveCount(GEMS.length);
  const names = await Promise.all(GEMS.map(async (_gem, index) => tiles.nth(index).getByRole("button").first().textContent()));
  expect(
    names.map((name) => LEADING_RANK.exec((name ?? "").trim())?.[0] ?? ""),
    "every tile leads with its rank, so the sequence a reader sees IS the datum the shelf sorts on",
  ).toEqual(GEMS.map((_gem, index) => (index + 1).toString()));
});

// ── #536-surviving / [P3-1]: THE PROSE IS BOUNDED BY THE READING MEASURE ────────────────────────────
// `design-audit` measured 145 chars/line on this surface's own prose against the 65-75ch law.
//
// THE MEASUREMENT IS THE DETECTOR'S OWN, deliberately. `--reading-measure` is `75ch` — a `ch` count, not a
// px length — so comparing a bounding box against `parseFloat` of that token compares a width to the number
// 75 and indicts every paragraph on the page. `ch` means the advance of "0" in the element's OWN computed
// font, which is what `tooling/src/ui-audit/ops/walker/census-text.ts` measures via canvas `measureText`
// after #464 caught a guessed `fontSize * 0.5` ratio over-estimating every measure by ~15%. Same method
// here, so this pin and `design-audit` are denominated identically and cannot disagree.
/** The house measure (`--reading-measure: 75ch`, skill §2). The detector's own ceiling is 85. */
const READING_MEASURE_CH = 75;
/** Below this the "line" is a label, not prose — the detector's own floor, so short rows never fire. */
const PROSE_TEXT_MIN_CHARS = 80;

test("#536: the overview's prose is capped at the reading measure (P3-1)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const overrun = await component.locator('[data-testid="corpus-home-surface"]').evaluate(
    (root, limits) => {
      const context = globalThis.document.createElement("canvas").getContext("2d");
      if (context === null) {
        throw new Error("no 2d context — the ch advance cannot be measured, so this pin has no verdict");
      }
      // Every prose paragraph the surface composes. `Text` renders `<p data-slot="text">`; a chart frame's
      // heading is a different slot and is a label, not prose.
      return [...root.querySelectorAll('p[data-slot="text"]')].flatMap((node) => {
        const text = node.textContent ?? "";
        const style = globalThis.getComputedStyle(node);
        if (text.length <= limits.minChars) {
          return [];
        }
        context.font = style.font === "" ? `${style.fontSize} ${style.fontFamily}` : style.font;
        const advance = context.measureText("0").width + (Number.parseFloat(style.letterSpacing) || 0);
        const chars = advance > 0 ? node.getBoundingClientRect().width / advance : 0;
        return chars > limits.maxChars ? [{ chars: Math.round(chars), text: text.slice(0, 48) }] : [];
      });
    },
    { maxChars: READING_MEASURE_CH, minChars: PROSE_TEXT_MIN_CHARS },
  );
  expect(overrun, "prose past the reading measure is the 145-chars/line finding").toEqual([]);
});
