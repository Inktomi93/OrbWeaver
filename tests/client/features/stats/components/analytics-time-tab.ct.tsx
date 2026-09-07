// CT: the Analytics CONTEXT "Time" tab — three canvases (two histograms + the 7×24 heatmap) that carried
// no reading at all for a screen reader, and a token axis that printed raw digits while every figure beside
// it printed "1.2M" (side-eye ANALYTICS 2026-08-19, P1e + P2f).
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AnalyticsTimeTabStory } from "../_ct-stories.tsx";

const POINTS = [
  { day: "2026-07-01", assistantTurns: 12, tokensOut: 1_200_000, tokensOutProvenance: "measured" as const },
  { day: "2026-07-02", assistantTurns: 40, tokensOut: 3400, tokensOutProvenance: "measured" as const },
];

const TEMPORAL = { activeDays: 2, currentStreak: 2, longestStreakDays: 2, busiestDay: null, dayOfWeek: [1, 2, 3, 4, 5, 6, 7] };

const HEATMAP = {
  peak: null,
  matrix: Array.from({ length: 7 }, (_unused, day) => Array.from({ length: 24 }, (_hour, hour) => day * hour)),
};

async function routeTime(page: Parameters<typeof routeTrpc>[0]): Promise<void> {
  await routeTrpc(page, {
    "stats.timeseries": () => POINTS,
    "stats.temporal": () => TEMPORAL,
    "stats.activityHeatmap": () => HEATMAP,
  });
}

test("both daily histograms carry their buckets as text, in the compact number voice (P1e + P2f)", async ({ mount, page }) => {
  await routeTime(page);
  const component = await mount(<AnalyticsTimeTabStory />);

  const tokens = component.getByRole("table", { name: "Output tokens per day" });
  // The first bucket keeps the year so a multi-year axis has an explicit starting frame.
  await expect(tokens.getByRole("rowheader").first()).toHaveText("2026-07-01");
  // `formatCompact`, the voice every figure on this section uses — never a raw 1200000.
  await expect(tokens.getByRole("cell").first()).toHaveText("1.2M");

  const replies = component.getByRole("table", { name: "Assistant turns per day" });
  await expect(replies.getByRole("cell").last()).toHaveText("40");
});

test("one estimated day keeps the shared token chart visibly approximate", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.timeseries": () => [{ ...POINTS[0], tokensOutProvenance: "estimated" as const }, POINTS[1]],
    "stats.temporal": () => TEMPORAL,
    "stats.activityHeatmap": () => HEATMAP,
  });
  const component = await mount(<AnalyticsTimeTabStory />);
  const tokens = component.getByRole("table", { name: "Output tokens per day" });
  await expect(tokens.getByRole("cell")).toHaveText(["~1.2M", "~3.4k"]);
});

test("the 7x24 activity matrix is readable as a real table, not just a coloured canvas (P1e)", async ({ mount, page }) => {
  await routeTime(page);
  const component = await mount(<AnalyticsTimeTabStory />);

  const table = component.getByRole("table", { name: "Messages by weekday and hour (UTC)" });
  // One header row + seven weekday rows; one row header + 24 hour columns per row.
  await expect(table.getByRole("row")).toHaveCount(8);
  await expect(table.getByRole("columnheader")).toHaveCount(25);
  await expect(table.getByRole("rowheader").first()).toHaveText("Sun");
  // Tue (day index 2) at hour 3 = 6 in the fixture matrix — a real value at a real coordinate.
  await expect(table.getByRole("row").nth(3).getByRole("cell").nth(3)).toHaveText("6");
});

test("the weekday bar chart carries its seven days as text (P1e)", async ({ mount, page }) => {
  await routeTime(page);
  const component = await mount(<AnalyticsTimeTabStory />);

  // `exact` because playwright's role-name match is a SUBSTRING match by default, and the heatmap beside
  // this chart is named "Messages by weekday and hour (UTC)" — without it both tables match and the row
  // count silently doubles.
  const table = component.getByRole("table", { exact: true, name: "Messages by weekday" });
  await expect(table.getByRole("rowheader")).toHaveCount(7);
  await expect(table.getByRole("rowheader").first()).toHaveText("Sun");
  await expect(table.getByRole("cell").last()).toHaveText("7");
});
