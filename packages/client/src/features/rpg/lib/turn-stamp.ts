import { timeLib } from "#lib";

/** The transcript stamps a message with `timeLib.formatTime`; a turn from today reads that same form, so a chip
 *  never prints a different time than the transcript. An older turn adds its month and day, so two cards from
 *  one earlier day still differ by their time. */
export function turnStamp(createdAt: number): string {
  const today = timeLib.calendarPosition(timeLib.now()).day;
  const time = timeLib.formatTime(createdAt);
  return timeLib.calendarPosition(createdAt).day === today ? time : `${timeLib.formatMonthDay(createdAt)}, ${time}`;
}
