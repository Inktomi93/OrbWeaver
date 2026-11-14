import { useTRPC } from "@orb/client/data";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MemoryViewTab } from "#client/features/chat/components/memory-view-tab.tsx";

// The tab takes the viewer's host verdict and roster from the room read, as the chats section's context state does.
function RoomMemoryTab({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  return data === undefined ? null : <MemoryViewTab chatId={chatId} isHost={data.viewerIsHost} participants={data.participants} />;
}

/** The production Memory tab for one room at the context pane's width, as the signed-in viewer sees it. */
export function MemoryViewTabStory({ chatId, width = 367 }: { readonly chatId: ChatId; readonly width?: number }): ReactElement {
  return (
    <CtClientProviders>
      <Container role="group" aria-label="Chat context host" style={{ inlineSize: width }}>
        <RoomMemoryTab chatId={chatId} />
      </Container>
    </CtClientProviders>
  );
}
