// @subject packages/client/src/features/stats/components/analytics-time-tab.tsx
// @subject packages/client/src/features/stats/surfaces/analytics-overview-surface.tsx
// Activity built from approximate message dates is marked on the Time tab's daily charts and named on the
// dashboard, and a library with exact dates carries neither mark.

import { MS_PER_DAY } from "@orb/kit/time";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { ANALYTICS_BUSIEST_DAY_LEAD, APPROX_DATES_MARK, APPROX_DATES_NOTE } from "#client/features/stats/lib/analytics-copy.ts";
import { ANALYTICS_RHYTHM_HEADING, ANALYTICS_TOKENS_PER_DAY_NAME, ANALYTICS_TURNS_PER_DAY_NAME } from "#client/features/stats/lib/analytics-names.ts";
import type { ApproximateDatesStory } from "./_approximate-dates-stories.tsx";

const STORY = "tests/client/features/stats/components/_approximate-dates-stories/ApproximateDatesStory";
const SERVED = [
  "sessions.me",
  "settings.getUserSettings",
  "stats.freshness",
  "stats.wrapped",
  "stats.overview",
  "stats.momentum",
  "stats.byModel",
  "stats.latency",
] as const;
const DAYS_LATER = 3;
const BUSIER = 2;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

const MARKED_DAY = new RegExp(`^${APPROX_DATES_MARK}`, "u");

/** Serve the corpus timeline plus one busier later day, whose dates are approximate only when `approximate` says so. */
async function routeTimeline(page: Page, root: ServerTestHarness, approximate: boolean): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const recorded = await caller.stats.timeseries();
  const busiest = recorded.reduce((most, bucket) => (bucket.userTurns > most.userTurns ? bucket : most));
  const timeline = [
    ...recorded,
    {
      ...busiest,
      bucketStart: busiest.bucketStart + DAYS_LATER * MS_PER_DAY,
      userTurns: busiest.userTurns * BUSIER,
      assistantTurns: busiest.assistantTurns * BUSIER,
      messageDatesApprox: approximate,
    },
  ];
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    "stats.timeseries": (input) =>
      timeline.filter(
        (bucket) => (input?.from === undefined || bucket.bucketStart >= input.from) && (input?.to === undefined || bucket.bucketStart <= input.to),
      ),
  });
}

for (const approximate of [true, false]) {
  test(`the Time tab ${approximate ? "marks" : "does not mark"} the day built from ${approximate ? "approximate" : "exact"} dates`, async ({ mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    await routeTimeline(page, root, approximate);
    const component = await mount<typeof ApproximateDatesStory>(STORY, { view: "time" });
    for (const chart of [ANALYTICS_TURNS_PER_DAY_NAME, ANALYTICS_TOKENS_PER_DAY_NAME]) {
      const days = component.getByRole("table", { name: chart, exact: true }).getByRole("rowheader");
      // Both days are on the axis either way; only the later day's dates differ.
      await expect(days).toHaveCount(2);
      await expect(days.filter({ hasText: MARKED_DAY })).toHaveCount(approximate ? 1 : 0);
    }
    await expect(component.getByText(APPROX_DATES_NOTE, { exact: true })).toHaveCount(approximate ? 1 : 0);
  });

  test(`the dashboard ${approximate ? "names" : "does not name"} approximate dates beside its rhythm figures`, async ({ mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    await routeTimeline(page, root, approximate);
    const component = await mount<typeof ApproximateDatesStory>(STORY, { view: "overview" });
    await expect(component.getByRole("heading", { name: ANALYTICS_RHYTHM_HEADING, exact: true })).toBeVisible();
    await expect(component.getByText(APPROX_DATES_NOTE, { exact: true })).toHaveCount(approximate ? 1 : 0);
    // The later day is the busiest, so its mark rides the sentence that names it.
    await expect(component.getByText(new RegExp(`^${RegExp.escape(ANALYTICS_BUSIEST_DAY_LEAD)}`, "u"))).toContainText(
      approximate ? `was ${APPROX_DATES_MARK}` : /was [A-Z]/u,
    );
  });
}
