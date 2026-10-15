import { useChatBusDeps, useTRPC } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import { chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser/ct-door.ts";
import { Stack } from "@orb/ui/layout";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

function ChatRead({ chatId, revision }: { readonly chatId: ChatId; readonly revision: number }): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const busDeps = useChatBusDeps();
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (revision !== 0) {
      queryClient
        .invalidateQueries(trpc.chat.listMessages.queryFilter({ chatId }))
        .then(() => setSettled(revision))
        .catch(globalThis.reportError);
    }
  }, [chatId, queryClient, revision, trpc]);
  return (
    <>
      <output aria-label="Read revision">{settled}</output>
      <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />
    </>
  );
}

export function TideMediaLifetimeStory({ chatId, revision = 0 }: { readonly chatId: ChatId; readonly revision?: number }): ReactElement {
  return (
    <CtClientProviders>
      <Stack className="h-screen">
        <ChatRead chatId={chatId} revision={revision} />
      </Stack>
    </CtClientProviders>
  );
}
