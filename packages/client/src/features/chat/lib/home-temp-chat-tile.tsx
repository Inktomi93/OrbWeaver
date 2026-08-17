// Chat's "Temp chat" HOME tile contribution (home-section-spec §5).
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

export const chatTempChatTile: HomeTileContribution = {
  id: "chat.tempChat",
  title: "Temp chat",
  icon: Clock,
  order: TEMP_CHAT_TILE_ORDER,
  region: "shelf",
  // The FIRST-BOOT reservation (#92): a fixed two-row body over-reserved by a whole row on the 3-row
  // default, which pulled the tiles below it UP when the read landed.
  skeletonRows: TEMP_CHAT_SKELETON_ROWS,
  body: () => <HomeTempChatTileBody />,
};
