// The viewer-calendar folds behind the Insights time charts: the server ships UTC quarter-hour buckets, and these
// place each bucket on the viewer's calendar through the time seam's `calendarPosition`, then shape days, weekdays,
// hours, rhythm and month-over-month momentum. Pure, so every timezone case is unit-testable with an injected zone.

import type { TokenProvenance } from "@orb/contracts/chat";
import { combineTokenProvenance } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import type { CalendarMonth, CalendarPosition } from "@orb/kit/time";
import { groupByCalendarMonth } from "@orb/kit/time";
import { WEEKDAY_LABELS } from "./analytics-view-model.ts";

const HOURS_PER_DAY = 24;
const MS_PER_DAY = 86_400_000;

/** One viewer-local calendar day of the activity timeline. */
export interface LocalDay {
  readonly day: string;
  /** The day's first bucket start: an instant on this local day, so the time seam can name the day. */
  readonly start: number;
  readonly assistantTurns: number;
  /** `null` when no bucket that day recorded output usage — absent accounting, never a measured zero. */
  readonly tokensOut: number | null;
  readonly tokensOutProvenance: TokenProvenance;
  /** Turns exchanged plus chats opened: the rhythm figures' and weekday bars' definition of activity. */
  readonly activity: number;
}

/** The activity timeline folded onto the viewer's calendar. */
export interface LocalTimeline {
  /** Days with any recorded bucket, ascending. */
  readonly days: readonly LocalDay[];
  /** Activity per weekday, Sun..Sat. */
  readonly weekdayActivity: readonly number[];
  /** Turns per (weekday, hour), Sun..Sat × 00..23 — system rows are not turns a reader exchanged. */
  readonly weekHourTurns: readonly (readonly number[])[];
  readonly peak: { readonly dayOfWeek: number; readonly hour: number; readonly count: number } | null;
}

/** Fold the server's UTC quarter-hour timeline into the viewer's days, weekdays and hours. `position` is
 *  the time seam's `calendarPosition`: a quarter-hour bucket never straddles a local hour in any zone, so
 *  placing a bucket by its start instant is exact. Buckets arrive ascending, so days come out ascending. */
export function localTimeline(
  buckets: readonly {
    readonly bucketStart: number;
    readonly chatsCreated: number;
    readonly userTurns: number;
    readonly assistantTurns: number;
    readonly tokensOut: number | null;
    readonly tokensOutProvenance: TokenProvenance;
  }[],
  position: (epochMs: number) => CalendarPosition,
): LocalTimeline {
  const days = new Map<string, LocalDay>();
  const weekdayActivity = WEEKDAY_LABELS.map(() => 0);
  const weekHourTurns = WEEKDAY_LABELS.map(() => Array.from({ length: HOURS_PER_DAY }, () => 0));
  for (const bucket of buckets) {
    const at = position(bucket.bucketStart);
    const turns = bucket.userTurns + bucket.assistantTurns;
    const activity = turns + bucket.chatsCreated;
    days.set(at.day, addBucketToDay(days.get(at.day), at.day, bucket, activity));
    weekdayActivity[at.weekday] = (weekdayActivity[at.weekday] ?? 0) + activity;
    const row = weekHourTurns[at.weekday];
    if (row !== undefined) {
      row[at.hour] = (row[at.hour] ?? 0) + turns;
    }
  }
  return { days: [...days.values()], weekdayActivity, weekHourTurns, peak: peakCell(weekHourTurns) };
}

function addBucketToDay(
  prior: LocalDay | undefined,
  day: string,
  bucket: {
    readonly bucketStart: number;
    readonly assistantTurns: number;
    readonly tokensOut: number | null;
    readonly tokensOutProvenance: TokenProvenance;
  },
  activity: number,
): LocalDay {
  if (prior === undefined) {
    return {
      day,
      start: bucket.bucketStart,
      assistantTurns: bucket.assistantTurns,
      tokensOut: bucket.tokensOut,
      tokensOutProvenance: bucket.tokensOutProvenance,
      activity,
    };
  }
  return {
    day,
    start: prior.start,
    assistantTurns: prior.assistantTurns + bucket.assistantTurns,
    tokensOut: bucket.tokensOut === null ? prior.tokensOut : (prior.tokensOut ?? 0) + bucket.tokensOut,
    tokensOutProvenance: combineTokenProvenance(prior.tokensOutProvenance, bucket.tokensOutProvenance),
    activity: prior.activity + activity,
  };
}

function peakCell(matrix: readonly (readonly number[])[]): LocalTimeline["peak"] {
  let peak: LocalTimeline["peak"] = null;
  matrix.forEach((row, dayOfWeek) => {
    row.forEach((count, hour) => {
      if (count > 0 && (peak === null || count > peak.count)) {
        peak = { dayOfWeek, hour, count };
      }
    });
  });
  return peak;
}

/** The rhythm figures over the viewer's days. */
export interface Rhythm {
  readonly activeDays: number;
  readonly longestStreakDays: number;
  readonly busiestDay: { readonly day: string; readonly start: number; readonly count: number } | null;
}

/** Active days, the longest run of consecutive active days, and the busiest day (the first, on a tie). */
export function rhythmOf(days: readonly LocalDay[]): Rhythm {
  const active = days.filter((day) => day.activity > 0);
  let busiestDay: Rhythm["busiestDay"] = null;
  let longestStreakDays = 0;
  let streak = 0;
  let previous: number | null = null;
  for (const day of active) {
    if (busiestDay === null || day.activity > busiestDay.count) {
      busiestDay = { day: day.day, start: day.start, count: day.activity };
    }
    // A calendar day's ordinal: the local date read as a UTC midnight, so a DST day still steps by one.
    const ordinal = Date.parse(`${day.day}T00:00:00Z`) / MS_PER_DAY;
    streak = previous !== null && ordinal - previous === 1 ? streak + 1 : 1;
    longestStreakDays = Math.max(longestStreakDays, streak);
    previous = ordinal;
  }
  return { activeDays: active.length, longestStreakDays, busiestDay };
}

/** One character's replies in the two compared months. */
export interface MomentumRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly current: number;
  readonly prev: number;
  readonly delta: number;
}

/** Rising and falling characters between the viewer's two most recent months with replies. */
export interface LocalMomentum {
  /** `null` when fewer than two months have replies. */
  readonly latest: CalendarMonth | null;
  readonly prev: CalendarMonth | null;
  readonly rising: readonly MomentumRow[];
  readonly falling: readonly MomentumRow[];
}

/** How many characters each momentum column lists. */
const MOMENTUM_LIMIT = 10;

/** Fold the per-character UTC quarter-hour reply timeline into the viewer's months and rank the swing
 *  between the two most recent months with replies. Anchored to the data's months, not to wall-clock now,
 *  so a quiet current month does not read as everything falling. */
export function localMomentum(
  buckets: readonly { readonly characterId: CharacterId; readonly name: string; readonly bucketStart: number; readonly replies: number }[],
  position: (epochMs: number) => CalendarPosition,
): LocalMomentum {
  const ordered = groupByCalendarMonth(buckets, (bucket) => bucket.bucketStart, position);
  const latest = ordered.at(-1);
  const prev = ordered.at(-2);
  if (latest === undefined || prev === undefined) {
    return { latest: null, prev: null, rising: [], falling: [] };
  }
  const names = new Map<CharacterId, string>();
  const repliesBy = (monthBuckets: typeof latest.rows): Map<CharacterId, number> => {
    const perCharacter = new Map<CharacterId, number>();
    for (const bucket of monthBuckets) {
      perCharacter.set(bucket.characterId, (perCharacter.get(bucket.characterId) ?? 0) + bucket.replies);
      names.set(bucket.characterId, bucket.name);
    }
    return perCharacter;
  };
  const current = repliesBy(latest.rows);
  const before = repliesBy(prev.rows);
  const rows = [...new Set([...current.keys(), ...before.keys()])].map((characterId): MomentumRow => {
    const now = current.get(characterId) ?? 0;
    const then = before.get(characterId) ?? 0;
    return { characterId, name: names.get(characterId) ?? "", current: now, prev: then, delta: now - then };
  });
  return {
    latest: latest.month,
    prev: prev.month,
    rising: rows
      .filter((row) => row.delta > 0)
      .toSorted((a, b) => b.delta - a.delta)
      .slice(0, MOMENTUM_LIMIT),
    falling: rows
      .filter((row) => row.delta < 0)
      .toSorted((a, b) => a.delta - b.delta)
      .slice(0, MOMENTUM_LIMIT),
  };
}
