// CT: the Analytics OVERVIEW dashboard's RECOMPUTE affordance — the client half of the direct
// `stats.reconcile` twin (the queue keeps the all-owners bulk sweep). Drives the PRODUCTION path: the five
// suspense reads seed the dashboard, the button fires the real mutation, and the settle invalidates the
// stats router root so the freshness line re-reads. Asserts the wire actually fires — a "Recompute now"
// button that renders but dispatches nothing is exactly the failure this covers.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { readCanvasBandInk, solidColumns } from "../../../../support/browser/canvas-ink.ts";
import { readPhantomScrollers } from "../../../../support/browser/scroll-containing-block.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { AnalyticsOverviewSurfaceListModeStory, AnalyticsOverviewSurfaceShortStory, AnalyticsOverviewSurfaceStory } from "../_ct-stories.tsx";
import { ACCOUNTING_CASES } from "../fixtures.ts";

const COMPUTED_AT = 1_750_000_000_000;
/** A four-digit year — the tell that the `title=` carries the ABSOLUTE stamp, whatever the runner's locale. */
const ABSOLUTE_STAMP = /\d{4}/;
/** The exact failure mode #296 covers: a field-name drift leaves the rendered value literally "undefined". */
const RENDERED_UNDEFINED = /undefined/i;

const OVERVIEW = {
  variantMessages: 6,
  tokensIn: 1000,
  tokensOut: 2000,
  swipeWords: 30_200_000,
  avgGenMs: 900,
  p50GenMs: 800,
  p90GenMs: 1500,
  avgTtftMs: 300,
  throughputTps: 12.5,
  cacheHitRate: 0.25,
  reasoningRate: 0.1,
  // #184: the rollups have carried `reasoningMs` on three tables and three views with NO client reader at
  // all (0 hits over 981 client files, two methods) — the read end of a metric whose write end was equally
  // half-wired. 45s renders as the same duration voice as "Time generating".
  reasoningMs: 45_000,
};

const WRAPPED = {
  characters: 3,
  chats: 8,
  words: 4200,
  replies: 42,
  swipes: 5,
  forkedChats: 1,
  costUsd: 1.25,
  genTimeMs: 90_000,
  topCharacter: null,
  firstChatAt: COMPUTED_AT - 400 * 86_400_000,
  avgSwipeDepth: 1.44,
  swipeRate: 0.25,
};

const NOON_MS = 12 * 3_600_000;
const DAY_MS = 86_400_000;
/** One noon-UTC bucket per active day — noon lands on the same calendar day in every zone a runner uses. */
function timelineDay(dayStart: number): {
  bucketStart: number;
  chatsCreated: number;
  userTurns: number;
  assistantTurns: number;
  swipes: number;
  tokensIn: null;
  tokensOut: null;
  tokensInProvenance: "unrecorded";
  tokensOutProvenance: "unrecorded";
  genTimeMs: number;
  messageDatesApprox: boolean;
} {
  return {
    bucketStart: dayStart + NOON_MS,
    chatsCreated: 0,
    userTurns: 1,
    assistantTurns: 1,
    swipes: 0,
    tokensIn: null,
    tokensOut: null,
    tokensInProvenance: "unrecorded",
    tokensOutProvenance: "unrecorded",
    genTimeMs: 0,
    messageDatesApprox: false,
  };
}
// Four active days, three of them consecutive: the Rhythm band must read 4 and 3d off the real fold.
const JULY_1 = Date.UTC(2026, 6, 1);
const TIMELINE = [JULY_1, JULY_1 + DAY_MS, JULY_1 + 2 * DAY_MS, JULY_1 + 9 * DAY_MS].map(timelineDay);

const MOMENTUM: { characterId: string; name: string; bucketStart: number; replies: number }[] = [];

/** One character's replies in one bucket. Mid-month noon UTC unless stated: the same month in every zone. */
function replies(
  characterId: string,
  name: string,
  bucketStart: number,
  count: number,
): { characterId: string; name: string; bucketStart: number; replies: number } {
  return { characterId, name, bucketStart, replies: count };
}
const MID_JULY = Date.UTC(2026, 6, 15, 12, 0);
const MID_AUGUST = Date.UTC(2026, 7, 15, 12, 0);

for (const width of [320, 720] as const) {
  test.describe(`dashboard accounting at ${width}`, () => {
    test.use({ hasTouch: width === 320, viewport: { width: width === 320 ? 320 : 1280, height: 844 } });
    for (const accounting of ACCOUNTING_CASES) {
      test(`accounting provenance: ${accounting.name}`, async ({ mount, page }) => {
        await routeTrpc(page, {
          "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
          "stats.overview": () => ({
            ...OVERVIEW,
            tokensIn: accounting.tokens,
            tokensOut: accounting.tokens,
            tokensInProvenance: accounting.provenance,
            tokensOutProvenance: accounting.provenance,
          }),
          "stats.wrapped": () => ({ ...WRAPPED, costUsd: accounting.cost }),
          "stats.timeseries": () => TIMELINE,
          "stats.momentum": () => MOMENTUM,
        });
        const component = await mount(<AnalyticsOverviewSurfaceStory width={width} />);
        for (const label of ["Tokens in", "Tokens out"]) {
          const figure = component.locator('[data-slot="stat-figure"]', { hasText: label });
          await expect(figure.locator('[data-slot="stat-figure-value"]')).toHaveText(accounting.tokenValue);
          await expect(figure.locator('[data-slot="stat-figure-label"]')).toHaveText(`${label} · ${accounting.label}`);
        }
        const spend = component.locator('[data-slot="stat-figure"]', { hasText: "Cost" });
        await expect(spend.locator('[data-slot="stat-figure-value"]')).toHaveText(accounting.costValue);
        await expect(spend.locator('[data-slot="stat-figure-label"]')).toHaveText(accounting.cost === null ? "Cost · Unavailable" : "Cost");
        await expect(component.getByText("Whole library · Aggregate only", { exact: true })).toBeVisible();
        await expect(component.getByText("~ marks estimates", { exact: false }).first()).toBeVisible();
        await expect(component.getByText("Reasoning (of replies + swipes)", { exact: true })).toBeVisible();
        await component.getByRole("button", { name: "Details" }).click();
        await expect(component.getByText("Speed (tokens per second)", { exact: true })).toBeVisible();
        await expect.poll(() => component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      });
    }
  });
}

const SHOW_LIST_PANEL_RE = /Show list panel/u;

/** The report's own live shape: a small rise beside a large fall. Independently auto-scaled, +10 and −184
 *  drew as near-identical full-width bars in the same colour. */
const MOMENTUM_LOPSIDED = [replies("character_ct_falling", "Kate", MID_JULY, 184), replies("character_ct_rising", "Morgatha", MID_AUGUST, 10)];

test("the dashboard's Recompute now button fires stats.reconcile", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
    "stats.reconcile": () => ({ owners: 1, characters: 3, buckets: 4, models: 2, computedAt: COMPUTED_AT + 1000 }),
  });

  const component = await mount(<AnalyticsOverviewSurfaceStory />);

  const recompute = component.getByRole("button", { name: "Recompute now" });
  await expect(recompute).toBeVisible();
  await recompute.click();

  await expect.poll(() => trpc.count("stats.reconcile")).toBe(1);
  // The settle re-reads the dashboard (the invalidation covers the whole stats router root).
  await expect.poll(() => trpc.count("stats.freshness")).toBeGreaterThan(1);
});

// ── The reasoning metric has a rendered home (#184) ───────────────────────────────────────────────
// `reasoningMs` is computed into three rollup tables and exposed on three views, and NOTHING in the client
// read it (0 hits over 981 files by two methods) — the mirror of the write end's missing producer. It lands
// beside "Time generating"/"Reasoning %", in the same duration voice, so the number a thinking model
// produces is visible where every other economics figure is.
test("the Tokens and cost band renders the reasoning WINDOW beside the reasoning rate", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
  });

  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  // SETTLED: the dashboard only renders its bands once all four suspense reads have landed.
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  const figure = component.locator('[data-slot="stat-figure"]', { hasText: "Time reasoning" });
  await expect(figure).toHaveCount(1);
  await expect(figure.locator('[data-slot="stat-figure-value"]')).toHaveText("45.0s");
  // The rate is a DIFFERENT question (how often it reasons) and must survive beside the duration.
  await expect(component.locator('[data-slot="stat-figure"]', { hasText: "Reasoning" }).first()).toBeVisible();
});

// ── The Rhythm band renders the fixture's real values, never `undefined` (#296) ─────────────────────
// The band is folded on the client from the `stats.timeseries` buckets. Pin the actual rendered values so
// a drift in the wire shape or the fold fails HERE instead of in a screenshot nobody looked at.
test("the Rhythm band renders the timeline fixture's real values, never 'undefined'", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
  });

  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  const activeDays = component.locator('[data-slot="stat-figure"]', { hasText: "Active days" });
  await expect(activeDays.locator('[data-slot="stat-figure-value"]')).toHaveText("4");

  const streak = component.locator('[data-slot="stat-figure"]', { hasText: "Longest streak" });
  await expect(streak.locator('[data-slot="stat-figure-value"]')).toHaveText("3d");
  await expect(streak.locator('[data-slot="stat-figure-value"]')).not.toHaveText(RENDERED_UNDEFINED);
});

// ── The readout states what it is a readout OF (side-eye rail-analytics 2026-08-19) ────────────────
// P1a: `Cache hits` divided cacheRead by (cacheRead + cacheWrite). Only Anthropic reports cache WRITES,
// so on every other backend the tile was pinned at exactly 100% — a constant wearing a percentage's
// clothes. The live wire: 32,217 read / 0 write / 1,664,309 in, rendered "100%" where the true share of
// input was 1.9%. The denominator is now tokensIn, and it says so in the label.
test("the cache tile names its denominator and reports the INPUT share, not a constant", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => ({ ...OVERVIEW, cacheHitRate: 0.019_36 }),
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  const figure = component.locator('[data-slot="stat-figure"]', { hasText: "Cache hits (of input)" });
  await expect(figure).toHaveCount(1);
  await expect(figure.locator('[data-slot="stat-figure-value"]')).toHaveText("2%");
});

// P1a/P2a: an imported library records no cache tokens and no usage at all. It used to read `100%`,
// `0 tok`, `$0.00` — three assertions about measurements that never happened.
test("an unmeasured figure renders an em dash, never a zero", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => ({ ...OVERVIEW, cacheHitRate: null, tokensIn: null, tokensOut: null }),
    "stats.wrapped": () => ({ ...WRAPPED, costUsd: null }),
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  await Promise.all(
    ["Cache hits (of input)", "Tokens in", "Tokens out", "Cost"].map(async (label) => {
      const value = component.locator('[data-slot="stat-figure"]', { hasText: label }).locator('[data-slot="stat-figure-value"]');
      await expect(value).toHaveText("—");
    }),
  );
  // …and the surface TEACHES the dash rather than leaving a reader to guess it means zero.
  await expect(component.getByText("A dash means unavailable", { exact: false }).first()).toBeVisible();
});

// P2d: "Words" meant user+assistant here and assistant-only on the drill, under the same label; and
// 30.2M words of unselected swipes were excluded with no mention, right beside a "Swipes" tile.
test("the Words definition and the swipe-word exclusion are stated where they are rendered", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  await expect(component.getByText("Words counts your turns and the replies you kept", { exact: false })).toBeVisible();
  await expect(component.getByText("30.2M words in swipes you didn't keep", { exact: false })).toBeVisible();
});

// P2e: `2026-07 → 2026-08` is a machine sort key, printed in a column whose other time text is relative
// prose ("Updated 4h ago"). One vocabulary per column: prose months, and the exact stamp in `title=`.
test("the momentum band names its months and the freshness line carries the absolute stamp", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => [replies("character_ct_rising", "Morgatha", MID_JULY, 1), replies("character_ct_rising", "Morgatha", MID_AUGUST, 1)],
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  await expect(component.getByText("July 2026 → August 2026")).toBeVisible();
  await expect(component.getByText("2026-07", { exact: false })).toHaveCount(0);
  await expect(component.getByText("Updated", { exact: false })).toHaveAttribute("title", ABSOLUTE_STAMP);
});

// ── P1d: RISING vs FALLING IS A COMPARISON, OR IT IS THE SAME PICTURE TWICE ───────────────────────────
// Two <BarList>s side by side, each auto-scaled to its OWN maximum, each in the accent colour, with the
// sign living only in a bar-end label that narrow panes clip: +10 and −184 rendered as near-identical
// full-width orange bars (side-eye ANALYTICS 2026-08-19, P1d). The fix is at THIS call site — the surface
// is what knows the two columns belong to one reading — so the receipt is here, not on the primitive.
// Read from the FRAMEBUFFER: there is no DOM per bar.

/** How much longer the −184 bar must be than the +10 bar once they share one scale. The true ratio is
 *  18.4×; the floor is deliberately loose because ECharts rounds the axis maximum up to a nice value. */
const MIN_SHARED_SCALE_RATIO = 5;
/** ECharts' size-sensor swallows its first resize and debounces 60ms (#263) — settle before measuring. */
const CANVAS_SETTLE_MS = 400;

test("Rising and Falling share ONE value scale and read as different intents (P1d)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM_LOPSIDED,
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  // SETTLED: the dashboard renders its bands only once all four suspense reads have landed.
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  const rising = component.locator('[data-slot="bar-list"]').filter({ hasText: "Rising" });
  const falling = component.locator('[data-slot="bar-list"]').filter({ hasText: "Falling" });
  // The sign survives in TEXT regardless of pane width — the label alone never was enough, but it is
  // still the reading a screen reader gets, so it is pinned here too.
  await expect(falling.getByRole("table", { name: "Falling" }).getByRole("cell").first()).toHaveText("-184");
  await expect(rising.getByRole("table", { name: "Rising" }).getByRole("cell").first()).toHaveText("+10");

  await new Promise((resolve) => setTimeout(resolve, CANVAS_SETTLE_MS));
  const risingBand = await readCanvasBandInk(rising.locator("canvas"), 0.4, 0.6);
  const fallingBand = await readCanvasBandInk(falling.locator("canvas"), 0.4, 0.6);
  const risingBar = solidColumns(risingBand).length;
  const fallingBar = solidColumns(fallingBand).length;

  expect(risingBar).toBeGreaterThan(0);
  expect(fallingBar).toBeGreaterThanOrEqual(risingBar * MIN_SHARED_SCALE_RATIO);
  // …and the two columns are not the same picture in the same paint.
  expect(fallingBand.dominantColor).not.toBe(risingBand.dominantColor);
});

/** Park the `stats.reconcile` response until the returned release fires; everything else falls through to
 *  routeTrpc. Registered AFTER routeTrpc (later routes run first), the `route.fallback()` precedent. */
async function holdReconcile(page: Page): Promise<() => void> {
  // Definite-assignment: the executor runs synchronously, so `release` is bound before the route is added.
  let release!: () => void;
  const parked = new Promise<void>((resolve) => {
    release = (): void => resolve();
  });
  await page.route("**/api/trpc/**", async (route) => {
    if (!route.request().url().includes("stats.reconcile")) {
      await route.fallback();
      return;
    }
    await parked;
    await route.fallback();
  });
  return release;
}

test("the button is disabled while its own recompute is in flight", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
    "stats.reconcile": () => ({ owners: 1, characters: 3, buckets: 4, models: 2, computedAt: COMPUTED_AT + 1000 }),
  });
  const release = await holdReconcile(page);

  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await component.getByRole("button", { name: "Recompute now" }).click();

  // In flight: the affordance names its own state and cannot be fired again from THIS tab.
  const pending = component.getByRole("button", { name: "Recomputing…" });
  await expect(pending).toBeVisible();
  await expect(pending).toBeDisabled();

  release();
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeEnabled();
});

test("a raced recompute (CONFLICT) renders the honest notice, not a failure", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
    // What the server's per-user single-flight gate returns when another tab (or an earlier click) is
    // already rebuilding this owner's rollups.
    "stats.reconcile": () => trpcError({ code: "CONFLICT", message: "a recompute is already running" }),
  });

  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await component.getByRole("button", { name: "Recompute now" }).click();

  await expect(component.getByRole("status")).toHaveText("A recompute is already running — it'll finish on its own.");
  // The dashboard is intact and the affordance is usable again — a refusal is not a broken surface.
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeEnabled();
  await expect(component.getByRole("heading", { name: "All-time totals" })).toBeVisible();
});

// THE CONTAINING-BLOCK PIN (phantom-scroll CLASS sweep, 2026-08-14). The overview dashboard owns its scroll axis (`h-full min-h-0 overflow-y-auto overscroll-contain`), as do the three analytics tabs beside it.
// An `overflow` scroller only clips — and only absorbs the scrollable overflow of — an absolutely-positioned
// descendant whose CONTAINING BLOCK is inside it. A `position: static` scroller establishes none, so the
// `sr-only` boxes Base UI form primitives emit (`position: absolute` — NumberField's bounds announcer,
// Switch/Checkbox's hidden input, the combobox status line) resolve theirs further up and add their static
// positions to a POSITIONED ancestor's scrollable area instead. That is the owner's 2026-08-13 "scrolls past
// the end of its results" defect (fixed once for the settings pane region, swept as a class here), and
// `relative` on the scroller is the whole fix. `readPhantomScrollers` measures the MECHANISM document-wide —
// the SYMPTOM needs a positioned scrolling host, which is the settings shell CT's own story.
// HONEST LABEL: a FENCE, not a defect proof — measured GREEN against the pre-fix source, because this
// surface's CT story paints read-only content (no Base UI form primitive, so no `sr-only` absolute box
// exists to escape). The DEFECT PROOFS for this class are the preset-editor and character-editor pins,
// which red against HEAD. This fence is what stops the class coming back the day a form control lands
// in this pane — which is exactly how the settings pane acquired it.
test("no absolutely-positioned box escapes the analytics overview scroller (the containing-block pin)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  // SETTLED: the recompute verb only renders once all four suspense reads have landed.
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  expect(await readPhantomScrollers(page)).toEqual([]);
});

// #451: the top-character subtitle's two arms — "open the list" reads right while the list is collapsed and
// wrong once a reader docks it; and its collapsed wording must name the real
// affordance verbatim ("Show list panel", the topbar toggle) rather than "open the list" (WCAG 2.5.3).
test("the top-character subtitle names the real affordance while collapsed and drops it once the list is docked", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => ({ ...WRAPPED, topCharacter: { name: "Aveline", assistantTurns: 12 } }),
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
  });

  const component = await mount(<AnalyticsOverviewSurfaceListModeStory />);
  await component.getByRole("button", { name: "go to corpus" }).click();
  await expect(component.locator('[data-slot="ct-active-section"]')).toHaveText("section=corpus");
  await component.getByRole("button", { name: "collapse the list" }).click();
  await expect(component.getByText("Your most-played character — Show list panel to drill into any character")).toBeVisible();

  await component.getByRole("button", { name: "dock the list" }).click();
  await expect(component.getByText("Your most-played character", { exact: true })).toBeVisible();
  await expect(component.getByText(SHOW_LIST_PANEL_RE)).toHaveCount(0);
});

// ── #1200: the CONTENT region carries an inset, the Corpus precedent (`corpus-content.tsx`) ──────────
// The dashboard shipped with padding NOWHERE in its component tree — a 5-level DOM walk from the content
// region root read `padding: 0px` at every level, so every row rendered flush into the pane corner. The
// scroll-owning `[data-slot="analytics-content"]` Stack is where the inset now lives (Analytics' own
// surfaces own their scroll axis, unlike Corpus's CONTENT-level owner — see the surface's header comment).
test("the overview dashboard's content region carries a non-zero inset (#1200)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  const region = component.locator('[data-slot="analytics-content"]');
  const padding = await region.evaluate((el) => getComputedStyle(el).paddingTop);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): static CSS from the `padding="section"` prop, settled by the "Recompute now" visibility barrier above — it cannot change after mount.
  expect(padding).not.toBe("0px");
});

// ── #1727: the scroll box is the SURFACE'S, and the boundary now reserves its box ────────────────────
// The five Analytics mounts were refused a `reserveKey` on GEOMETRY: the settled body owned the scroll box,
// and the reservation wraps its settled child in an AUTO-HEIGHT measuring Stack, so `h-full` on a scroller
// under the boundary resolves to `auto`, the pane stops scrolling, and everything past the fold becomes
// unreachable (#1133, paid on `character.editor`). The box is hoisted above the boundary now, so these two
// arms are the pair that has to stay true together: the surface still scrolls, AND the boundary remembers.
//
// HONEST LABELS. The REMEMBER arm is a defect proof — red against HEAD, where no key exists and the store
// stays empty. The REACHABILITY arm is a FENCE against HEAD (an unkeyed boundary mounts no wrapper, so the
// old shape scrolled fine); its red is against the KEYED-BUT-UNHOISTED tree — the state this lane would have
// shipped by keying the mount without moving the box — which was measured red by hand before the hoist.

/** The surface-box store's persisted blob (`createPersistedStore`, localStorage — one key per device). */
const readSurfaceBoxBlob = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes("surface-box"));
    return key === undefined ? "" : (localStorage.getItem(key) ?? "");
  });

/** The remembered box for one surface id, 0 when the store has never seen it. */
const readRememberedBox = (page: Page, surfaceId: string): Promise<number> =>
  page.evaluate((id) => {
    const key = Object.keys(localStorage).find((k) => k.includes("surface-box"));
    const blob = key === undefined ? "{}" : (localStorage.getItem(key) ?? "{}");
    return (JSON.parse(blob) as { state?: { boxes?: Record<string, number> } }).state?.boxes?.[id] ?? 0;
  }, surfaceId);

test("#1727 the overview surface scrolls past the fold AND remembers its settled box under `analytics.overview`", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.timeseries": () => TIMELINE,
    "stats.momentum": () => MOMENTUM,
  });

  // The SHORT pane: the fold is a property of this story (240px) rather than of whatever the stub happens
  // to render, so "past the fold" means something deterministic.
  const component = await mount(<AnalyticsOverviewSurfaceShortStory />);
  // SETTLED: the recompute verb only renders once all four suspense reads have landed.
  await expect(component.getByRole("button", { name: "Recompute now" })).toBeVisible();

  const scroller = component.locator('[data-slot="analytics-content"]');
  // The hoisted box is a REAL scroller: its content exceeds its own height. Polled, not sampled — the
  // dashboard's charts settle their own geometry after the read lands.
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
  // …and it actually moves. Under the refused geometry `h-full` resolves to `auto`, the element grows to its
  // content, `scrollHeight === clientHeight`, and this assignment is a no-op at 0.
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // The user-visible half: the LAST thing the dashboard renders is on screen after that scroll.
  await expect(component.getByText("Not enough recent activity to compare months yet.")).toBeInViewport();

  // The reservation half: the settle measured the child back into the store under this surface's own key,
  // so the next boot paints the box instead of a one-line sentence.
  await expect.poll(() => readSurfaceBoxBlob(page)).toContain("analytics.overview");
  await expect.poll(() => readRememberedBox(page, "analytics.overview")).toBeGreaterThan(0);
});

test("an activity rollup without any replies has no reasoning ratio", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": { computedAt: COMPUTED_AT, stale: false, hasData: true },
    "stats.overview": { ...OVERVIEW, assistantTurns: 0, swipes: 0, reasoningRate: 0 },
    "stats.wrapped": { ...WRAPPED, replies: 0, swipes: 0 },
    "stats.timeseries": TIMELINE,
    "stats.momentum": MOMENTUM,
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(
    component.locator('[data-slot="stat-figure"]', { hasText: "Reasoning (of replies + swipes)" }).locator('[data-slot="stat-figure-value"]'),
  ).toHaveText("—");
  await test.info().attach("0314-no-replies", { body: await component.screenshot(), contentType: "image/png" });
  await test.info().attach("0314-no-replies-aria", { body: Buffer.from(await component.ariaSnapshot()), contentType: "text/plain" });
});

function figureValue(scope: Locator, label: string): Locator {
  return scope.locator('[data-slot="stat-figure"]', { hasText: label }).locator('[data-slot="stat-figure-value"]');
}

// ── The three all-time swipe and first-chat figures (0372) ─────────────────────────────────────────
// The rates divide by replies, and the depth averages over replies with more than one take, so with no
// sample each must read as unrecorded rather than the 0 an empty denominator divides to.
test("All-time totals render the first chat, the swiped share and the swipe depth, with em dashes when there is no sample", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": { computedAt: COMPUTED_AT, stale: false, hasData: true },
    "stats.overview": OVERVIEW,
    "stats.wrapped": WRAPPED,
    "stats.timeseries": TIMELINE,
    "stats.momentum": MOMENTUM,
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(figureValue(component, "Swiped replies")).toHaveText("25%");
  await expect(figureValue(component, "Swipes to kept reply")).toHaveText("1.4");
  await expect(figureValue(component, "First chat")).toHaveText(ABSOLUTE_STAMP);
});

test("with no re-rolled reply and no replies, the swipe figures read unrecorded", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": { computedAt: COMPUTED_AT, stale: false, hasData: true },
    "stats.overview": { ...OVERVIEW, variantMessages: 0 },
    "stats.wrapped": { ...WRAPPED, replies: 0, swipeRate: 0, avgSwipeDepth: 0, firstChatAt: null },
    "stats.timeseries": TIMELINE,
    "stats.momentum": MOMENTUM,
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(figureValue(component, "Swiped replies")).toHaveText("—");
  await expect(figureValue(component, "Swipes to kept reply")).toHaveText("—");
  await expect(figureValue(component, "First chat")).toHaveText("—");
});

// ── Momentum months are the VIEWER's months (0410) ─────────────────────────────────────────────────
// 2026-08-01 02:00 UTC is still the evening of July 31 in New York, so there those replies belong to July and
// the band compares June with July; in UTC the same timeline compares July with August.
const MONTH_EDGE = [
  replies("character_ct_rising", "Morgatha", Date.UTC(2026, 5, 15, 12, 0), 1),
  replies("character_ct_rising", "Morgatha", MID_JULY, 1),
  replies("character_ct_rising", "Morgatha", Date.UTC(2026, 7, 1, 2, 0), 5),
];

async function routeMonthEdge(page: Page): Promise<void> {
  await routeTrpc(page, {
    "stats.freshness": { computedAt: COMPUTED_AT, stale: false, hasData: true },
    "stats.overview": OVERVIEW,
    "stats.wrapped": WRAPPED,
    "stats.timeseries": TIMELINE,
    "stats.momentum": MONTH_EDGE,
  });
}

test.describe("momentum in New York", () => {
  test.use({ timezoneId: "America/New_York" });
  test("a reply at 02:00 UTC on the 1st counts toward the viewer's previous month", async ({ mount, page }) => {
    await routeMonthEdge(page);
    const component = await mount(<AnalyticsOverviewSurfaceStory />);
    await expect(component.getByText("June 2026 → July 2026")).toBeVisible();
    await expect(component.getByRole("table", { name: "Rising" }).getByRole("cell").first()).toHaveText("+5");
  });
});

test.describe("momentum in UTC", () => {
  test.use({ timezoneId: "UTC" });
  test("the same reply counts toward August", async ({ mount, page }) => {
    await routeMonthEdge(page);
    const component = await mount(<AnalyticsOverviewSurfaceStory />);
    await expect(component.getByText("July 2026 → August 2026")).toBeVisible();
    await expect(component.getByRole("table", { name: "Rising" }).getByRole("cell").first()).toHaveText("+4");
  });
});
