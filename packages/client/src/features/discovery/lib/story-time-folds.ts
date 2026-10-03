// The story-time folds behind the Corpus theme charts: the server ships UTC calendar buckets, and these group
// them into the viewer's months through the time seam's `calendarPosition`. Pure, so every timezone case is
// unit-testable with an injected zone.

import type { ThemeDriftBucket, ThemeDriftTheme, ThemeTimelineBucket } from "@orb/contracts/discovery";
import type { CalendarMonth, CalendarPosition } from "@orb/kit/time";
import { groupByCalendarMonth } from "@orb/kit/time";

/** How many themes each story-time month lists. */
const THEME_DRIFT_TOP = 6;

/** One of the viewer's months of theme drift: its leading themes, count-descending. */
export interface LocalThemeDriftMonth {
  readonly month: CalendarMonth;
  readonly themes: readonly ThemeDriftTheme[];
}

/** One of the viewer's months of a theme's timeline. */
export interface LocalThemeTimelineMonth {
  readonly month: CalendarMonth;
  readonly count: number;
}

/** Fold theme-drift buckets into the viewer's months, summing each theme across the month's buckets and keeping
 *  the leading themes. The cut runs after the fold, so a theme that leads the viewer's month is never dropped
 *  for trailing in one UTC bucket. Ties keep cluster order, so the cut is stable between reads. */
export function localThemeDrift(buckets: readonly ThemeDriftBucket[], position: (epochMs: number) => CalendarPosition): LocalThemeDriftMonth[] {
  return groupByCalendarMonth(buckets, (bucket) => bucket.bucketStart, position).map(({ month, rows }) => {
    const themes = new Map<number, ThemeDriftTheme>();
    for (const theme of rows.flatMap((bucket) => bucket.themes)) {
      const prior = themes.get(theme.clusterIdx);
      themes.set(theme.clusterIdx, prior === undefined ? theme : { ...prior, count: prior.count + theme.count });
    }
    return {
      month,
      themes: [...themes.values()].toSorted((a, b) => b.count - a.count || a.clusterIdx - b.clusterIdx).slice(0, THEME_DRIFT_TOP),
    };
  });
}

/** Fold a theme's timeline buckets into the viewer's months, ascending. */
export function localThemeTimeline(buckets: readonly ThemeTimelineBucket[], position: (epochMs: number) => CalendarPosition): LocalThemeTimelineMonth[] {
  return groupByCalendarMonth(buckets, (bucket) => bucket.bucketStart, position).map(({ month, rows }) => ({
    month,
    count: rows.reduce((sum, bucket) => sum + bucket.count, 0),
  }));
}
