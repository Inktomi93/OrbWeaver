import { useTRPC } from "@orb/client/data";
import { makeRpgContextTabs, rpgDiceComposerMediaSurface } from "@orb/client/features/rpg";
import type { ChatContextState } from "@orb/client/lib";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Menu, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Suspense, useState } from "react";

/** The rpg context tabs the stories mount, by their production contribution id. */
type RpgTabId = "rpg.status" | "rpg.scene";

/** The committed context-panel state for `chatId`, read off the same `chat.getChat` the rpg tabs gate on. */
function useCommittedContext(chatId: ChatId): ChatContextState {
  const trpc = useTRPC();
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  return {
    phase: "committed",
    chatId,
    title: chat.title,
    participants: chat.participants,
    identities: chat.identities,
    viewerUserId: chat.viewerUserId,
    pendingHostUserId: chat.pendingHostUserId,
    roomOverrides: chat.roomOverrides,
    isHost: chat.viewerIsHost === true,
    multiHumanCapable: false,
    background: chat.background,
  };
}

function ContributedTab({ chatId, tab }: { readonly chatId: ChatId; readonly tab: RpgTabId }): ReactNode {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const state = useCommittedContext(chatId);
  const [tabs] = useState(() => makeRpgContextTabs({ trpc, queryClient }));
  const def = tabs.find((candidate) => candidate.id === tab);
  return def === undefined ? null : def.body(state);
}

/** One rpg game tab as the chat context panel mounts it: the production contribution body for a committed chat. */
export function RpgContextTabStory({ chatId, tab }: { readonly chatId: ChatId; readonly tab: RpgTabId }): ReactElement {
  return (
    <CtClientProviders>
      <Suspense>
        <ContributedTab chatId={chatId} tab={tab} />
      </Suspense>
    </CtClientProviders>
  );
}

/** The rpg dice group as contributed to the composer's Message tools menu, inside a story-owned menu host. */
export function RpgDiceComposerStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <Menu>
        <MenuTrigger>Message tools</MenuTrigger>
        <MenuPopup>{rpgDiceComposerMediaSurface.anchor === "message-footer" ? null : rpgDiceComposerMediaSurface.body({ chatId })}</MenuPopup>
      </Menu>
    </CtClientProviders>
  );
}
