// CT: the Analytics CONTEXT "Time" tab — three canvases (two histograms + the 7×24 heatmap) that carried
// no reading at all for a screen reader, and a token axis that printed raw digits while every figure beside
// it printed "1.2M" (side-eye ANALYTICS 2026-08-19, P1e + P2f). Every chart folds the one UTC quarter-hour
// timeline onto the BROWSER's calendar, so the runner's zone is pinned per describe.
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AnalyticsTimeTabStory } from "../_ct-stories.tsx";

type TimelineBucket = TrpcWireOutput<"stats.timeseries">[number];

function timelineBucket(bucketStart: number, over: Partial<TimelineBucket>): TimelineBucket {
  return {
    bucketStart,
    chatsCreated: 0,
    userTurns: 0,
    assistantTurns: 0,
    swipes: 0,
    tokensIn: null,
    tokensOut: null,
    tokensInProvenance: "unrecorded",
    tokensOutProvenance: "unrecorded",
    genTimeMs: 0,
    messageDatesApprox: false,
    ...over,
  };
}

// Wednesday 2026-07-01 at 03:00 UTC and Thursday 2026-07-02 at noon UTC.
const POINTS = [
  timelineBucket(Date.UTC(2026, 6, 1, 3, 0), { assistantTurns: 12, tokensOut: 1_200_000, tokensOutProvenance: "measured" }),
  timelineBucket(Date.UTC(2026, 6, 2, 12, 0), { assistantTurns: 40, tokensOut: 3400, tokensOutProvenance: "measured" }),
] as const;

async function routeTime(page: Parameters<typeof routeTrpc>[0]): Promise<void> {
  await routeTrpc(page, { "stats.timeseries": () => POINTS });
}

test.use({ timezoneId: "UTC" });

test("both daily histograms carry their buckets as text, in the compact number voice (P1e + P2f)", async ({ mount, page }) => {
  await routeTime(page);
  const component = await mount(<AnalyticsTimeTabStory />);

  const tokens = component.getByRole("table", { name: "Output tokens per day" });
  // The first bucket keeps the year so a multi-year axis has an explicit starting frame; the next rides the short form.
  await expect(tokens.getByRole("rowheader")).toHaveText(["Jul 1, 2026", "Jul 2"]);
  // `formatCompact`, the voice every figure on this section uses — never a raw 1200000.
  await expect(tokens.getByRole("cell").first()).toHaveText("1.2M");

  const replies = component.getByRole("table", { name: "Assistant turns per day" });
  await expect(replies.getByRole("cell").last()).toHaveText("40");
});

test("one estimated day keeps the shared token chart visibly approximate", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.timeseries": () => [{ ...POINTS[0], tokensOutProvenance: "estimated" as const }, POINTS[1]] });
  const component = await mount(<AnalyticsTimeTabStory />);
  const tokens = component.getByRole("table", { name: "Output tokens per day" });
  await expect(tokens.getByRole("cell")).toHaveText(["~1.2M", "~3.4k"]);
  await expect(component.getByText("~ marks estimates", { exact: false })).toBeVisible();
  await expect(component.getByText("Aggregate only", { exact: false })).toBeVisible();
});

test("an unrecorded period teaches missing output accounting instead of showing zero-token buckets", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.timeseries": () => POINTS.map((point) => ({ ...point, tokensOut: null, tokensOutProvenance: "unrecorded" as const })) });
  const component = await mount(<AnalyticsTimeTabStory width={320} />);
  await expect(component.getByRole("table", { name: "Assistant turns per day" }).getByRole("cell")).toHaveText(["12", "40"]);
  await expect(component.getByText("No output token accounting recorded in this period.", { exact: true })).toBeVisible();
  await expect(component.getByRole("table", { name: "Output tokens per day" })).toHaveCount(0);
});

test("the 7x24 activity matrix is readable as a real table, not just a coloured canvas (P1e)", async ({ mount, page }) => {
  await routeTime(page);
  const component = await mount(<AnalyticsTimeTabStory />);

  const table = component.getByRole("table", { name: "Messages by weekday and hour" });
  // One header row + seven weekday rows; one row header + 24 hour columns per row.
  await expect(table.getByRole("row")).toHaveCount(8);
  await expect(table.getByRole("columnheader")).toHaveCount(25);
  await expect(table.getByRole("rowheader").first()).toHaveText("Sun");
  // Wed (row 4 under the header) at hour 3 holds the first bucket's 12 turns — a real value at a real coordinate.
  await expect(table.getByRole("row").nth(4).getByRole("cell").nth(3)).toHaveText("12");
});

test("the weekday bar chart carries its seven days as text (P1e)", async ({ mount, page }) => {
  await routeTime(page);
  const component = await mount(<AnalyticsTimeTabStory />);

  // `exact` because playwright's role-name match is a SUBSTRING match by default, and the heatmap beside
  // this chart is named "Messages by weekday and hour" — without it both tables match and the row count
  // silently doubles.
  const table = component.getByRole("table", { exact: true, name: "Messages by weekday" });
  await expect(table.getByRole("rowheader")).toHaveCount(7);
  await expect(table.getByRole("rowheader").first()).toHaveText("Sun");
  // Thursday (index 4) carries the second bucket's 40 turns.
  await expect(table.getByRole("cell").nth(4)).toHaveText("40");
});

// THE VIEWER'S ZONE DECIDES THE DAY AND THE HOUR (0410). The same Wednesday 03:00 UTC bucket is Tuesday 23:00 in
// New York and Wednesday 08:45 in Kathmandu (UTC+5:45): the day axis, the weekday row and the hour column all move.
test.describe("in New York", () => {
  test.use({ timezoneId: "America/New_York" });
  test("a 03:00 UTC bucket lands on the viewer's previous evening", async ({ mount, page }) => {
    await routeTime(page);
    const component = await mount(<AnalyticsTimeTabStory />);
    await expect(component.getByRole("table", { name: "Assistant turns per day" }).getByRole("rowheader").first()).toHaveText("Jun 30, 2026");
    const heatmap = component.getByRole("table", { name: "Messages by weekday and hour" });
    // Tue (row 3) at hour 23.
    await expect(heatmap.getByRole("row").nth(3).getByRole("cell").nth(23)).toHaveText("12");
  });
});

test.describe("in Kathmandu", () => {
  test.use({ timezoneId: "Asia/Kathmandu" });
  test("a 45-minute offset puts the bucket in the viewer's 08:00 hour", async ({ mount, page }) => {
    await routeTime(page);
    const component = await mount(<AnalyticsTimeTabStory />);
    await expect(component.getByRole("table", { name: "Assistant turns per day" }).getByRole("rowheader").first()).toHaveText("Jul 1, 2026");
    const heatmap = component.getByRole("table", { name: "Messages by weekday and hour" });
    await expect(heatmap.getByRole("row").nth(4).getByRole("cell").nth(8)).toHaveText("12");
  });
});
