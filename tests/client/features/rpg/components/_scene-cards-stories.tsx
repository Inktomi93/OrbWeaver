import { useTRPC } from "@orb/client/data";
import { RpgSceneCards } from "@orb/client/features/rpg";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect } from "react";

// A non-zero revision refetches the room's messages in place, as a bus invalidation does: settled data stays, nothing suspends.
function MessagesRefetch({ chatId, revision }: { readonly chatId: ChatId; readonly revision: number }): null {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (revision !== 0) {
      queryClient.invalidateQueries(trpc.chat.listMessages.queryFilter({ chatId })).catch(globalThis.reportError);
    }
  }, [chatId, queryClient, revision, trpc]);
  return null;
}

/** The Scene tab's card archive under the production providers, for a game with immersive cards on. */
export function RpgSceneCardsStory({ chatId, revision = 0 }: { readonly chatId: ChatId; readonly revision?: number }): ReactElement {
  return (
    <CtClientProviders>
      <MessagesRefetch chatId={chatId} revision={revision} />
      <RpgSceneCards chatId={chatId} enabled={true} />
    </CtClientProviders>
  );
}
