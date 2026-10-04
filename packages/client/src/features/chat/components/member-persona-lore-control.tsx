// The host's room switch for members' persona-attached world-info books (`chat.setMemberPersonaLore`), and the
// member-side notice that the host turned it off. Both read `ChatDetail.memberPersonaLore` (absent on the blob ⇒ on).

import type { ChatId } from "@orb/kit/ids";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { SettingSwitchRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useSetMemberPersonaLore } from "../hooks/use-context-panel-mutations.ts";

export interface MemberPersonaLoreControlProps {
  readonly chatId: ChatId;
}

/** The member-side line under World books when the host keeps members' persona lore out of the prompt; nothing
 *  when it is on. Mounted for members only — the host sees the switch itself. */
export function MemberPersonaLoreNotice({ chatId }: MemberPersonaLoreControlProps): ReactElement | null {
  const trpc = useTRPC();
  // Non-suspending on purpose: the line must never hold the World books rows behind a second read.
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  if (chat === undefined || chat.memberPersonaLore) {
    return null;
  }
  return (
    <Text voice="gloss" data-slot="member-persona-lore-off">
      The host isn't using members' persona lore in this chat.
    </Text>
  );
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
      description="Use the lorebooks other members attached to their personas in this chat's prompt. When off, only your lorebooks, this chat's and the characters' are used."
      checked={chat.memberPersonaLore}
      onChange={(next): void => {
        setEnabled.mutate({ chatId, enabled: next });
      }}
    />
  );
}
