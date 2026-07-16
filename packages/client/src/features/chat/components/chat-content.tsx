// The Chats CONTENT body — landing (nothing selected) vs a live room, keyed so the draft→committed
// promotion doesn't remount mid-first-turn (ChatRoomSurface's `sessionKey`, active-chat-store.ts). Reads
// its OWN #state (handle/draftSeed/sessionKey) + #data (busDeps) so the chats-section definition composing
// it stays a pure data object — the whole Chats CONTENT now flows from the registry, no route wrapper.

import type { ReactElement } from "react";
import { useChatBusDeps } from "#data";
import type { ChatSurfaceContribution, ContributorRegistry } from "#lib";
import {
  commitDraft,
  isLanding,
  openModal,
  selectChat,
  setActiveSection,
  startNewChat,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSessionKey,
  useListDocked,
} from "#state";
import { ChatLandingSurface } from "../surfaces/chat-landing-surface";
import { ChatRoomSurface } from "../surfaces/chat-room-surface";

export interface ChatContentProps {
  readonly surfaceContributors: ContributorRegistry<ChatSurfaceContribution>;
}

export function ChatContent({ surfaceContributors }: ChatContentProps): ReactElement {
  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const sessionKey = useActiveSessionKey();
  const busDeps = useChatBusDeps();
  // When the Chats LIST is docked it already is the recents finder, so the landing drops its own
  // "Recent chats" to avoid duplicating it.
  const listDocked = useListDocked("chats", "docked");

  if (isLanding(handle)) {
    return (
      <ChatLandingSurface
        onBrowseCharacters={(): void => setActiveSection("characters")}
        onNewChat={(): void => openModal("newChat")}
        onSelect={selectChat}
        onStartChat={(characterId): void => startNewChat({ characterIds: [characterId] })}
        showRecents={!listDocked}
      />
    );
  }

  return (
    <ChatRoomSurface
      busDeps={busDeps}
      draftSeed={draftSeed}
      initialHandle={handle}
      key={sessionKey}
      onChatForked={selectChat}
      onChatStarted={commitDraft}
      surfaceContributors={surfaceContributors}
    />
  );
}
