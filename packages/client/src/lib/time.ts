// THE client date/time seam (UI-Arch §2.1 + §11.5): the wire is ALWAYS epoch-ms UTC; localization
// to the viewer's timezone happens exactly ONCE, at the display edge, through `@orb/kit/time`'s
// display factory (the one sanctioned `Intl` site). Never store or send a formatted date or a tz.
// Tests build their own pinned lib (`createTimeLib({ now, locale, timeZone })` — re-exported from
// the lib front door).

import type { TimeLib } from "@orb/kit/time";
import { createTimeLib } from "@orb/kit/time";

/** The production instance — browser locale + timezone, real clock (defaulted inside the kit seam). */
export const timeLib: TimeLib = createTimeLib();
