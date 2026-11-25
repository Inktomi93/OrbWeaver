// A date-time stamp wraps between its date and its time, never inside the time: a row that narrows to three lines must not strand
// the meridiem ("AM") on a line of its own. A 24-hour locale has no meridiem and prints as the platform formats it.
// @subject packages/kit/src/time/index.ts
import { createTimeLib } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";

const INSTANT = Date.UTC(2026, 9, 5, 7, 57);
const NO_BREAK_SPACES = new Set([String.fromCodePoint(0xa0), String.fromCodePoint(0x20_2f)]);

test.for([{ locale: "en-US" }, { locale: "en-AU" }, { locale: "es-US" }])(
  "$locale: the meridiem sits behind a no-break space, and the date still wraps",
  ({ locale }) => {
    const stamp = createTimeLib({ locale, timeZone: "UTC" }).formatDateTime(INSTANT);

    const beforeMeridiem = stamp.slice(stamp.indexOf("57") + 2, stamp.indexOf("57") + 3);
    expect(NO_BREAK_SPACES.has(beforeMeridiem)).toBe(true);
    // The control: the gap between the date and the time stays a breaking space, so the stamp can still wrap there.
    const beforeTime = stamp.slice(stamp.indexOf("07") - 1, stamp.indexOf("07"));
    expect(beforeTime).toBe(" ");
  },
);

test("a 24-hour locale prints as the platform formats it", () => {
  const lib = createTimeLib({ locale: "en-GB", timeZone: "UTC" });
  expect(lib.formatDateTime(INSTANT)).toBe("5 Oct 2026, 07:57");
  expect(lib.formatTime(INSTANT)).toBe("07:57");
});

test.for([{ locale: "en-US" }, { locale: "en-AU" }, { locale: "es-US" }])("$locale: a bare time keeps its meridiem on the line with it", ({ locale }) => {
  const stamp = createTimeLib({ locale, timeZone: "UTC" }).formatTime(INSTANT);

  expect(NO_BREAK_SPACES.has(stamp.slice(stamp.indexOf("57") + 2, stamp.indexOf("57") + 3))).toBe(true);
});
