// The automation `thread-flank` surface contribution for B9's clock —
// the door-side half of #7's `SegmentedClock`. automation never imports chat and chat never imports
// automation; `authed-app.tsx` owns both and injects this array member, exactly as it does for the needle
// meter, rpg's per-row disclosure and the S1 control mount.
//
// THE `when`/`body` SPLIT IS THE SEAM'S OWN LAW (the `automationNeedleMeterSurface` precedent): `when` is SYNC
// and sees only the room projection, so it answers "could this ever apply" — a committed room, since the read
// is chat-keyed. Whether there IS a clock right now is DATA, and that answer lives in the body, which returns
// `null` until the room's vars carry a valid published max.
//
// WHY THAT IS SAFE FOR THE LAYOUT: the room activates its flank COLUMN on the contribution count, not on what
// the bodies paint, and the flank stack carries `empty:hidden` — so a mounted-but-silent widget renders
// identically to one that is not mounted, and a room with no clock grows no automation chrome.

import type { ChatSurfaceContribution } from "#lib";
import { ClockMeter } from "../components/clock-meter.tsx";

/** The stable contribution id (the registry key + the flank row's React key). */
const CLOCK_METER_SURFACE_ID = "automation-clock-meter";

/** The fill clock, mounted beside the transcript. Added at the `authed-app.tsx` door. */
export const automationClockMeterSurface: ChatSurfaceContribution = {
  id: CLOCK_METER_SURFACE_ID,
  anchor: "thread-flank",
  // A draft room has no server row to read variables from (`chatId: null`), and nothing could have clocked it.
  when: ({ chatId }) => chatId !== null,
  body: ({ chatId }) => (chatId === null ? null : <ClockMeter chatId={chatId} />),
};
