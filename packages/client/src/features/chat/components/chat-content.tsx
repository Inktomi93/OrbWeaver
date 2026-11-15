// The Chats CONTENT body — landing (nothing selected) vs a live room, keyed by the room's own ChatId so a
// switch between rooms remounts a clean slot. Reads its OWN #state (the handle) + #data (busDeps) so the
// chats-section definition composing it stays a pure data object — the whole Chats CONTENT flows from the
// registry, no route wrapper.
//
// It used to carry a separate `sessionKey` because a draft→committed promotion had to NOT remount mid-first-
// turn. A chat row exists from the creation click now (D166), so
// there is no promotion left to survive and the key is simply the id.

import type { TurnAbortReason } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { ChatBusDeps } from "#data";
import { useChatBusDeps, useTRPC } from "#data";
import type { ChatContextTabId, ChatSurfaceContribution, ContributorRegistry, NotifyAction, NotifyNotice, ToolRenderer } from "#lib";
import { MODEL_ROLES_PATH, notify, RERANK_ROLE_DOOR, rethrowUnlessTrpcFailure, turnAbortNotice, UTILITY_ROLE_DOOR } from "#lib";
import { isLanding, openConfigTo, openNewChatPicker, revealContextPanel, useActiveChatHandle } from "#state";
import { leaveGoneRoom } from "../lib/gone-room-draft.ts";
import { REGEX_STOP_OPEN_ROOM_NAME } from "../lib/regex-stop-copy.ts";
import { OPEN_CONNECTIONS_NAME } from "../lib/send-failure-copy.ts";
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
  label: OPEN_CONNECTIONS_NAME,
  onClick: (): void => {
    openConfigTo("connections");
  },
};

// A Smart pick that fell back is fixed where its picker model is bound: the same doors the Group tab offers.
const OPEN_MODEL_ROLES = `Open ${MODEL_ROLES_PATH.leaf}`;
const OPEN_UTILITY_MODEL: NotifyAction = {
  label: OPEN_MODEL_ROLES,
  onClick: (): void => {
    openConfigTo(UTILITY_ROLE_DOOR.group, UTILITY_ROLE_DOOR.sub, UTILITY_ROLE_DOOR.setting);
  },
};
const OPEN_RERANK_MODEL: NotifyAction = {
  label: OPEN_MODEL_ROLES,
  onClick: (): void => {
    openConfigTo(RERANK_ROLE_DOOR.group, RERANK_ROLE_DOOR.sub, RERANK_ROLE_DOOR.setting);
  },
};

// A skipped regex script is listed with its reason in the room's This chat tab, under Regex.
const SETTINGS_TAB: ChatContextTabId = "settings";
const OPEN_THIS_CHAT: NotifyAction = {
  label: REGEX_STOP_OPEN_ROOM_NAME,
  onClick: (): void => {
    revealContextPanel(SETTINGS_TAB);
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
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // A skipped script's warning names it by id: the host's library names it, and a library read the server refused (a
  // tRPC failure) or an invalidation retired (TanStack's cancel) names nothing. Any other fault rejects.
  const scriptOf = (scriptId: RegexScriptId): Promise<RegexScriptRow | null> =>
    queryClient.query(trpc.regex.listScripts.queryOptions()).then(
      (rows) => rows.find((row) => row.id === scriptId) ?? null,
      (error: unknown) => {
        rethrowUnlessTrpcFailure(error);
        return null;
      },
    );
  // One cadence per mounted Chats body: it remembers the last turn's drops per connection across room switches.
  const [warningSurface] = useState(() =>
    createWarningSurface({
      warn: warnNotice,
      openConnections: OPEN_CONNECTIONS,
      openUtilityModel: OPEN_UTILITY_MODEL,
      openRerankModel: OPEN_RERANK_MODEL,
      openThisChat: OPEN_THIS_CHAT,
      scriptOf,
    }),
  );
  // `leaveGoneRoom` is a no-op unless the deleted chat IS the active one, so wiring it here is the
  // whole transition: a host delete elsewhere, a husk reap, or the TTL sweep firing against this very tab all
  // land the reader on the landing surface instead of a room whose row is gone (R3 — the verifier's R1-3).
  const busDeps: ChatBusDeps = { ...baseBusDeps, ...warningSurface, onTurnAbort: surfaceTurnAbort, onChatDeleted: leaveGoneRoom };

  if (isLanding(handle)) {
    return <ChatLandingSurface onNewChat={openNewChatPicker} />;
  }

  return <ChatRoomSurface busDeps={busDeps} handle={handle} key={handle.id} surfaceContributors={surfaceContributors} toolRenderers={toolRenderers} />;
}
