// The per-room DISPLAY-TIER sharing switch (D121-E) — the CLIENT half of `chat.setHostDisplayScripts`.
//
// WHAT IT DOES, in the host's terms: the display scripts attached to this room (its tiers, resolved under the
// host) draw on everyone's screen in the room unless the host switches this off. A room whose host never touched it
// shares (`ChatDetail.hostDisplayScripts` reads true), so the switch reads on and is the way to stop sharing, never an
// opt-in. Everyone's own Everywhere scripts still run last, so nobody is ever locked into someone else's styling.
//
// A room-settings control under the On screen roster (NOT a settings pane), mounted only under `isHost` — the §8.1
// permission-OMIT. Reads the current state from `getChat` (cache-first, `ChatDetail.hostDisplayScripts`) and writes
// on change.
//
// RENDER-ONLY. This switch cannot change what the model sees, what is persisted, or what anyone types — the
// display leg runs on the way to the DOM and nowhere else.

import type { ChatId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { SettingSwitchRow } from "#components";
import { roomRosterOptions, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { useSetHostDisplayScripts } from "../hooks/use-context-panel-mutations.ts";
import { REGEX_SHARE_DISPLAY_SETTING } from "../lib/regex-section-model.ts";

export interface HostDisplayScriptsControlProps {
  readonly chatId: ChatId;
}

/** The host-only switch that stops, or resumes, showing this room's display scripts to everyone. */
export function HostDisplayScriptsControl({ chatId }: HostDisplayScriptsControlProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: chat } = useSuspenseQuery(roomRosterOptions(trpc, { chatId }));
  const setEnabled = useSetHostDisplayScripts({ trpc, invalidation });
  return (
    // `SettingSwitchRow`, not a hand-paired Field+Switch: the composite is the ONE home for the row
    // grammar, and Base UI mints the label/control id from field context (C21 / LANE NAVFORM).
    <SettingSwitchRow
      label={REGEX_SHARE_DISPLAY_SETTING}
      description="On unless you switch it off. Everyone in this room sees the scripts attached to it drawn on their screen, as you do, and sees each one's name, where it comes from and its pattern in their On screen list. Their own Everywhere scripts still run last. Switched off, they see only their own. Never changes what's sent to the model or what anyone types."
      checked={chat.hostDisplayScripts}
      onChange={(next): void => {
        setEnabled.mutate({ chatId, enabled: next });
      }}
    />
  );
}
