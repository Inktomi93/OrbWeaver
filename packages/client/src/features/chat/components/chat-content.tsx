// The Chats CONTENT body — landing (nothing selected) vs a live room, keyed by the room's own ChatId so a
// switch between rooms remounts a clean slot. Reads its OWN #state (the handle) + #data (busDeps) so the
// chats-section definition composing it stays a pure data object — the whole Chats CONTENT flows from the
// registry, no route wrapper.
//
// It used to carry a separate `sessionKey` because a draft→committed promotion had to NOT remount mid-first-
// turn. A chat row exists from the creation click now (chat-creation-draft-mode-replacement.md §4.1), so
// there is no promotion left to survive and the key is simply the id.

import type { ChatWarningCode, TurnAbortReason } from "@orb/contracts/chat";
import type { ReactElement } from "react";
import type { ChatBusDeps } from "#data";
import { useChatBusDeps } from "#data";
import type { ChatSurfaceContribution, ContributorRegistry, NotifyAction, ToolRenderer } from "#lib";
import { notify } from "#lib";
import { isLanding, openModal, openSettingsTo, selectChat, useActiveChatHandle } from "#state";
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

// The one warning that has somewhere to send you: custom parameters are a CONNECTION property, so the
// notice offers the jump to the pane that owns them. Attached here rather than in the mapper because
// `warningNotice` is pure copy and navigation is a feature capability (see that file's header).
const OPEN_CONNECTIONS: NotifyAction = {
  label: "Open Connections",
  onClick: (): void => {
    openSettingsTo("connections");
  },
};

// The honest-degrade seam: a domain `warning` bus event (non-vision image strip, tools/structured-output/
// memory/compaction degrades) surfaces through the injected `onWarning` callback — `data/` may not import
// `features/`, so the code→copy mapper is wired HERE, in the feature. It's a WARN notice, not an error and
// not plain info: the turn/image still produced a result, but the thing the user asked for did not happen,
// and as `info` it arrived with no identity at all (side-eye P2-1). Module-stable so `busDeps` stays
// referentially calm. Every warning surfaces (the mapper is total — no silenced code).
function surfaceWarning(code: ChatWarningCode): void {
  const notice = warningNotice(code);
  notify.warn(code === "custom_parameters_ignored" ? { ...notice, action: OPEN_CONNECTIONS } : notice);
}

export function ChatContent({ surfaceContributors, toolRenderers }: ChatContentProps): ReactElement {
  const handle = useActiveChatHandle();
  const baseBusDeps = useChatBusDeps();
  const busDeps: ChatBusDeps = { ...baseBusDeps, onTurnAbort: surfaceTurnAbort, onWarning: surfaceWarning };

  if (isLanding(handle)) {
    return <ChatLandingSurface onNewChat={(): void => openModal("newChat")} />;
  }

  return (
    <ChatRoomSurface
      busDeps={busDeps}
      handle={handle}
      key={handle.id}
      onChatForked={selectChat}
      surfaceContributors={surfaceContributors}
      toolRenderers={toolRenderers}
    />
  );
}
