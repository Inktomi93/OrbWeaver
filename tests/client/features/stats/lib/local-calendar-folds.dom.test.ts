// Unit: the viewer-calendar folds (features/stats/lib/local-calendar-folds). The server's UTC quarter-hour
// buckets placed on an injected zone's calendar, exactly as the production `timeLib` does with the browser's
// own: day boundaries, half-hour and 45-minute offsets, a DST day, rhythm and month-over-month momentum.

import type { TokenProvenance } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CalendarPosition } from "@orb/kit/time";
import { createTimeLib } from "@orb/kit/time";
import { describe } from "vitest";
import { localMomentum, localTimeline, rhythmOf } from "../../../../../packages/client/src/features/stats/lib/local-calendar-folds.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function at(timeZone: string): (epochMs: number) => CalendarPosition {
  return createTimeLib({ timeZone }).calendarPosition;
}

function bucket(
  bucketStart: number,
  over: Partial<{ chatsCreated: number; userTurns: number; assistantTurns: number; tokensOut: number | null; tokensOutProvenance: TokenProvenance }> = {},
): {
  bucketStart: number;
  chatsCreated: number;
  userTurns: number;
  assistantTurns: number;
  tokensOut: number | null;
  tokensOutProvenance: TokenProvenance;
} {
  return { bucketStart, chatsCreated: 0, userTurns: 0, assistantTurns: 0, tokensOut: null, tokensOutProvenance: "unrecorded", ...over };
}

describe("localTimeline", () => {
  test("an empty timeline folds to no days, zeroed weekdays and hours, and no peak", () => {
    const timeline = localTimeline([], at("UTC"));
    expect(timeline.days).toEqual([]);
    expect(timeline.weekdayActivity).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(timeline.weekHourTurns.flat().every((cell) => cell === 0)).toBe(true);
    expect(timeline.peak).toBeNull();
    expect(rhythmOf(timeline.days)).toEqual({ activeDays: 0, longestStreakDays: 0, busiestDay: null });
  });

  test("the day boundary is the viewer's midnight, not UTC's", () => {
    const buckets = [bucket(Date.UTC(2024, 0, 1, 23, 45), { assistantTurns: 2 }), bucket(Date.UTC(2024, 0, 2, 0, 0), { assistantTurns: 3 })];
    // UTC splits them across midnight; New York (UTC-5) holds both on its Jan 1 evening.
    expect(localTimeline(buckets, at("UTC")).days.map((d) => [d.day, d.assistantTurns])).toEqual([
      ["2024-01-01", 2],
      ["2024-01-02", 3],
    ]);
    expect(localTimeline(buckets, at("America/New_York")).days.map((d) => [d.day, d.assistantTurns])).toEqual([["2024-01-01", 5]]);
  });

  test("a half-hour and a 45-minute offset zone turn the day inside a UTC hour", () => {
    // Kathmandu (UTC+5:45) midnight is 18:15 UTC; Kolkata (UTC+5:30) midnight is 18:30 UTC.
    const buckets = [
      bucket(Date.UTC(2024, 0, 1, 18, 0), { userTurns: 1 }),
      bucket(Date.UTC(2024, 0, 1, 18, 15), { userTurns: 1 }),
      bucket(Date.UTC(2024, 0, 1, 18, 30), { userTurns: 1 }),
    ];
    expect(localTimeline(buckets, at("Asia/Kathmandu")).days.map((d) => [d.day, d.activity])).toEqual([
      ["2024-01-01", 1],
      ["2024-01-02", 2],
    ]);
    expect(localTimeline(buckets, at("Asia/Kolkata")).days.map((d) => [d.day, d.activity])).toEqual([
      ["2024-01-01", 2],
      ["2024-01-02", 1],
    ]);
    const kathmandu = localTimeline(buckets, at("Asia/Kathmandu"));
    // Monday 23:45 and Tuesday 00:00 / 00:15 local: weekday rows 1 and 2, hours 23 and 0.
    expect(kathmandu.weekHourTurns[1]?.[23]).toBe(1);
    expect(kathmandu.weekHourTurns[2]?.[0]).toBe(2);
    expect(kathmandu.peak).toEqual({ dayOfWeek: 2, hour: 0, count: 2 });
  });

  test("a DST transition day places hours by the local clock: New York's spring-forward skips 02:00", () => {
    const buckets = [bucket(Date.UTC(2024, 2, 10, 6, 45), { userTurns: 1 }), bucket(Date.UTC(2024, 2, 10, 7, 0), { assistantTurns: 1 })];
    const timeline = localTimeline(buckets, at("America/New_York"));
    const sunday = timeline.weekHourTurns[0];
    expect([sunday?.[1], sunday?.[2], sunday?.[3]]).toEqual([1, 0, 1]);
    expect(timeline.days.map((d) => d.day)).toEqual(["2024-03-10"]);
  });

  test("weekday activity counts chats opened; the hour grid counts only turns", () => {
    const sunday = Date.UTC(2024, 0, 7, 12, 0);
    const timeline = localTimeline([bucket(sunday, { userTurns: 1, assistantTurns: 1, chatsCreated: 1 })], at("UTC"));
    expect(timeline.weekdayActivity[0]).toBe(3);
    expect(timeline.weekHourTurns[0]?.[12]).toBe(2);
    expect(timeline.days[0]?.activity).toBe(3);
  });

  test("a day's tokens sum only recorded buckets, and an estimate anywhere marks the day estimated", () => {
    const day = Date.UTC(2024, 0, 3, 9, 0);
    const timeline = localTimeline(
      [
        bucket(day, { assistantTurns: 1, tokensOut: 40, tokensOutProvenance: "measured" }),
        bucket(day + 900_000, { assistantTurns: 1 }),
        bucket(day + 1_800_000, { assistantTurns: 1, tokensOut: 2, tokensOutProvenance: "estimated" }),
        bucket(Date.UTC(2024, 0, 4, 9, 0), { assistantTurns: 1 }),
      ],
      at("UTC"),
    );
    expect(timeline.days.map((d) => [d.day, d.tokensOut, d.tokensOutProvenance])).toEqual([
      ["2024-01-03", 42, "estimated"],
      ["2024-01-04", null, "unrecorded"],
    ]);
  });
});

describe("rhythmOf", () => {
  test("counts active days, the longest run across a month end and a DST day, and the first busiest day", () => {
    const days = ["2024-02-28", "2024-02-29", "2024-03-01", "2024-03-09", "2024-03-10", "2024-03-12"].map((day, index) => ({
      day,
      start: Date.parse(`${day}T12:00:00Z`),
      assistantTurns: 0,
      tokensOut: null,
      tokensOutProvenance: "unrecorded" as const,
      activity: index === 1 || index === 4 ? 5 : 1,
    }));
    expect(rhythmOf(days)).toEqual({
      activeDays: 6,
      longestStreakDays: 3,
      busiestDay: { day: "2024-02-29", start: Date.parse("2024-02-29T12:00:00Z"), count: 5 },
    });
  });

  test("a day with only zeroed activity is not active and does not extend a streak", () => {
    const days = [
      {
        day: "2024-01-01",
        start: Date.parse("2024-01-01T12:00:00Z"),
        assistantTurns: 0,
        tokensOut: null,
        tokensOutProvenance: "unrecorded" as const,
        activity: 1,
      },
      {
        day: "2024-01-02",
        start: Date.parse("2024-01-02T12:00:00Z"),
        assistantTurns: 0,
        tokensOut: null,
        tokensOutProvenance: "unrecorded" as const,
        activity: 0,
      },
      {
        day: "2024-01-03",
        start: Date.parse("2024-01-03T12:00:00Z"),
        assistantTurns: 0,
        tokensOut: null,
        tokensOutProvenance: "unrecorded" as const,
        activity: 1,
      },
    ];
    expect(rhythmOf(days)).toEqual({
      activeDays: 2,
      longestStreakDays: 1,
      busiestDay: { day: "2024-01-01", start: Date.parse("2024-01-01T12:00:00Z"), count: 1 },
    });
  });
});

describe("localMomentum", () => {
  const Aria = castId<CharacterId>("character_aria");
  const Bolt = castId<CharacterId>("character_bolt");
  // 2024-02-01 02:00 UTC is still January 31 in New York.
  const buckets = [
    { characterId: Aria, name: "Aria", bucketStart: Date.UTC(2024, 0, 15, 12, 0), replies: 1 },
    { characterId: Bolt, name: "Bolt", bucketStart: Date.UTC(2024, 0, 20, 12, 0), replies: 3 },
    { characterId: Aria, name: "Aria", bucketStart: Date.UTC(2024, 1, 1, 2, 0), replies: 4 },
    { characterId: Aria, name: "Aria", bucketStart: Date.UTC(2024, 1, 15, 12, 0), replies: 1 },
  ];

  test("an instant that is the 31st in New York but the 1st in UTC counts toward the viewer's month", () => {
    const utc = localMomentum(buckets, at("UTC"));
    expect([utc.prev?.key, utc.latest?.key]).toEqual(["2024-01", "2024-02"]);
    expect(utc.rising.map((row) => [row.name, row.prev, row.current, row.delta])).toEqual([["Aria", 1, 5, 4]]);
    expect(utc.falling.map((row) => [row.name, row.delta])).toEqual([["Bolt", -3]]);

    const newYork = localMomentum(buckets, at("America/New_York"));
    expect(newYork.rising).toEqual([]);
    expect(newYork.falling.map((row) => [row.name, row.prev, row.current, row.delta])).toEqual([
      ["Aria", 5, 1, -4],
      ["Bolt", 3, 0, -3],
    ]);
  });

  test("each month carries its earliest instant, so the time seam can name it", () => {
    const newYork = localMomentum(buckets, at("America/New_York"));
    expect(newYork.prev).toEqual({ key: "2024-01", start: Date.UTC(2024, 0, 15, 12, 0) });
    expect(newYork.latest).toEqual({ key: "2024-02", start: Date.UTC(2024, 1, 15, 12, 0) });
  });

  test("fewer than two months with replies compares nothing", () => {
    expect(localMomentum([], at("UTC"))).toEqual({ latest: null, prev: null, rising: [], falling: [] });
    expect(localMomentum(buckets.slice(0, 2), at("UTC"))).toEqual({ latest: null, prev: null, rising: [], falling: [] });
  });
});
