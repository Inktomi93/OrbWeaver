// Unit: the Analytics view-model helpers (features/stats/lib/analytics-view-model). Pure, no DOM — the
// non-trivial shaping the surfaces lean on: duration bucketing, compact-number rounding, the 7×24
// activity-matrix → <Heatmap> reshape, weekday labelling, and the chart-family row adapters. Asserts the
// boundaries (ms/s/m/h thresholds, k/M cutovers) and the aggregation math, not the trivial passthroughs.

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTimeLib } from "@orb/kit/time";
import { describe } from "vitest";
import {
  activityHeatmapMatrix,
  byModelBarItems,
  dailyTokenBuckets,
  dailyTurnBuckets,
  disambiguatedNames,
  formatCompact,
  formatCount,
  formatDayLabel,
  formatDecimal,
  formatDurationMs,
  formatMs,
  formatPeak,
  formatPercent,
  formatSignedDelta,
  formatThroughput,
  formatTokens,
  momentumBarItems,
  personaBarItems,
  seriesTokenProvenance,
  throughputProvenance,
  WEEKDAY_LABELS,
  weekdayBarItems,
} from "../../../../../packages/client/src/features/stats/lib/analytics-view-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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
  // Rounding at a unit boundary must CARRY into the next unit, never print an out-of-range component. The
  // pre-fix formatter avoided every boundary in its tests and shipped `60.0s` / `1m 60s` / `1h 60m` — each
  // is a value that should have rolled over. These pin every rollover point.
  test("a sub-minute value that rounds up to 60s rolls over to 1m 0s", () => {
    expect(formatDurationMs(59_999)).toBe("1m 0s");
    expect(formatDurationMs(59_950)).toBe("1m 0s");
    // Just below the carry — still seconds.
    expect(formatDurationMs(59_949)).toBe("59.9s");
  });
  test("a seconds remainder that rounds up to 60 carries into the minute", () => {
    expect(formatDurationMs(119_700)).toBe("2m 0s");
    // Deep inside the m/s band, a remainder rounding to 60 carries one minute.
    expect(formatDurationMs(3_599_999)).toBe("1h 0m");
  });
  test("a minutes remainder that rounds up to 60 carries into the hour", () => {
    expect(formatDurationMs(7_170_000)).toBe("2h 0m");
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
  test("formatPercent rounds a 0..1 rate", () => {
    expect(formatPercent(0.454)).toBe("45%");
    expect(formatPercent(1)).toBe("100%");
  });
  test("formatSignedDelta signs positives, leaves the rest", () => {
    expect(formatSignedDelta(5)).toBe("+5");
    expect(formatSignedDelta(-3)).toBe("-3");
    expect(formatSignedDelta(0)).toBe("0");
  });
});

// THE HONESTY SEAM (side-eye rail-analytics 2026-08-19 P1a/P2a/P3b). `null` off a stats verb means
// UNRECORDED; a formatter that turns it into `0` asserts a measurement that never happened.
describe("the nullable formatter family renders unrecorded as an em dash", () => {
  test("formatCount", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1200)).toBe("1.2k");
    expect(formatCount(1200, "estimated")).toBe("~1.2k");
  });
  test("formatTokens carries its unit INSIDE, so an absent figure is not `— tok`", () => {
    expect(formatTokens(null, "unrecorded")).toBe("—");
    expect(formatTokens(1200, "measured")).toBe("1.2k tok");
    expect(formatTokens(1200, "estimated")).toBe("~1.2k tok");
  });
  test("formatPercent: unrecorded is a dash, and a real-but-tiny rate is not rounded down to `never`", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.001)).toBe("<1%");
    // The live cache figure that used to render "100%": 32,217 read of 1,664,309 input tokens.
    expect(formatPercent(0.019_36)).toBe("2%");
    expect(formatPercent(0.019_36, "estimated")).toBe("~2%");
    expect(formatPercent(0.019_36, "unrecorded")).toBe("—");
  });
  test("formatThroughput carries estimated and unrecorded token provenance", () => {
    expect(formatThroughput(12.54, "measured")).toBe("12.5 t/s");
    expect(formatThroughput(12.54, "estimated")).toBe("~12.5 t/s");
    expect(formatThroughput(0, "unrecorded")).toBe("—");
  });
  test("throughput with no recorded generation time is unrecorded, never a measured 0.0 t/s", () => {
    expect(formatThroughput(0, throughputProvenance(0, "measured"))).toBe("—");
    expect(throughputProvenance(0, "estimated")).toBe("unrecorded");
    expect(formatThroughput(12.54, throughputProvenance(1500, "measured"))).toBe("12.5 t/s");
    expect(throughputProvenance(1500, "estimated")).toBe("estimated");
  });
  test("seriesTokenProvenance keeps a mixed chart approximate", () => {
    expect(seriesTokenProvenance([{ tokensOutProvenance: "measured" }, { tokensOutProvenance: "estimated" }])).toBe("estimated");
    expect(seriesTokenProvenance([{ tokensOutProvenance: "unrecorded" }, { tokensOutProvenance: "measured" }])).toBe("measured");
  });
});

// The day forms a daily axis reads through, pinned to one locale and zone so the labels are deterministic.
const UTC_DAYS = createTimeLib({ locale: "en-US", timeZone: "UTC" });

/** A viewer-local day point: its `YYYY-MM-DD` key and an instant on it (noon UTC lies on that day in UTC). */
function dayPoint(day: string): { day: string; start: number } {
  return { day, start: Date.parse(`${day}T12:00:00Z`) };
}

// A ~1,100-day axis wraps `Nov 22 → Jan 24` with nothing marking the year turning over unless a crossing keeps it.
describe("formatDayLabel keeps the year at a crossing", () => {
  test("names a day within a year by month and day only", () => {
    expect(formatDayLabel(dayPoint("2026-07-13"), "2026-07-12", UTC_DAYS)).toBe("Jul 13");
  });
  test("the FIRST bucket of a series keeps its year (nothing precedes it to imply one)", () => {
    expect(formatDayLabel(dayPoint("2026-07-13"), undefined, UTC_DAYS)).toBe("Jul 13, 2026");
  });
  test("the first bucket of a NEW year keeps its year", () => {
    expect(formatDayLabel(dayPoint("2027-01-02"), "2026-12-31", UTC_DAYS)).toBe("Jan 2, 2027");
  });
  test("names the viewer's day, not UTC's, while the year crossing reads the viewer's day key", () => {
    // 02:00 UTC on Jan 1 2027 is Dec 31 2026 in New York: the label and the crossing both follow the viewer.
    const newYork = createTimeLib({ locale: "en-US", timeZone: "America/New_York" });
    const point = { day: "2026-12-31", start: Date.UTC(2027, 0, 1, 2, 0) };
    expect(formatDayLabel(point, "2026-12-30", newYork)).toBe("Dec 31");
  });
  test("+5:30 and +5:45 zones name the day their own midnight starts", () => {
    // 18:20 UTC on Jan 1 is past Kathmandu's midnight (18:15) and short of Kolkata's (18:30).
    const instant = Date.UTC(2026, 0, 1, 18, 20);
    expect(formatDayLabel({ day: "2026-01-02", start: instant }, "2026-01-01", createTimeLib({ locale: "en-US", timeZone: "Asia/Kathmandu" }))).toBe("Jan 2");
    expect(formatDayLabel({ day: "2026-01-01", start: instant }, "2025-12-31", createTimeLib({ locale: "en-US", timeZone: "Asia/Kolkata" }))).toBe(
      "Jan 1, 2026",
    );
  });
});

// Two identically named characters were indistinguishable in the row AND in its accessible name (P3a).
describe("disambiguatedNames", () => {
  test("a shared name gets a stable id ref on BOTH twins; unique names are untouched", () => {
    const names = disambiguatedNames([
      { characterId: castId<CharacterId>("character_aaaak3f9"), name: "Tamsin" },
      { characterId: castId<CharacterId>("character_bbbbq7x2"), name: "Tamsin" },
      { characterId: castId<CharacterId>("character_ccccm1p4"), name: "Selva" },
    ]);
    expect(names["character_aaaak3f9"]).toBe("Tamsin (#k3f9)");
    expect(names["character_bbbbq7x2"]).toBe("Tamsin (#q7x2)");
    expect(names["character_ccccm1p4"]).toBe("Selva");
  });
  test("the ref is the id tail, not an ordinal — so it survives a re-sort", () => {
    const rows = [
      { characterId: castId<CharacterId>("character_aaaak3f9"), name: "Kate" },
      { characterId: castId<CharacterId>("character_bbbbq7x2"), name: "Kate" },
    ];
    expect(disambiguatedNames(rows)["character_aaaak3f9"]).toBe(disambiguatedNames([...rows].reverse())["character_aaaak3f9"]);
  });
});

describe("activityHeatmapMatrix", () => {
  test("reshapes the 7×24 matrix into weekday rows + two-digit hour cols, cells preserved", () => {
    const matrix = Array.from({ length: 7 }, (_unused, day) => Array.from({ length: 24 }, (_h, hour) => day * 100 + hour));
    const out = activityHeatmapMatrix(matrix);
    expect(out.rows).toEqual([...WEEKDAY_LABELS]);
    expect(out.cols).toHaveLength(24);
    expect(out.cols[0]).toBe("00");
    expect(out.cols[23]).toBe("23");
    expect(out.values).toHaveLength(7);
    expect(out.values[0]?.[0]).toBe(0);
    // Tue (index 2), hour 5 → 2*100 + 5.
    expect(out.values[2]?.[5]).toBe(205);
  });
  test("pads ragged / missing rows and cells to a full 7×24 grid of zeros", () => {
    const out = activityHeatmapMatrix([[], [1, 2]]);
    expect(out.values).toHaveLength(7);
    expect(out.values[0]?.[0]).toBe(0);
    expect(out.values[1]?.[0]).toBe(1);
    expect(out.values[1]?.[1]).toBe(2);
    expect(out.values[1]?.[2]).toBe(0);
    expect(out.values[6]).toHaveLength(24);
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
      { characterId: castId<CharacterId>("c1"), name: "Aria", delta: 7 },
      { characterId: castId<CharacterId>("c2"), name: "Bolt", delta: -4 },
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
    const items = personaBarItems([{ personaId: castId<PersonaId>("p1"), name: "Alex", messageCount: 12 }]);
    expect(items[0]).toEqual({ id: "p1", label: "Alex", value: 12 });
  });
  test("dailyTurnBuckets shortens the day label and carries the turn count", () => {
    const buckets = dailyTurnBuckets(
      [
        { ...dayPoint("2026-07-13"), assistantTurns: 8 },
        { ...dayPoint("2026-07-14"), assistantTurns: 3 },
      ],
      UTC_DAYS,
    );
    // The FIRST bucket anchors the series with its year; the rest ride the short form.
    expect(buckets[0]).toEqual({ label: "Jul 13, 2026", count: 8 });
    expect(buckets[1]).toEqual({ label: "Jul 14", count: 3 });
  });
  test("the bucket builders pass the PREVIOUS day through, so a year crossing is marked mid-series", () => {
    const buckets = dailyTokenBuckets(
      [
        { ...dayPoint("2026-12-30"), tokensOut: 1, tokensOutProvenance: "measured" },
        { ...dayPoint("2026-12-31"), tokensOut: 2, tokensOutProvenance: "estimated" },
        { ...dayPoint("2027-01-01"), tokensOut: 3, tokensOutProvenance: "measured" },
      ],
      UTC_DAYS,
    );
    expect(buckets.map((b) => b.label)).toEqual(["Dec 30, 2026", "Dec 31", "Jan 1, 2027"]);
  });
  test("dailyTokenBuckets omits unrecorded days instead of manufacturing zero-token bars", () => {
    expect(
      dailyTokenBuckets(
        [
          { ...dayPoint("2026-12-30"), tokensOut: 99, tokensOutProvenance: "unrecorded" },
          { ...dayPoint("2027-01-01"), tokensOut: 0, tokensOutProvenance: "measured" },
        ],
        UTC_DAYS,
      ),
    ).toEqual([{ label: "Jan 1, 2027", count: 0 }]);
  });
});

describe("formatDecimal", () => {
  test("keeps one decimal and trims a trailing .0", () => {
    expect(formatDecimal(1.44)).toBe("1.4");
    expect(formatDecimal(2)).toBe("2");
    expect(formatDecimal(0)).toBe("0");
  });
});
