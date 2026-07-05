import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { ChatBusDeps } from "#data";
import { createInvalidation, useTRPC } from "#data";
import { AppShell } from "#features/app-shell";
import { CharacterLibraryAnchor, CharacterLibrarySurface } from "#features/character";
import { ChatContextPanel, ChatListAnchor, ChatListSurface, ChatRoomSurface } from "#features/chat";
import { AppearanceSettingsSurface } from "#features/settings";
import {
  chatStream,
  commitDraft,
  isCommitted,
  selectChat,
  startNewChat,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSessionKey,
} from "#state";

// The `/` home: the composition root + the app's central navigation seam. It mounts the four-region
// <AppShell> (UI-Arch §4.1) and is the ONE reactive READER of the active-chat store (state/active-chat-
// store.ts) — it reads which chat is active and renders the right CONTENT (a <ChatRoomSurface> for the
// active draft/committed chat), plus the Chats-LIST + Characters-LIST as section content. A ROUTE may
// import a feature front door (route→feature is legal); a feature may NOT import another feature — so
// app-shell stays domain-agnostic (regions + slots) and every domain touch lives HERE.
//
// THE ANTI-JANK SEAM (UI-Arch §5.1): every WRITER of the active chat (the character card's "start chat",
// the chat-list select, a message row's Fork) only CALLS a store action; this route is the single
// reader. No surface reads-and-effects off an ambient active chat, so the neo `this_chid` chase is
// impossible by construction. The character library reaches "start a chat with X" via the SAME shared
// stores (startNewChat + setActiveSection), never a character→chat import.
//
// THE KEY (state/active-chat-store.ts THE KEY DISCIPLINE): `sessionKey` is <ChatRoomSurface>'s React
// key — stable across a draft→committed promotion, so the surface does NOT remount mid-first-turn
// (which would tear down the live SSE subscription + the in-flight send). It changes only on new-chat /
// select-different-chat. `onChatStarted`→`commitDraft` records the committed id WITHOUT changing the key;
// `onChatForked`→`selectChat` is the unified fork-nav landing (both seams terminate at the store).
//
// `stream` is the chat-stream singleton; `invalidate` is the central seam rebuilt per render from the
// provided tRPC proxy + QueryClient (stateless + fire-and-forget — identity churn is harmless, the
// subscription keys off ids, not deps identity).
export function HomePage(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidation = createInvalidation({ queryClient, trpc });
  const busDeps: ChatBusDeps = { stream: chatStream, invalidate: invalidation.invalidate };

  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const sessionKey = useActiveSessionKey();
  const activeChatId = isCommitted(handle) ? handle.id : null;

  return (
    <AppShell
      sections={{
        chats: {
          list: (
            <ChatListAnchor>
              <ChatListSurface
                activeChatId={activeChatId}
                onNewChat={(): void => startNewChat()}
                onSelect={selectChat}
              />
            </ChatListAnchor>
          ),
          content: (
            <ChatRoomSurface
              key={sessionKey}
              busDeps={busDeps}
              draftSeed={draftSeed}
              initialHandle={handle}
              onChatForked={selectChat}
              onChatStarted={commitDraft}
            />
          ),
        },
        characters: {
          content: (
            <CharacterLibraryAnchor>
              <CharacterLibrarySurface />
            </CharacterLibraryAnchor>
          ),
        },
      }}
      modals={{ settings: <AppearanceSettingsSurface /> }}
      // The CONTEXT (right) region — the chat detail panel (overrides · preview · injections, task #28).
      // Mounted ONLY for a COMMITTED chat (a draft has no server row for the reads/writes to target);
      // a draft or non-chat section falls back to the shell's honest placeholder.
      contextPanel={activeChatId === null ? undefined : <ChatContextPanel chatId={activeChatId} />}
    />
  );
}
