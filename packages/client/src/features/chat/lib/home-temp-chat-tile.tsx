// Chat's "Temp chat" HOME tile contribution.
//
// CD3 RE-RULED, 2026-08-16 (owner pick on program #102). This header used to read: "This tile carries the
// ONE accent primary on the whole home screen (CD3 — every other tile's affordance is a ghost or plain
// text)." Kept struck rather than deleted, because it was a recorded decision. Home's one focal is now
// the resume-room hero in `home-recents-tile`'s body (stripe + the rationed ::before glow, zero accent
// fill); this tile's button is `intent="secondary"`, and it sits on the SHELF beside the other things you
// reach for, not in the hearth.

import { Clock } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { HomeTempChatTileBody, TEMP_CHAT_SKELETON_ROWS } from "../components/home-temp-chat-tile-body.tsx";

const TEMP_CHAT_TILE_ORDER = 30;

/** The measured settled body block — see the `skeletonBlock` note on the contribution below.
 *  RE-MEASURED 2026-09-02 (#1146, the reservation sweep post `ed55bf193`): that pass re-authored every
 *  leading token as a snapped rem dimension (`leading.body` 1.55 -\> `round(1.4375rem, 1px)`, among
 *  others), which moves any settled block built from two voices of text. The `#177` first-boot CT's own
 *  declared-vs-settled printout read `chat.tempChat reserved 114.00 settled 113.00 drift -1.00` against
 *  the OLD 93 — still inside the test's ±1px epsilon, but a real 1px shrink, not epsilon noise, so this
 *  is the re-measurement rather than a widened tolerance. 92 is the new declaration (93 - 1). RE-MEASURED
 *  2026-08-17 (rail sweep P3-16): the CTA came down to `size="sm"` so the shelf's two peer-rank CTAs
 *  share one register, which shortened this fixed body. 93 was that re-measurement, reported by the
 *  `#177` first-boot CT as `chat.tempChat moved -2.36px` against the old 95. */
const TEMP_CHAT_SKELETON_BLOCK_PX = 92;

export const chatTempChatTile: HomeTileContribution = {
  id: "chat.tempChat",
  title: "Temp chat",
  icon: Clock,
  order: TEMP_CHAT_TILE_ORDER,
  region: "shelf",
  // The FIRST-BOOT reservation (#92): a fixed two-row body over-reserved by a whole row on the 3-row
  // default, which pulled the tiles below it UP when the read landed.
  //
  // …and TWO rows is still 17px too tall (#177). Measured on the live home at 1280×900 with the tRPC
  // responses held so the loading state is observable: 112px reserved against a 94.64px settled body,
  // which pulled `databank.documents` and the doorway group up on every first boot. The body is a button
  // over one gloss line — a CONSTANT — so it declares the measurement instead of the nearest whole row.
  // The row count stays as the fill-count fallback for the box. Re-measure if the gloss grows a line.
  skeletonBlock: TEMP_CHAT_SKELETON_BLOCK_PX,
  skeletonRows: TEMP_CHAT_SKELETON_ROWS,
  body: () => <HomeTempChatTileBody />,
};
