// The Chats CONTEXT-panel projection hook (client-architecture-lockdown.md §6b) — resolves the active chat
// handle into the `CommittedChatContext` the section's tabs consume. All reads are unconditional
// (rules-of-hooks); the `getChat` read uses the `useSuspenseQueries` dynamic-array idiom so it suspends ONLY
// when a room is open — a null-on-pending would flash the placeholder (a lying state).
//
// ONE PHASE (D166). The projection used to be a discriminated
// union with a `draft` arm carrying a founding-character array instead of a roster, and every tab body branched
// on it. A room has a chat row from the creation click, so the projection is the committed one and `null`
// means exactly "nothing is open".

import { useMultiHumanCapable, useSuspenseQueries, useTRPC } from "#data";
import type { CommittedChatContext } from "#lib";
import { useActiveChatId } from "#state";

/** The open room, as the CONTEXT pane boundary's reset keys. */
export function useChatContextResetKeys(): readonly unknown[] {
  return [useActiveChatId()];
}

export function useChatContextState(): CommittedChatContext | null {
  const chatId = useActiveChatId();
  // #476's ONE read of this capability, hint-backed: a device that has been told answers in its FIRST
  // frame instead of rendering the single-human arm for the whole flight of `/api/auth/config` (#1627 —
  // adopted here when the bell, this hook's predecessor as the hint's consumer, lost its gate). The server
  // always wins the instant the read lands, and a device that has never been told falls back to FALSE,
  // which is exactly the raw read this replaces. A RENDER hint only: `chat.participants`, the invite verbs
  // and the membership verbs all still answer to the server's own multi-human belt.
  const multiHumanCapable = useMultiHumanCapable();
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
    chatId,
    participants: chat.participants,
    identities: chat.identities,
    viewerUserId: chat.viewerUserId,
    pendingHostUserId: chat.pendingHostUserId,
    roomOverrides: chat.roomOverrides,
    isHost: chat.viewerIsHost,
    multiHumanCapable,
    background: chat.background,
  };
}
