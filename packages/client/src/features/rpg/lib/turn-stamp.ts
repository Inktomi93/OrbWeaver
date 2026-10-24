import { timeLib } from "#lib";

/** The year's width in the kit's `YYYY-MM-DD` calendar day. */
const YEAR_DIGITS = 4;

/** The transcript stamps a message with `timeLib.formatTime`; a turn from today reads that same form, so a chip
 *  never prints a different time than the transcript. An older turn in the current year adds its month and day,
 *  so two cards from one earlier day still differ by their time. A turn from another year reads the kit's dated
 *  form, which names the year. */
export function turnStamp(createdAt: number): string {
  const was = timeLib.calendarPosition(createdAt).day;
  const now = timeLib.calendarPosition(timeLib.now()).day;
  if (was === now) {
    return timeLib.formatTime(createdAt);
  }
  if (was.slice(0, YEAR_DIGITS) !== now.slice(0, YEAR_DIGITS)) {
    return timeLib.formatDateTime(createdAt);
  }
  return `${timeLib.formatMonthDay(createdAt)}, ${timeLib.formatTime(createdAt)}`;
}
