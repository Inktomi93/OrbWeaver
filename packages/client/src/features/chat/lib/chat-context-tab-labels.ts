// Chat context pane names: the tablist, the tabs (including the shared plugin-tab label) and the pane's no-room copy.

import type { ChatContextTabId } from "#lib";
import { CHAT_PLUGINS_TAB_LABEL } from "#lib";

/** The accessible name of the open chat's context tablist: the artifact noun the pane is about. */
export const CHAT_CONTEXT_TABLIST_NAME = "Chat";

/** What the pane says while no room is open; an open room always has its tabs instead. */
export const CHAT_CONTEXT_EMPTY = {
  title: "No chat open",
  description: "Open a thread and this pane carries its characters, its memory, and the knobs that apply to it.",
} as const;

export const CHAT_CONTEXT_TAB_LABELS = {
  members: "Members",
  settings: "This chat",
  preview: "Preview",
  plugins: CHAT_PLUGINS_TAB_LABEL,
} as const satisfies Record<ChatContextTabId, string>;
