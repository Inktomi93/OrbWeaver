// The Chats topbar identity header — a committed chat's roster header, or a draft's seeded-character
// header, resolved from the section's OWN #state (handle/draftSeed). A section-owned body so
// `chatsSection.header` rides the registry, not route composition.

import type { ReactElement } from "react";
import { isCommitted, useActiveChatHandle, useActiveDraftSeed } from "#state";
import { ChatHeaderSurface, DraftChatHeader } from "./chat-header";

export function ChatsTopbarHeader(): ReactElement | null {
  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const activeChatId = isCommitted(handle) ? handle.id : null;
  const draftCharacterIds = handle.kind === "draft" ? (draftSeed?.characterIds ?? []) : [];
  if (activeChatId !== null) {
    return <ChatHeaderSurface chatId={activeChatId} />;
  }
  if (draftCharacterIds.length > 0) {
    return <DraftChatHeader characterIds={draftCharacterIds} />;
  }
  return null;
}
