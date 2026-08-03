// The Chats CONTENT body — landing (nothing selected) vs a live room, keyed so the draft→committed
// promotion doesn't remount mid-first-turn (ChatRoomSurface's `sessionKey`, active-chat-store.ts). Reads
// its OWN #state (handle/draftSeed/sessionKey) + #data (busDeps) so the chats-section definition composing
// it stays a pure data object — the whole Chats CONTENT now flows from the registry, no route wrapper.

import type { ChatWarningCode, TurnAbortReason } from "@orb/contracts/chat";
import type { ReactElement } from "react";
import type { ChatBusDeps } from "#data";
import { useChatBusDeps } from "#data";
import type { ChatSurfaceContribution, ContributorRegistry, ToolRenderer } from "#lib";
import { notify } from "#lib";
import { commitDraft, isLanding, openModal, selectChat, useActiveChatHandle, useActiveDraftSeed, useActiveSessionKey } from "#state";
import { turnAbortNotice } from "../lib/turn-abort-notice.ts";
import { warningNotice } from "../lib/warning-notice.ts";
import { ChatLandingSurface } from "../surfaces/chat-landing-surface.tsx";
import { ChatRoomSurface } from "../surfaces/chat-room-surface.tsx";

export interface ChatContentProps {
  readonly surfaceContributors: ContributorRegistry<ChatSurfaceContribution>;
  readonly toolRenderers: ContributorRegistry<ToolRenderer>;
}

// The stale-abort honesty seam: the bus reducer surfaces a turn abort through the injected `onTurnAbort`
// callback (the `onWarning` precedent — `data/` may not import `features/`, so the reason→copy mapper is
// wired HERE). `stale` → the honest takeover notice; `user`/`error` → silence (the mapper decides — a real
// fault rides the tRPC error boundary). Module-stable so `busDeps` stays referentially calm.
function surfaceTurnAbort(reason: TurnAbortReason): void {
  const notice = turnAbortNotice(reason);
  if (notice !== null) {
    notify.error(notice);
  }
}

// The honest-degrade seam: a domain `warning` bus event (non-vision image strip, tools/structured-output/
// memory/compaction degrades) surfaces through the injected `onWarning` callback — `data/` may not import
// `features/`, so the code→copy mapper is wired HERE, in the feature. It's an INFO notice — the turn/image
// still produced a result, so this is non-blocking "here's what got dropped", never an error. Module-stable
// so `busDeps` stays referentially calm. Every warning surfaces (the mapper is total — no silenced code).
function surfaceWarning(code: ChatWarningCode): void {
  notify.info(warningNotice(code));
}

export function ChatContent({ surfaceContributors, toolRenderers }: ChatContentProps): ReactElement {
  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const sessionKey = useActiveSessionKey();
  const baseBusDeps = useChatBusDeps();
  const busDeps: ChatBusDeps = { ...baseBusDeps, onTurnAbort: surfaceTurnAbort, onWarning: surfaceWarning };

  if (isLanding(handle)) {
    return <ChatLandingSurface onNewChat={(): void => openModal("newChat")} />;
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
      toolRenderers={toolRenderers}
    />
  );
}
