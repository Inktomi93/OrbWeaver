// Unit: the story-time folds (features/discovery/lib/story-time-folds). The server's UTC calendar buckets placed
// on an injected zone's calendar, exactly as the production `timeLib` does with the browser's own: a month edge
// that New York, UTC, Kolkata (+5:30) and Kathmandu (+5:45) each draw differently, and the leading-theme cut.

import type { ThemeDriftBucket } from "@orb/contracts/discovery";
import type { CalendarPosition } from "@orb/kit/time";
import { createTimeLib } from "@orb/kit/time";
import { describe } from "vitest";
import { localThemeDrift, localThemeTimeline } from "../../../../../packages/client/src/features/discovery/lib/story-time-folds.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function at(timeZone: string): (epochMs: number) => CalendarPosition {
  return createTimeLib({ timeZone }).calendarPosition;
}

function theme(clusterIdx: number, count: number): ThemeDriftBucket["themes"][number] {
  return { clusterIdx, themeName: `Theme ${clusterIdx}`, count };
}

const JAN_15 = Date.UTC(2024, 0, 15, 12, 0);
// 02:00 UTC on Feb 1 is still January 31 in New York.
const FEB_1_UTC_JAN_31_NEW_YORK = Date.UTC(2024, 1, 1, 2, 0);
// 18:15 UTC on Jan 31 is Kathmandu's Feb 1 midnight; Kolkata's is 18:30 UTC.
const KATHMANDU_FEB_1 = Date.UTC(2024, 0, 31, 18, 15);
const KOLKATA_FEB_1 = Date.UTC(2024, 0, 31, 18, 30);

describe("localThemeDrift", () => {
  const buckets: ThemeDriftBucket[] = [
    { bucketStart: JAN_15, themes: [theme(0, 2)] },
    { bucketStart: FEB_1_UTC_JAN_31_NEW_YORK, themes: [theme(0, 1), theme(1, 4)] },
  ];

  test("an instant that is the 31st in New York but the 1st in UTC counts toward the viewer's month", () => {
    const utc = localThemeDrift(buckets, at("UTC"));
    expect(utc.map(({ month, themes }) => [month.key, themes.map((t) => [t.clusterIdx, t.count])])).toEqual([
      ["2024-01", [[0, 2]]],
      [
        "2024-02",
        [
          [1, 4],
          [0, 1],
        ],
      ],
    ]);
    const newYork = localThemeDrift(buckets, at("America/New_York"));
    expect(newYork.map(({ month, themes }) => [month.key, month.start, themes.map((t) => [t.clusterIdx, t.count])])).toEqual([
      [
        "2024-01",
        JAN_15,
        [
          [1, 4],
          [0, 3],
        ],
      ],
    ]);
  });

  test("a +5:45 zone turns the month a quarter-hour before a +5:30 zone", () => {
    const edge: ThemeDriftBucket[] = [
      { bucketStart: KATHMANDU_FEB_1, themes: [theme(0, 1)] },
      { bucketStart: KOLKATA_FEB_1, themes: [theme(0, 1)] },
    ];
    expect(localThemeDrift(edge, at("Asia/Kathmandu")).map(({ month, themes }) => [month.key, themes[0]?.count])).toEqual([["2024-02", 2]]);
    expect(localThemeDrift(edge, at("Asia/Kolkata")).map(({ month, themes }) => [month.key, themes[0]?.count])).toEqual([
      ["2024-01", 1],
      ["2024-02", 1],
    ]);
  });

  test("the leading-theme cut runs over the folded month, ties in cluster order", () => {
    // Theme 9 trails every single bucket but leads the month once its buckets are summed.
    const spread: ThemeDriftBucket[] = [
      { bucketStart: JAN_15, themes: [theme(0, 3), theme(1, 3), theme(2, 3), theme(3, 3), theme(4, 3), theme(5, 3), theme(9, 2)] },
      { bucketStart: JAN_15 + 900_000, themes: [theme(9, 2)] },
    ];
    const [january] = localThemeDrift(spread, at("UTC"));
    expect(january?.themes.map((t) => [t.clusterIdx, t.count])).toEqual([
      [9, 4],
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
    ]);
  });
});

describe("localThemeTimeline", () => {
  test("sums each viewer month's buckets, ascending, and names the month by its earliest bucket", () => {
    const timeline = [
      { bucketStart: JAN_15, count: 2 },
      { bucketStart: FEB_1_UTC_JAN_31_NEW_YORK, count: 3 },
      { bucketStart: Date.UTC(2024, 1, 20), count: 1 },
    ];
    expect(localThemeTimeline(timeline, at("UTC")).map(({ month, count }) => [month.key, month.start, count])).toEqual([
      ["2024-01", JAN_15, 2],
      ["2024-02", FEB_1_UTC_JAN_31_NEW_YORK, 4],
    ]);
    expect(localThemeTimeline(timeline, at("America/New_York")).map(({ month, count }) => [month.key, count])).toEqual([
      ["2024-01", 5],
      ["2024-02", 1],
    ]);
  });

  test("an empty timeline folds to no months", () => {
    expect(localThemeTimeline([], at("UTC"))).toEqual([]);
  });
});
