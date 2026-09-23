// Automation's QUICK-REPLY CHIP control source for chat's one above-composer band (§6c, row B3). A value, not a registration: the door
// (`compose/authed-app.tsx`) appends it to the `chat-controls` registry beside the S4 card source, and chat
// renders both blind through the single mount — neither feature imports the other.

import type { ChatControlSource } from "#lib";
import { AutomationQuickReplyMount } from "../components/quick-reply-chip-mount.tsx";

/** The registry key — one source, one id; the band namespaces this source's chip ids under it. */
const AUTOMATION_QUICK_REPLY_SOURCE_ID = "automation-quick-replies";

/** The B3 member-visible chips. `mount` is rendered as a COMPONENT by the band, so its hook (the room
 *  subscription) lives in its own fiber. */
export const automationQuickReplySource: ChatControlSource = {
  id: AUTOMATION_QUICK_REPLY_SOURCE_ID,
  mount: AutomationQuickReplyMount,
};
