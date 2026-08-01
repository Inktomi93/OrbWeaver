// CT: the Analytics OVERVIEW dashboard's RECOMPUTE affordance — the client half of the direct
// `stats.reconcile` twin (the queue keeps the all-owners bulk sweep). Drives the PRODUCTION path: the four
// suspense reads seed the dashboard, the button fires the real mutation, and the settle invalidates the
// stats router root so the freshness line re-reads. Asserts the wire actually fires — a "Recompute now"
// button that renders but dispatches nothing is exactly the failure this covers.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { AnalyticsOverviewSurfaceStory } from "../_ct-stories";

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
