// CT: the Analytics OVERVIEW dashboard's RECOMPUTE affordance — the client half of the direct
// `stats.reconcile` twin (the queue keeps the all-owners bulk sweep). Drives the PRODUCTION path: the four
// suspense reads seed the dashboard, the button fires the real mutation, and the settle invalidates the
// stats router root so the freshness line re-reads. Asserts the wire actually fires — a "Recompute now"
// button that renders but dispatches nothing is exactly the failure this covers.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { AnalyticsOverviewSurfaceStory } from "../_ct-stories.tsx";

const COMPUTED_AT = 1_750_000_000_000;

const OVERVIEW = {
  tokensIn: 1000,
  tokensOut: 2000,
  avgGenMs: 900,
  p50GenMs: 800,
  p90GenMs: 1500,
  avgTtftMs: 300,
  throughputTps: 12.5,
  cacheHitRate: 0.25,
  reasoningRate: 0.1,
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
  temporal: { activeDays: 4, currentStreak: 2, longestStreak: 3, busiestDay: null, byDayOfWeek: [0, 0, 0, 0, 0, 0, 0] },
};

const MOMENTUM = { latestMonth: null, prevMonth: null, rising: [], falling: [] };

test("the dashboard's Recompute now button fires stats.reconcile", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "stats.freshness": () => ({ computedAt: COMPUTED_AT, stale: false, hasData: true }),
    "stats.overview": () => OVERVIEW,
    "stats.wrapped": () => WRAPPED,
    "stats.momentum": () => MOMENTUM,
    "stats.reconcile": () => ({ owners: 1, characters: 3, days: 4, models: 2, computedAt: COMPUTED_AT + 1000 }),
  });

  const component = await mount(<AnalyticsOverviewSurfaceStory />);

  const recompute = component.getByRole("button", { name: "Recompute now" });
  await expect(recompute).toBeVisible();
  await recompute.click();

  await expect.poll(() => trpc.count("stats.reconcile")).toBe(1);
  // The settle re-reads the dashboard (the invalidation covers the whole stats router root).
  await expect.poll(() => trpc.count("stats.freshness")).toBeGreaterThan(1);
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
    "stats.momentum": () => MOMENTUM,
    "stats.reconcile": () => ({ owners: 1, characters: 3, days: 4, models: 2, computedAt: COMPUTED_AT + 1000 }),
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
  await expect(component.getByText("Year in review")).toBeVisible();
});
