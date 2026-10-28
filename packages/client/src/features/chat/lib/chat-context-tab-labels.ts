// Chat context tab names, including the shared plugin-tab label.

import type { ChatContextTabId } from "#lib";
import { CHAT_PLUGINS_TAB_LABEL } from "#lib";

/** The accessible name of the open chat's context tablist: the artifact noun the pane is about. */
export const CHAT_CONTEXT_TABLIST_NAME = "Chat";

export const CHAT_CONTEXT_TAB_LABELS = {
  members: "Members",
  settings: "This chat",
  preview: "Preview",
  plugins: CHAT_PLUGINS_TAB_LABEL,
} as const satisfies Record<ChatContextTabId, string>;
