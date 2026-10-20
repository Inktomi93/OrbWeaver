// CT: the corpus overview's POPULATED arm — the same surface at 320 characters / 900 chats (issues #553 #535 #536 #556 #557).
// Volume findings only a populated library reaches; the composition pins live in corpus-home-surface.ct.tsx.
// Own file: playwright-ct collides two CT files importing one story name, and this one owns CorpusHomePopulatedStory.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { corpusGroupingProvenance } from "@orb/testkit/node/corpus-source.ts";
import { makeCatalogStats } from "@orb/testkit/node/factories/discovery-view.ts";
import type { TrpcRoutes, TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { userSettingsView } from "@orb/testkit/node/user-settings-view.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import { CorpusHomePopulatedStory } from "../_ct-stories.tsx";
import { CORPUS_VIEWER_ROUTE, settled } from "./_corpus-home-support.ts";

// ── THE POPULATED FIXTURE ─────────────────────────────────────────────────────────────────────────────
// Synthetic populations exercise count denominators and bounded lists
// (212 clustered of 320 owned, one labelled cost among many null ones, more keywords than any cap).

const CHARACTERS = 320;
const DISTILLED = 300;
/** The synthetic families leave an explicit unclassified population. */
const FAMILY_SIZES = [48, 36, 32, 28, 24, 20, 16, 8];
const CLUSTERED = FAMILY_SIZES.reduce((total, size) => total + size, 0);
/** The biggest family — the plate whose member run is longest, i.e. the N7 worst case. */
const LARGEST_FAMILY = Math.max(...FAMILY_SIZES);
const UNFAMILIED = CHARACTERS - CLUSTERED;

/** The server's own name for the family whose portraits the VL pass could not classify
 *  (`image-analytics/retrieve.ts`). The Archetypes tab renders exactly this string; the CONTENT plate
 *  rendered its members' names instead, which is [P2-1]. */
const UNLABELLED_FAMILY = "Unanalysed portraits";
/** The gloss the unlabelled plate keeps once its label slot stops carrying the member run. */
const UNLABELLED_FAMILY_GLOSS = /16 members/;
/** The economics chart's accessible name — matched loosely so the denominator may ride the heading. */
const BUSIEST_ROUTES = /Busiest routes/;
/** The LEADING digits of a tile's text — where the rank ordinal has to be. Anchored rather than split on
 *  whitespace: adjacent spans concatenate with no separator in `textContent` (`1OOrla510,000`), so a
 *  whitespace split reads the whole tile as one token and the assertion never sees the rank it found. */
const LEADING_RANK = /^\d+/u;

const POP_FAMILIES: TrpcWireOutput<"discovery.visualArchetypes"> = FAMILY_SIZES.map((size, index) => ({
  ...corpusGroupingProvenance(index === 6 ? UNLABELLED_FAMILY : `Family ${index}`),
  label: index === 6 ? UNLABELLED_FAMILY : `Family ${index}`,
  genre: null,
  tone: null,
  // The seventh plate is the UNLABELLED arm: no art facets at all — the state that used to make the plate
  // title itself with a run of member names while its sibling surface called the same family
  // "Unanalysed portraits" ([P2-1]). The facets stay null so the fixture keeps reproducing that state.
  analysedMembers: index === 6 ? 0 : size,
  artStyle: index === 6 ? null : "painterly",
  palette: index === 6 ? null : "warm",
  mood: index === 6 ? null : "playful",
  size,
  members: Array.from({ length: size }, (_, seat) => ({
    characterId: `character_${index}_${seat}`,
    name: `Member ${index}-${seat}`,
    avatarHash: null,
  })),
  model: "Qwen/Qwen3-VL-Embedding-2B",
}));

/** 50 keywords, counts 6 → 2 — a synthetic spread, where every bar is 72-100% of its track. */
const KEYWORD_HEAD_COUNT = 6;
const KEYWORDS = Array.from({ length: 50 }, (_, index) => ({ keyword: `keyword-${index}`, count: Math.max(2, KEYWORD_HEAD_COUNT - Math.floor(index / 12)) }));

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
  genTimeSamples: 400 - index * 10,
  costUsd: index === 17 ? 0.12 : null,
}));
const PAID_ROUTES = ROUTES.filter((route) => route.costUsd !== null).length;

const UNUSED = Array.from({ length: 200 }, (_, index) => ({
  characterId: `character_unused_${index}`,
  name: `Unplayed ${index}`,
  avatarHash: null,
}));

/** Three gems in the verb's RANK order (message volume × how long quiet) whose token totals ASCEND — the
 *  synthetic totals keep bars climbing while the rank falls. */
const GEMS: TrpcWireOutput<"discovery.forgottenGems"> = [
  {
    characterId: "character_orla",
    name: "Orla",
    avatarHash: null,
    messageCount: 900,
    lastActiveAt: 1,
    tokensOut: 510_000,
    tokensOutProvenance: "measured",
    costUsd: null,
  },
  {
    characterId: "character_aveline",
    name: "Aveline",
    avatarHash: null,
    messageCount: 800,
    lastActiveAt: 2,
    tokensOut: 540_000,
    tokensOutProvenance: "measured",
    costUsd: null,
  },
  {
    characterId: "character_briar",
    name: "Briar",
    avatarHash: null,
    messageCount: 700,
    lastActiveAt: 3,
    tokensOut: 570_000,
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
    funderUserId: "user_me",
    mode: "singular",
    lane: "sweep",
    dependsOn: null,
    createdAt: 1_704_067_200_000,
    updatedAt: 1_704_067_200_000,
    scheduledAt: 1_704_067_200_000,
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
    funderUserId: "user_me",
    mode: "singular",
    lane: "sweep",
    dependsOn: null,
    createdAt: 1_704_052_800_000,
    updatedAt: 1_704_052_800_000,
    scheduledAt: 1_704_052_800_000,
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
    funderUserId: "user_me",
    mode: "singular",
    lane: "sweep",
    dependsOn: null,
    createdAt: 1_704_060_000_000,
    updatedAt: 1_704_060_000_000,
    scheduledAt: 1_704_060_000_000,
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
    coverage: { characters: CHARACTERS, digests: 2400, segments: 2000 },
    sceneThemes: [],
    arcThemes: [],
    duplicateCounts: { characters: 1, chats: 1, identicalCharacterPairs: 3 },
  },
  // `totalCharacters` is the base the distilled count is out of (#535) — the same 320 `discovery.home`
  // reports, because both are `count(*)` over the owner's characters. A fixture that omitted it would let
  // a census assertion pass off a `?? 0` fallback.
  "discovery.catalog": makeCatalogStats({ totalDistilled: DISTILLED, totalCharacters: CHARACTERS, genres: [], tones: [], topTags: [] }),
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

// ── #555 / [P1-3]: THE RAIL REPORTS THE LIBRARY'S STATE, NOT AN ARCHIVED CRASH ────────────────────────
// `lastFailure()` picked the newest terminal row with no test for a later success, so a two-hour-old
// `worker_died` was announced forever — under five green checks, beside a button inviting a 320-character
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
// The rail's first row read `8 families · 212 characters` on a 320-character library. 242 is the one number
// the surface never accounts for, and 108 characters in no visual family is a fact a reader can act on.

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
// the datum grown to "8 families · 212 of 320 characters" and the row spelled `label: truncate` beside
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
// economics rendered as one bar reading $0.12 — full width, in accent orange, the visual weight saying
// "large" about the smallest number on the page — while complete generation and token quantities were not shown.

test("#553: model economics renders the COMPLETE quantities over mostly-null cost (P1-1)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  await expect(component.getByRole("heading", { name: "Models by genre" })).toBeVisible();
  // The chart's own text equivalent is the honest read of a canvas series (`LabeledChartFrame` renders the
  // series as a visually-hidden table; the bars themselves are pixels).
  const table = component.getByRole("table", { name: BUSIEST_ROUTES });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row"), "the routes are ranked by a quantity every row carries, not by the one 1-in-30 of them do").not.toHaveCount(1);
  // …and the coverage of the metric that IS mostly missing is stated rather than implied by its absence.
  // N6: the clause NAMES the route it is about. The one priced route is index 17, which the 12-bar head
  // never draws — so "cost recorded for 1 of 30 routes" pointed at a row no control on this page reaches.
  await expect(component.getByText(new RegExp(`reported across ${PAID_ROUTES.toString()} of ${ROUTES.length.toString()} routes`))).toBeVisible();
  await expect(component.getByText("$0.12 reported across", { exact: false })).toBeVisible();
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

  await expect
    .poll(async () => {
      const glosses = await page
        .locator('[data-corpus-focal="familyMap"] .grid')
        .evaluate((grid) =>
          [...grid.querySelectorAll("span")]
            .filter((span) => /^\d+ members(?: · |$)/u.test(span.textContent ?? ""))
            .map((span) => ({ text: span.textContent ?? "", clipped: span.scrollWidth > span.clientWidth + 1 })),
        );
      return { count: glosses.length, clipped: glosses.filter((gloss) => gloss.clipped).map((gloss) => gloss.text) };
    })
    .toEqual({ count: FAMILY_SIZES.length, clipped: [] });
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

  const label = `Top keywords · ${KEYWORD_BAR_CAP.toString()} of ${KEYWORDS.length.toString()} keywords · ${KEYWORD_HEAD_COUNT.toString()} uses each`;
  const chart = component.getByTestId("corpus-keyword-explorer").locator('[data-slot="bar-list"]');
  await expect(chart.getByText(label, { exact: true })).toBeVisible();
  const rows = chart.getByRole("table", { name: label, exact: true }).locator("tbody tr");
  await expect(rows).toHaveCount(KEYWORD_BAR_CAP);
  await expect(chart.getByRole("img", { name: label, exact: true })).toBeVisible();
  await expect(chart.locator("canvas")).toBeVisible();
  await expect(chart.locator('[data-slot="chart-loading"]')).toHaveCount(0);
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
// 200 of 320 characters — rendered as eight names under a bare heading, with no
// denominator anywhere. A reader concludes they have eight unplayed cards.

/** The rows Never played shows before Show all. */
const NEVER_PLAYED_HEAD_ROWS = 8;

// Never played flows in the page: a short head, no scroller of its own, and "Show all" for the rest.
test("the never-played list flows with the page and reveals the rest on Show all", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const list = component.getByRole("list", { name: "Never played characters" });
  await expect(list).toBeVisible();
  // Head only: fewer rows than the library holds, and none of them in a scroller of their own.
  await expect(list.getByRole("listitem")).toHaveCount(NEVER_PLAYED_HEAD_ROWS);
  const holdsAllRows = (): Promise<boolean> => list.evaluate((el) => el.scrollHeight <= el.clientHeight);
  await expect.poll(holdsAllRows).toBe(true);

  await component.getByRole("button", { name: /^Show all/u }).click();
  await expect(list.getByRole("listitem")).toHaveCount(UNUSED.length);
  await expect.poll(holdsAllRows).toBe(true);
});

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

test("#557: the unlabelled family plate carries the name its sibling surface gives it (P2-1)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_VIEWER_ROUTE, ...POPULATED });
  const component = await mount(<CorpusHomePopulatedStory />);
  await settled(page);

  const island = component.locator('[data-corpus-focal="familyMap"]');
  await expect(island.getByRole("button", { name: "Member 6-0 · Member 6-1 +14 more", exact: true })).toBeVisible();
  await expect(island.getByText("Not analysed yet", { exact: true })).toBeVisible();
  await expect(island.getByText(UNLABELLED_FAMILY_GLOSS), "the member count stays beside the family identity").toBeVisible();
});

// ── #557 / [P2-2] + #536: THE GEM SHELF'S SORT IS VISIBLE AS A DATUM ────────────────────────────────
// The shelf ranks by message volume × how long quiet and BARS token totals, so at 320 characters the bars
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
