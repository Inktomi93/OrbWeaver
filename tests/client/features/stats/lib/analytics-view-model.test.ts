// Unit: the Analytics view-model helpers (features/stats/lib/analytics-view-model). Pure, no DOM — the
// non-trivial shaping the surfaces lean on: duration bucketing, compact-number rounding, the 7×24
// heatmap → hour-of-day aggregation, weekday labelling, and the chart-family row adapters. Asserts the
// boundaries (ms/s/m/h thresholds, k/M cutovers) and the aggregation math, not the trivial passthroughs.

import { describe } from "vitest";
import {
  byModelBarItems,
  dailyTurnBuckets,
  formatCompact,
  formatDayLabel,
  formatDurationMs,
  formatMs,
  formatPeak,
  formatPercent,
  formatSignedDelta,
  formatUsd,
  hourHistogramBuckets,
  momentumBarItems,
  personaBarItems,
  WEEKDAY_LABELS,
  weekdayBarItems,
} from "../../../../../packages/client/src/features/stats/lib/analytics-view-model";
import { expect, test } from "../../../../support/fixtures";

describe("formatDurationMs", () => {
  test("sub-second renders as rounded ms", () => {
    expect(formatDurationMs(0)).toBe("0ms");
    expect(formatDurationMs(340.6)).toBe("341ms");
    expect(formatDurationMs(999)).toBe("999ms");
  });
  test("seconds below a minute render with one decimal", () => {
    expect(formatDurationMs(1000)).toBe("1.0s");
    expect(formatDurationMs(1234)).toBe("1.2s");
    expect(formatDurationMs(59_900)).toBe("59.9s");
  });
  test("minutes carry a seconds remainder", () => {
    expect(formatDurationMs(60_000)).toBe("1m 0s");
    expect(formatDurationMs(200_000)).toBe("3m 20s");
  });
  test("hours carry a minutes remainder", () => {
    expect(formatDurationMs(3_600_000)).toBe("1h 0m");
    expect(formatDurationMs(7_500_000)).toBe("2h 5m");
  });
});

describe("formatMs", () => {
  test("null becomes an em dash; a number formats", () => {
    expect(formatMs(null)).toBe("—");
    expect(formatMs(1500)).toBe("1.5s");
  });
});

describe("formatCompact", () => {
  test("under a thousand rounds to an integer", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(842.4)).toBe("842");
  });
  test("thousands and millions get a trimmed suffix", () => {
    expect(formatCompact(1000)).toBe("1k");
    expect(formatCompact(1200)).toBe("1.2k");
    expect(formatCompact(3_400_000)).toBe("3.4M");
    expect(formatCompact(2_000_000)).toBe("2M");
  });
});

describe("scalar formatters", () => {
  test("formatUsd is two decimals", () => {
    expect(formatUsd(1.2)).toBe("$1.20");
  });
  test("formatPercent rounds a 0..1 rate", () => {
    expect(formatPercent(0.454)).toBe("45%");
    expect(formatPercent(1)).toBe("100%");
  });
  test("formatSignedDelta signs positives, leaves the rest", () => {
    expect(formatSignedDelta(5)).toBe("+5");
    expect(formatSignedDelta(-3)).toBe("-3");
    expect(formatSignedDelta(0)).toBe("0");
  });
  test("formatDayLabel drops the YYYY- prefix", () => {
    expect(formatDayLabel("2026-07-13")).toBe("07-13");
    expect(formatDayLabel("07-13")).toBe("07-13");
  });
});

describe("hourHistogramBuckets", () => {
  test("sums each hour column across all 7 weekday rows into 24 buckets", () => {
    const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, (_unused, hour) => hour));
    const buckets = hourHistogramBuckets(matrix);
    expect(buckets).toHaveLength(24);
    expect(buckets[0]).toEqual({ label: "00", count: 0 });
    // Hour 5 present in all 7 rows → 5 * 7.
    expect(buckets[5]).toEqual({ label: "05", count: 35 });
    expect(buckets[23]?.count).toBe(23 * 7);
  });
  test("tolerates ragged / empty rows", () => {
    const buckets = hourHistogramBuckets([[], [1, 2]]);
    expect(buckets[0]?.count).toBe(1);
    expect(buckets[1]?.count).toBe(2);
    expect(buckets[2]?.count).toBe(0);
  });
});

describe("weekdayBarItems", () => {
  test("labels the 7 slots Sun..Sat in calendar order", () => {
    const items = weekdayBarItems([10, 20, 30, 40, 50, 60, 70]);
    expect(items.map((i) => i.label)).toEqual([...WEEKDAY_LABELS]);
    expect(items[0]).toEqual({ id: "Sun", label: "Sun", value: 10 });
    expect(items[6]?.value).toBe(70);
  });
  test("a short vector fills missing days with zero", () => {
    const items = weekdayBarItems([5]);
    expect(items[0]?.value).toBe(5);
    expect(items[3]?.value).toBe(0);
  });
});

describe("formatPeak", () => {
  test("null peak stays null", () => {
    expect(formatPeak(null)).toBeNull();
  });
  test("maps day index + hour to a Tue 21:00 label", () => {
    expect(formatPeak({ dayOfWeek: 2, hour: 21 })).toBe("Tue 21:00");
    expect(formatPeak({ dayOfWeek: 0, hour: 3 })).toBe("Sun 03:00");
  });
});

describe("chart-family row adapters", () => {
  test("momentumBarItems takes the magnitude of the swing", () => {
    const items = momentumBarItems([
      { characterId: "c1", name: "Aria", delta: 7 },
      { characterId: "c2", name: "Bolt", delta: -4 },
    ]);
    expect(items).toEqual([
      { id: "c1", label: "Aria", value: 7 },
      { id: "c2", label: "Bolt", value: 4 },
    ]);
  });
  test("ranked model bars keep the input order", () => {
    const items = byModelBarItems([
      { model: "gpt", generations: 9 },
      { model: "claude", generations: 4 },
    ]);
    expect(items.map((i) => i.label)).toEqual(["gpt", "claude"]);
    expect(items[0]?.value).toBe(9);
  });
  test("personaBarItems maps id/name/messageCount", () => {
    const items = personaBarItems([{ personaId: "p1", name: "Nate", messageCount: 12 }]);
    expect(items[0]).toEqual({ id: "p1", label: "Nate", value: 12 });
  });
  test("dailyTurnBuckets shortens the day label and carries the turn count", () => {
    const buckets = dailyTurnBuckets([{ day: "2026-07-13", assistantTurns: 8 }]);
    expect(buckets[0]).toEqual({ label: "07-13", count: 8 });
  });
});
