// Open the Members context tab — the roster entry's action, from its chip and from the topbar's overflow menu. Entry-only:
// it never toggles closed (the collapse affordance is the context header's own control, D66 §2).

import type { ChatContextTabId } from "#lib";
import { revealContextPanel } from "#state";

export function openMembersTab(): void {
  revealContextPanel("members" satisfies ChatContextTabId);
}
