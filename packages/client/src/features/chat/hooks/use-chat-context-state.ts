// The Chats CONTEXT-panel projection hook (client-architecture-lockdown.md §6b) — resolves the active chat
// handle into the `ChatContextState` the section's tabs consume. All reads are unconditional
// (rules-of-hooks); the `getChat` read uses the `useSuspenseQueries` dynamic-array idiom so it suspends ONLY
// when a room is open — a null-on-pending would flash the placeholder (a lying state).
//
// ONE PHASE (chat-creation-draft-mode-replacement.md §4.1, R1). The projection used to be a discriminated
// union with a `draft` arm carrying a founding-cast array instead of a roster, and every tab body branched
// on it. A room has a chat row from the creation click, so the projection is the committed one and `null`
// means exactly "nothing is open".

import { useSuspenseQueries } from "@tanstack/react-query";
import { useAuthConfig, useTRPC } from "#data";
import type { ChatContextState } from "#lib";
import { useActiveChatId } from "#state";

export function useChatContextState(): ChatContextState | null {
  const chatId = useActiveChatId();
  const { data: authConfig } = useAuthConfig();
  const multiHumanCapable = authConfig?.multiHumanCapable === true;
  const trpc = useTRPC();
  const chatQueries = useSuspenseQueries({
    queries: (chatId === null ? [] : [chatId]).map((id) => trpc.chat.getChat.queryOptions({ chatId: id })),
  });

  const chatQuery = chatQueries[0];
  if (chatId === null || chatQuery === undefined) {
    return null;
  }
  const chat = chatQuery.data;
  return {
    phase: "committed",
    chatId,
    participants: chat.participants,
    viewerUserId: chat.viewerUserId,
    pendingHostUserId: chat.pendingHostUserId,
    roomOverrides: chat.roomOverrides,
    isHost: chat.viewerIsHost === true,
    multiHumanCapable,
    background: chat.background,
  };
}
