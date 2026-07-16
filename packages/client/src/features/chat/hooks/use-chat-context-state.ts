// The Chats CONTEXT-panel projection hook (client-architecture-lockdown.md §6b) — resolves the active
// chat handle into the phase-discriminated `ChatContextState` the section's tabs consume. All reads are
// unconditional (rules-of-hooks); the committed `getChat` uses the `useSuspenseQueries` dynamic-array
// idiom so it suspends ONLY when committed — a null-on-pending would flash the placeholder (a lying state).

import { useSuspenseQueries } from "@tanstack/react-query";
import { useAuthConfig, useTRPC } from "#data";
import type { ChatContextState } from "#lib";
import { isCommitted, useActiveChatHandle, useActiveDraftSeed, useDraftConfig } from "#state";

export function useChatContextState(): ChatContextState | null {
  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const { data: authConfig } = useAuthConfig();
  const multiHumanCapable = authConfig?.multiHumanCapable === true;
  const trpc = useTRPC();
  const chatId = isCommitted(handle) ? handle.id : null;
  const draftKey = handle.kind === "draft" ? handle.draftKey : "";
  const draftConfig = useDraftConfig(draftKey);
  const chatQueries = useSuspenseQueries({
    queries: (chatId === null ? [] : [chatId]).map((id) => trpc.chat.getChat.queryOptions({ chatId: id })),
  });

  const chatQuery = chatQueries[0];
  if (chatId !== null && chatQuery !== undefined) {
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
    };
  }
  if (handle.kind === "draft") {
    const cast = [...new Set([...(draftSeed?.characterIds ?? []), ...(draftConfig.addedCharacterIds ?? [])])];
    return { phase: "draft", draftKey: handle.draftKey, cast };
  }
  return null;
}
