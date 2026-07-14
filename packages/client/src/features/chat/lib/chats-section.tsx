// The Chats rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. A pure DATA object: every render slot is a hook-free arrow composing this feature's surfaces +
// components, so the definition itself imports NO app-shell/auth hook — `ChatListSurface`/`ChatContent`
// read their own #state selection, and `multiHumanCapable` (the `ContextTabDef.when`/`body` inputs) is
// the CONSUMER's job to resolve into `ChatContextState` at cutover (today `useAuthConfig` from `#data`,
// not `#features/auth` — no cross-feature reach). The composition root assembles this into the section
// registry at the M1 cutover; until then the `/` route consumes `list` + `content` directly and the
// shell's bespoke Tabs (`ChatContextPanel`) still serves the CONTEXT for a committed chat (this `context`
// field is the fourth legacy-Tabs unification named in registry-contracts.ts — populated for the cutover
// but not yet on the render path).

import type { ParticipantView, RoomOverrides } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve the MessagesSquare glyph fine (the character-card-facets.ts precedent).
import { MessagesSquare } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary } from "#data";
import type { SectionDefinition } from "#state";
import { chatDeletedFromList, openModal, selectChatFromList } from "#state";
import { ChatListAnchor } from "../anchors/chat-list-anchor";
import { AssemblyPreviewPanel } from "../components/assembly-preview-panel";
import { ChatContent } from "../components/chat-content";
import { CommittedGroupConfigTab } from "../components/group-config-form";
import { InjectionsManager } from "../components/injections-manager";
import { RoomOverridesTab } from "../components/room-overrides-tab";
import type { CommittedMembersTabProps } from "../surfaces/chat-context-panel-surface";
import { CommittedMembersTab } from "../surfaces/chat-context-panel-surface";
import { ChatListSurface } from "../surfaces/chat-list-surface";
import { castSectionVisible, membersTabJustified, resolveIsGroupChat } from "./roster";

/** The Chats CONTEXT-panel state projection (O5 strict — a real named type, never void/any): the
 *  committed chat's `ChatDetail` wire fields the tabs read + `multiHumanCapable` (the fourth trapped
 *  hook, resolved via `#data`'s `useAuthConfig` at cutover — never `#features/auth`'s). */
export interface ChatContextState {
  readonly chatId: ChatId;
  readonly participants: readonly ParticipantView[];
  readonly viewerUserId: UserId;
  readonly pendingHostUserId: UserId | null;
  readonly roomOverrides: RoomOverrides;
  readonly isHost: boolean;
  readonly multiHumanCapable: boolean;
}

function toMembersTabProps(s: ChatContextState): CommittedMembersTabProps {
  return {
    chatId: s.chatId,
    chat: {
      participants: s.participants,
      viewerUserId: s.viewerUserId,
      pendingHostUserId: s.pendingHostUserId,
    },
    isHost: s.isHost,
    multiHumanCapable: s.multiHumanCapable,
    castVisible: castSectionVisible(s.participants),
  };
}

function queryFallback(label: string): ReactElement {
  return <Text tone="muted">{`Loading ${label}…`}</Text>;
}

function queryRenderError(label: string): (error: unknown, retry: () => void) => ReactElement {
  return (_error, retry): ReactElement => (
    <Text tone="muted">
      {`Couldn't load ${label}.`}{" "}
      <Button intent="ghost" onClick={retry}>
        Retry
      </Button>
    </Text>
  );
}

export const chatsSection: SectionDefinition<ChatContextState> = {
  id: "chats",
  rail: { label: "Chats", icon: MessagesSquare, group: "primary", mobilePrimary: true },
  panelDefaults: { list: "docked", context: "collapsed" },
  placeholder: {
    title: "Chats",
    description: "Your conversations live here — pick a thread on the left, or start a new one.",
  },
  list: () => (
    <ChatListAnchor>
      <ChatListSurface
        onDeletedChat={chatDeletedFromList}
        onNewChat={(): void => openModal("newChat")}
        onSelect={selectChatFromList}
      />
    </ChatListAnchor>
  ),
  content: () => <ChatContent />,
  // Five tabs, the chat-context-panel-surface.tsx bespoke Tabs unified (§6c): Members (floor-gated),
  // Overrides (always), Group (host + group chat only), Preview (host only), Injections (always).
  context: {
    kind: "tabs",
    tabs: [
      {
        id: "members",
        label: "Members",
        when: (s) => membersTabJustified(s.participants, s.multiHumanCapable),
        body: (s) => <CommittedMembersTab {...toMembersTabProps(s)} />,
      },
      {
        id: "overrides",
        label: "Overrides",
        body: (s) => (
          <RoomOverridesTab chatId={s.chatId} roomOverrides={s.roomOverrides} isHost={s.isHost} />
        ),
      },
      {
        id: "group",
        label: "Group",
        when: (s) => s.isHost && resolveIsGroupChat(s.participants),
        body: (s) => (
          <QueryBoundary
            fallback={queryFallback("group settings")}
            renderError={queryRenderError("group settings")}
          >
            <CommittedGroupConfigTab chatId={s.chatId} />
          </QueryBoundary>
        ),
      },
      {
        id: "preview",
        label: "Preview",
        when: (s) => s.isHost,
        body: (s) => <AssemblyPreviewPanel chatId={s.chatId} />,
      },
      {
        id: "injections",
        label: "Injections",
        body: (s) => (
          <QueryBoundary
            fallback={queryFallback("injections")}
            renderError={queryRenderError("injections")}
          >
            <InjectionsManager chatId={s.chatId} isHost={s.isHost} />
          </QueryBoundary>
        ),
      },
    ],
  },
};
