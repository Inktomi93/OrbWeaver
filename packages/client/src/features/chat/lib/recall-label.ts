// The accessible name for each recall state — the state lives in the NAME (the visible count is `aria-hidden`), so a
// screen reader is the equal of the eye. Stable "Memory" prefix leads so a role+name lookup survives the value change
// (the roster-chip precedent, WCAG 2.5.3). The topbar chip and its overflow menu item share it.

import type { RecallState } from "#state";
import { CHAT_MEMORY_ENTRY_PREFIX } from "./chat-surface-names.ts";

export function recallLabel(recall: RecallState | null): string {
  if (recall === null) {
    return `${CHAT_MEMORY_ENTRY_PREFIX}idle`;
  }
  if (recall.phase === "recalling") {
    return `${CHAT_MEMORY_ENTRY_PREFIX}recalling`;
  }
  return `${CHAT_MEMORY_ENTRY_PREFIX}${recall.count} recalled`;
}
