// Chat's "Temp chat" HOME tile contribution. Its button is `intent="secondary"` and it sits on the shelf beside the
// other things you reach for; Home's one focal is the resume-room hero in `home-recents-tile`'s body.

import { Clock } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { HomeTempChatSkeleton, HomeTempChatTileBody, TEMP_CHAT_SKELETON_ROWS } from "../components/home-temp-chat-tile-body.tsx";

const TEMP_CHAT_TILE_ORDER = 30;

export const chatTempChatTile: HomeTileContribution = {
  id: "chat.tempChat",
  title: "Temp chat",
  icon: Clock,
  order: TEMP_CHAT_TILE_ORDER,
  region: "shelf",
  // The loading box is the body's own anatomy (a button over one gloss paragraph), so it wraps exactly as the settled
  // body does at every track width; a px constant is right at one width only.
  skeleton: () => <HomeTempChatSkeleton />,
  skeletonRows: TEMP_CHAT_SKELETON_ROWS,
  body: () => <HomeTempChatTileBody />,
};
