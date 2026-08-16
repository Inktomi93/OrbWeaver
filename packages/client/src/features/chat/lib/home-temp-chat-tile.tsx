// Chat's "Temp chat" HOME tile contribution (home-section-spec §5). This tile carries the ONE accent
// primary on the whole home screen (CD3 — every other tile's affordance is a ghost or plain text).

import { Clock } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { HomeTempChatTileBody, TEMP_CHAT_SKELETON_ROWS } from "../components/home-temp-chat-tile-body.tsx";

const TEMP_CHAT_TILE_ORDER = 30;

export const chatTempChatTile: HomeTileContribution = {
  id: "chat.tempChat",
  title: "Temp chat",
  icon: Clock,
  order: TEMP_CHAT_TILE_ORDER,
  // The FIRST-BOOT reservation (#92): a fixed two-row body over-reserved by a whole row on the 3-row
  // default, which pulled the tiles below it UP when the read landed.
  skeletonRows: TEMP_CHAT_SKELETON_ROWS,
  body: () => <HomeTempChatTileBody />,
};
