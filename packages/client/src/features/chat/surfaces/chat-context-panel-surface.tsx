// The chat CONTEXT panel (task #28) — the shell's right-region body for the active committed chat:
// ONE section, Base UI Tabs (Overrides · Preview · Injections). Composed of three sub-features over
// EXISTING server verbs (all newly wired thin on the router): room-overrides (setRoomOverrides +
// ChatDetail.roomOverrides), preview-request (previewAssembly), manual injections (list/set/delete
// ChatInjection). UI-Arch §4.1 — the CONTEXT region is the shell's designed detail home.
//
// SELF-CONTAINED BY DESIGN: this surface does NOT assume it is the sole CONTEXT occupant. The route
// mounts it via `AppShellProps.contextPanel` today; when task #32 lands the `CHAT_CONTEXT_SLOTS`
// registry (the cross-feature graft point rpg/crew will use — rpg-design/11 §1, chat-crew-design/07),
// this becomes chat's own registered slot entry with NO rework — it already renders as one bounded
// section, not a full-panel takeover.
//
// HOST GATE (UI-Arch §5.1 viewer proxy — no client auth/session yet, task #50): "am I host" resolves
// from `ChatDetail.participants` via `resolveViewerIsHost` (the first present human seat — the owner,
// who is host, in today's single-human rooms). Host → full editing across all tabs + the Preview tab;
// member → read-only Overrides + Injections, and Preview is HIDDEN (previewAssembly is host-only
// server-side; a member-scoped previewSection affordance is deferred — task #28 flag).
//
// ROSTER GATE (D16 — roster-of-1 is degenerate, not an `isGroup` branch): the Roster tab is HOST-AND-
// GROUP gated (`resolveIsGroupChat`, ../lib/roster.ts) — mute/talkativeness/force-turn are meaningless
// with one character, so a solo (1-character) chat shows no Roster tab even to its host. Mirrors
// `ChatCastBar`'s identical `cast.length <= 1 → null` size-gate for the member-visible glance strip.

import type { ChatId } from "@orb/kit/ids";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, useTRPC } from "#data";
import { AssemblyPreviewPanel } from "../components/assembly-preview-panel";
import { InjectionsManager } from "../components/injections-manager";
import { RoomOverridesForm } from "../components/room-overrides-form";
import { RosterPanel } from "../components/roster-panel";
import { resolveIsGroupChat, resolveViewerIsHost } from "../lib/roster";

export interface ChatContextPanelProps {
  /** A COMMITTED chat id — the route passes this only when a committed chat is active (a draft has no
   *  server row for the reads/writes to target). */
  readonly chatId: ChatId;
}

/** The CONTEXT panel front door — suspends on the chat read (roster + overrides), then the tabs. */
export function ChatContextPanel({ chatId }: ChatContextPanelProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading chat details…</Text>}
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          Couldn't load chat details.{" "}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </Text>
      )}
    >
      <ChatContextPanelBody chatId={chatId} />
    </QueryBoundary>
  );
}

function ChatContextPanelBody({ chatId }: ChatContextPanelProps): ReactElement {
  const trpc = useTRPC();
  // The chat read carries BOTH the roster (host detection) and the current room overrides — one query,
  // already the shell's chat read (no new fetch for the overrides tab).
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const isHost = resolveViewerIsHost(chat.participants);
  // D16 roster-of-1 is degenerate, not a group — mute/talkativeness/force-turn are meaningless for one
  // character, so a solo chat must not show the Roster tab even to its host (mirrors ChatCastBar's
  // identical `cast.length <= 1 → null` gate for the member-visible glance strip).
  const showRoster = isHost && resolveIsGroupChat(chat.participants);

  return (
    <Tabs defaultValue="overrides">
      <TabsList>
        <TabsTab value="overrides">Overrides</TabsTab>
        {/* Roster (group controls, task #29) — host-AND-group-only, mirroring the Preview gate: mute /
            talkativeness / force-turn are host authority (substrate/auth/matrix.ts) AND meaningless for
            a solo (1-character) chat, so neither a member nor a solo-chat host sees the tab. The cast
            bar (chat-room-surface) is the member-visible glance surface, size-gated the same way. */}
        {showRoster ? <TabsTab value="roster">Roster</TabsTab> : null}
        {isHost ? <TabsTab value="preview">Preview</TabsTab> : null}
        <TabsTab value="injections">Injections</TabsTab>
        <TabsIndicator />
      </TabsList>

      <TabsPanel value="overrides">
        <RoomOverridesForm chatId={chatId} roomOverrides={chat.roomOverrides} isHost={isHost} />
      </TabsPanel>

      {showRoster ? (
        <TabsPanel value="roster">
          <RosterPanel chatId={chatId} />
        </TabsPanel>
      ) : null}

      {isHost ? (
        <TabsPanel value="preview">
          <AssemblyPreviewPanel chatId={chatId} />
        </TabsPanel>
      ) : null}

      <TabsPanel value="injections">
        <QueryBoundary
          fallback={<Text tone="muted">Loading injections…</Text>}
          renderError={(_error, retry): ReactElement => (
            <Text tone="muted">
              Couldn't load injections.{" "}
              <button type="button" onClick={retry}>
                Retry
              </button>
            </Text>
          )}
        >
          <InjectionsManager chatId={chatId} isHost={isHost} />
        </QueryBoundary>
      </TabsPanel>
    </Tabs>
  );
}
