// The per-room DISPLAY-TIER broadcast switch (D121-E, owner ruling 2026-08-02) — the CLIENT half of
// `chat.setHostDisplayScripts`.
//
// WHAT IT DOES, in the host's terms: display-tier regex is normally a private reading preference — each
// person sees only their own scripts applied to the transcript. Turning this on shares the HOST'S display
// scripts with everyone in this room, so a host can stage a shared look. Everyone's own scripts still apply
// on top, so nobody is ever locked into someone else's styling.
//
// A room-settings control on the chat context panel's Settings tab (NOT a settings pane), mounted only
// under `isHost` — the §8.1 permission-OMIT, matching the tool-round control in the same section. Reads the
// current state from `getChat` (cache-first, `ChatDetail.hostDisplayScripts`) and writes on change.
//
// RENDER-ONLY. This switch cannot change what the model sees, what is persisted, or what anyone types — the
// display leg runs on the way to the DOM and nowhere else.

import type { ChatId } from "@orb/kit/ids";
import { SettingRow } from "@orb/ui/setting-row";
import { Switch } from "@orb/ui/switch";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useSetHostDisplayScripts } from "../hooks/use-context-panel-mutations";

export interface HostDisplayScriptsControlProps {
  readonly chatId: ChatId;
}

/** The host-only "share my display scripts with this room" row. */
export function HostDisplayScriptsControl({ chatId }: HostDisplayScriptsControlProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const setEnabled = useSetHostDisplayScripts({ trpc, invalidation });
  const id = useId();

  return (
    <SettingRow
      id={id}
      label="Show my display scripts to everyone"
      description="Your display-only regex normally changes just your own view. Turn this on to apply it to the transcript for everyone in this room — their own display scripts still run on top. Never changes what's sent to the model or what anyone types."
    >
      <Switch
        id={id}
        checked={chat.hostDisplayScripts}
        onCheckedChange={(next): void => {
          setEnabled.mutate({ chatId, enabled: next });
        }}
      />
    </SettingRow>
  );
}
