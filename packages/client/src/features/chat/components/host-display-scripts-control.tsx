// The per-room DISPLAY-TIER broadcast switch (D121-E, owner ruling 2026-08-02) — the CLIENT half of
// `chat.setHostDisplayScripts`.
//
// WHAT IT DOES, in the host's terms: the display scripts attached to this room (its tiers, resolved under the
// host) change only the host's screen until this is on. Turning it on shows them to everyone in the room, so a
// host can stage a shared look. Everyone's own Everywhere scripts still run last, so nobody is ever locked into
// someone else's styling.
//
// A room-settings control on the chat context panel's Settings tab (NOT a settings pane), mounted only
// under `isHost` — the §8.1 permission-OMIT, matching the tool-round control in the same section. Reads the
// current state from `getChat` (cache-first, `ChatDetail.hostDisplayScripts`) and writes on change.
//
// RENDER-ONLY. This switch cannot change what the model sees, what is persisted, or what anyone types — the
// display leg runs on the way to the DOM and nowhere else.

import type { ChatId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { SettingSwitchRow } from "#components";
import { roomRosterOptions, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { useSetHostDisplayScripts } from "../hooks/use-context-panel-mutations.ts";

export interface HostDisplayScriptsControlProps {
  readonly chatId: ChatId;
}

/** The host-only "share my display scripts with this room" row. */
export function HostDisplayScriptsControl({ chatId }: HostDisplayScriptsControlProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: chat } = useSuspenseQuery(roomRosterOptions(trpc, { chatId }));
  const setEnabled = useSetHostDisplayScripts({ trpc, invalidation });
  return (
    // `SettingSwitchRow`, not a hand-paired Field+Switch: the composite is the ONE home for the row
    // grammar, and Base UI mints the label/control id from field context (C21 / LANE NAVFORM).
    <SettingSwitchRow
      label="Show this room's display scripts to everyone"
      description="The display scripts attached to this room change only your own screen until this is on. Turn it on to show them to everyone here. Their own Everywhere scripts still run last. Never changes what's sent to the model or what anyone types."
      checked={chat.hostDisplayScripts}
      onChange={(next): void => {
        setEnabled.mutate({ chatId, enabled: next });
      }}
    />
  );
}
