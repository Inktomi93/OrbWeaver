// The "Forks" body of the This-chat tab: the fork children of this room the viewer can open (`chat.listForks`).
// Rows are the chat list's own `ChatSummaryRow`, so a fork reads the same here as in the chats pane.

import type { ChatId } from "@orb/kit/ids";
import { EmptyState } from "@orb/ui/empty-state";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useSuspenseQuery, useTRPC } from "#data";
import { selectChatFromList } from "#state";
import { ChatSummaryRow } from "./chat-summary-row.tsx";

export function ChatForksSection({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: forks } = useSuspenseQuery(trpc.chat.listForks.queryOptions({ chatId }));
  if (forks.length === 0) {
    return (
      <EmptyState action={null} description="Fork a message from its menu to branch this chat. Forks you can open are listed here." title="No forks yet" />
    );
  }
  return (
    <Stack gap="field">
      {forks.map((fork) => (
        <ChatSummaryRow chat={fork} key={fork.id} onSelect={selectChatFromList} portraits={fork.participantPortraits} />
      ))}
    </Stack>
  );
}
