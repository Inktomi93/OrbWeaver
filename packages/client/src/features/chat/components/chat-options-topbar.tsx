// The active chat's options ⋯ menu, rendered at the END of the topbar TRAIL cluster (moved out of the
// identity row — chat-header.tsx — so the trail reads as one uniform ghost cluster, ui-cohesion-north-star
// §4 N1). The chrome body (lib/chat-options-chrome.tsx) renders <ChatOptionsTopbar/>; it reads the active
// committed chat from #state and resolves the roster + host gate from the same chat.getChat query the
// identity header already suspends on (TanStack dedupes the two reads).

import type { ChatId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useAuthConfig, useTRPC } from "#data";
import { useActiveChatId } from "#state";
import { filterCharacters } from "../lib/roster";
import { ChatOptionsMenu } from "./chat-options-menu";

/** The chrome-body wrapper: renders the options menu only for a COMMITTED active chat (a draft/landing
 *  has no chat-level actions). Narrows the nullable active-chat pointer so the query child always has an id
 *  — chatOptionsChrome's `useVisible` already gates this to the chats section, so `null` is the belt case. */
export function ChatOptionsTopbar(): ReactElement | null {
  const chatId = useActiveChatId();
  if (chatId === null) {
    return null;
  }
  return <ActiveChatOptionsMenu chatId={chatId} />;
}

/** Resolves the active chat's roster + server host gate (`viewerIsHost`) from the shared getChat query and
 *  renders the ⋯ menu — the same wiring the identity row used before N1 moved the menu into the trail. */
export function ActiveChatOptionsMenu({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const { data: authConfig } = useAuthConfig();
  const characters = filterCharacters(chat?.participants ?? []).map((c) => ({ characterId: c.characterId, name: c.displayName }));
  return (
    <ChatOptionsMenu
      chatId={chatId}
      title={chat?.title ?? null}
      characters={characters}
      isHost={chat?.viewerIsHost === true}
      multiHumanCapable={authConfig?.multiHumanCapable === true}
    />
  );
}
