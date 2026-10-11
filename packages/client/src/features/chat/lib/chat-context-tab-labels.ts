// The labels of chat's own context tabs, in one import-free module so a CT spec's node side can import them.

import type { ChatContextTabId } from "#lib";

export const CHAT_CONTEXT_TAB_LABELS = {
  members: "Members",
  settings: "This chat",
  preview: "Preview",
} as const satisfies Record<ChatContextTabId, string>;
