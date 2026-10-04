// The host's room switch for members' persona-attached world-info books (`chat.setMemberPersonaLore`).
// Host-only mount; reads `ChatDetail.memberPersonaLore` (absent on the blob ⇒ on) and writes on change.

import type { ChatId } from "@orb/kit/ids";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { SettingSwitchRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useSetMemberPersonaLore } from "../hooks/use-context-panel-mutations.ts";

export interface MemberPersonaLoreControlProps {
  readonly chatId: ChatId;
}

/** The host-only "members' persona lore joins this chat" row. */
export function MemberPersonaLoreControl({ chatId }: MemberPersonaLoreControlProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const setEnabled = useSetMemberPersonaLore({ trpc, invalidation });
  return (
    <SettingSwitchRow
      label="Members' persona lore"
      description="Lorebooks attached to other members' personas join this chat's prompt. Turn off to keep only your own lore, the chat's and the characters'."
      checked={chat.memberPersonaLore}
      onChange={(next): void => {
        setEnabled.mutate({ chatId, enabled: next });
      }}
    />
  );
}
