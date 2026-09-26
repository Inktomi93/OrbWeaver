// The Chats CONTENT body — landing (nothing selected) vs a live room, keyed by the room's own ChatId so a
// switch between rooms remounts a clean slot. Reads its OWN #state (the handle) + #data (busDeps) so the
// chats-section definition composing it stays a pure data object — the whole Chats CONTENT flows from the
// registry, no route wrapper.
//
// It used to carry a separate `sessionKey` because a draft→committed promotion had to NOT remount mid-first-
// turn. A chat row exists from the creation click now (D166), so
// there is no promotion left to survive and the key is simply the id.

import type { TurnAbortReason } from "@orb/contracts/chat";
import type { ReactElement } from "react";
import { useState } from "react";
import type { ChatBusDeps } from "#data";
import { useChatBusDeps } from "#data";
import type { ChatSurfaceContribution, ContributorRegistry, NotifyAction, NotifyNotice, ToolRenderer } from "#lib";
import { notify, turnAbortNotice } from "#lib";
import { chatDeletedFromList, isLanding, openConfigTo, openNewChatPicker, selectChat, useActiveChatHandle } from "#state";
import { createWarningSurface } from "../lib/turn-warning-surface.ts";
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
    openConfigTo("connections");
  },
};

// The honest-degrade seam: a domain `warning` bus event surfaces through the injected callbacks — `data/` may
// not import `features/`, so the cadence and the code→copy mapper are wired HERE, in the feature. It's a WARN
// notice: the turn still produced a result, but something the user asked for did not happen.
function warnNotice(notice: NotifyNotice): void {
  notify.warn(notice);
}

export function ChatContent({ surfaceContributors, toolRenderers }: ChatContentProps): ReactElement {
  const handle = useActiveChatHandle();
  const baseBusDeps = useChatBusDeps();
  // One cadence per mounted Chats body: it remembers the last turn's drops per connection across room switches.
  const [warningSurface] = useState(() => createWarningSurface({ warn: warnNotice, openConnections: OPEN_CONNECTIONS }));
  // `chatDeletedFromList` is a no-op unless the deleted chat IS the active one, so wiring it here is the
  // whole transition: a host delete elsewhere, a husk reap, or the TTL sweep firing against this very tab all
  // land the reader on the landing surface instead of a room whose row is gone (R3 — the verifier's R1-3).
  const busDeps: ChatBusDeps = { ...baseBusDeps, ...warningSurface, onTurnAbort: surfaceTurnAbort, onChatDeleted: chatDeletedFromList };

  if (isLanding(handle)) {
    return <ChatLandingSurface onNewChat={openNewChatPicker} />;
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
