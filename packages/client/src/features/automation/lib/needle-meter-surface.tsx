// The automation `thread-flank` surface contribution (§6c/M8) — the door-side half of #16's needle meter.
// automation never imports chat and chat never imports automation; `authed-app.tsx` owns both and injects
// this array member, exactly as it does for rpg's per-row disclosure and the S1 control mount.
//
// THE `when`/`body` SPLIT IS THE SEAM'S OWN LAW (the `rpgTurnToolCallsSurface` precedent): `when` is SYNC and
// sees only the room projection, so it answers "could this ever apply" — a committed room, since the read is
// chat-keyed. Whether there IS a score right now is DATA, and that answer lives in the body, which returns
// `null` until the room carries one.
//
// WHY THAT IS SAFE FOR THE LAYOUT, stated because it was not always: the room activates its flank COLUMN on
// the contribution count, not on what the bodies paint, so a mounted-but-silent widget used to cost every
// room a column gap. The flank stack now carries `empty:hidden` — the same SILENT-CONTRIBUTOR collapse the
// above-composer band shipped with — so "mounted but silent" and "not mounted" render identically.

import type { ChatSurfaceContribution } from "#lib";
import { NeedleMeter } from "../components/needle-meter.tsx";

/** The stable contribution id (the registry key + the flank row's React key). */
const NEEDLE_METER_SURFACE_ID = "automation-needle-meter";

/** The needle's tension dial, mounted beside the transcript. Added at the `main.tsx` door. */
export const automationNeedleMeterSurface: ChatSurfaceContribution = {
  id: NEEDLE_METER_SURFACE_ID,
  anchor: "thread-flank",
  // A draft room has no server row to read variables from (`chatId: null`), and nothing could have scored it.
  when: ({ chatId }) => chatId !== null,
  body: ({ chatId }) => (chatId === null ? null : <NeedleMeter chatId={chatId} />),
};
