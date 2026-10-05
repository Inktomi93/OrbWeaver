import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AnalyticsOverviewSurfaceStory } from "../_ct-stories.tsx";

test("an empty rollup explains imported transcript coverage and offers recompute", async ({ mount, page }) => {
  const routes = await routeTrpc(page, {
    "stats.freshness": { computedAt: null, stale: false, hasData: false },
    "stats.overview": null,
    "stats.wrapped": null,
    "stats.timeseries": [],
    "stats.momentum": [],
    "stats.reconcile": { owners: 1, characters: 1, buckets: 1, models: 0, computedAt: 1 },
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(component.getByText(/Imported transcripts can appear in Explore/)).toBeVisible();
  await expect(component.getByText(/tokens, generation time or provider cost/)).toBeVisible();
  await component.getByRole("button", { name: "Recompute now", exact: true }).click();
  await expect.poll(() => routes.count("stats.reconcile")).toBe(1);
  await expect(component.locator('[data-slot="stat-figure"]')).toHaveCount(0);
  await test.info().attach("imported-rollup-empty", { body: await component.screenshot(), contentType: "image/png" });
});

test("imported activity keeps real replies but does not fabricate usage or a complete bill", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.freshness": { computedAt: 1, stale: false, hasData: true },
    "stats.overview": {
      variantMessages: 0,
      assistantTurns: 3,
      swipes: 0,
      tokensIn: null,
      tokensOut: null,
      tokensInProvenance: "unrecorded",
      tokensOutProvenance: "unrecorded",
      swipeWords: 0,
      reasoningMs: 0,
      totalGenTimeMs: 0,
      avgGenMs: null,
      p50GenMs: null,
      p90GenMs: null,
      avgTtftMs: null,
      throughputTps: 0,
      cacheHitRate: null,
      reasoningRate: 0,
    },
    "stats.wrapped": {
      characters: 1,
      chats: 1,
      words: 120,
      replies: 3,
      swipes: 0,
      forkedChats: 0,
      costUsd: null,
      genTimeMs: 0,
      topCharacter: null,
      firstChatAt: 1,
      avgSwipeDepth: 0,
      swipeRate: 0,
    },
    "stats.timeseries": [],
    "stats.momentum": [],
  });
  const component = await mount(<AnalyticsOverviewSurfaceStory />);
  await expect(component.locator('[data-slot="stat-figure"]', { hasText: "Replies" }).first().locator('[data-slot="stat-figure-value"]')).toHaveText("3");
  await expect(component.locator('[data-slot="stat-figure"]', { hasText: "Tokens in" }).locator('[data-slot="stat-figure-value"]')).toHaveText("—");
  await expect(component.locator('[data-slot="stat-figure"]', { hasText: "Spend" }).locator('[data-slot="stat-figure-value"]')).toHaveText("—");
  await expect(component.locator('[data-slot="stat-figure"]', { hasText: "Time generating" }).locator('[data-slot="stat-figure-value"]')).toHaveText("—");
  const coverage = component.locator('[data-slot="accounting-coverage"]');
  await expect(coverage).toContainText("Partial accounting — not your provider bill");
  await expect(coverage).toContainText("Prompt extraction and captioning costs are omitted");
  await test.info().attach("partial-accounting", { body: await component.screenshot(), contentType: "image/png" });
  await coverage.getByRole("button", { name: "Accounting coverage", exact: true }).click();
  await expect(coverage).toContainText("retained message generations, image-generation records and compaction spend");
  await expect(coverage).toContainText("Image costs may lack counted samples");
  await expect(coverage).toContainText("Deleted images can lose their cost records on Recompute");
  await expect(coverage).toContainText("restore do not preserve image or compaction spend history");
  await test.info().attach("accounting-coverage-details", { body: await component.screenshot(), contentType: "image/png" });
});
