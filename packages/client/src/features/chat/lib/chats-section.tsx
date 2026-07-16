// The Chats rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — rail
// identity, panel defaults, placeholder copy, list, content, header, and CONTEXT model in one place.
// CONTEXT is minted via `defineContextTabs<ChatContextState>` (§6b) over the phase-discriminated
// projection, unifying the committed panel and its draft twin into one 5-tab set; `useChatContextState`
// pairs with the tabs so `S` never crosses the shell seam. `makeChatsSection` takes the chat-context
// contributor registry (§6c) so rpg/crew can graft tabs at the door without importing chat.

import { MessagesSquare } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import type { ChatContextState, ChatSurfaceContribution, CommittedChatContext, ContextTabDef, ContributorRegistry } from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { chatDeletedFromList, openModal, selectChatFromList } from "#state";
import { ChatListAnchor } from "../anchors/chat-list-anchor";
import { DraftAddMemberPopover } from "../components/add-member-popover";
import { AssemblyPreviewPanel } from "../components/assembly-preview-panel";
import { ChatContent } from "../components/chat-content";
import { ChatContextHeader } from "../components/chat-header";
import { ChatListHeader } from "../components/chat-list-header";
import { ChatsTopbarHeader } from "../components/chats-topbar-header";
import type { CommittedMembersTabProps } from "../components/committed-members-tab";
import { CommittedMembersTab } from "../components/committed-members-tab";
import { DraftGroupConfigTabBody, DraftInjectionsTab, DraftMembersTabBody, DraftOverridesTabBody } from "../components/draft-context-tabs";
import { CommittedGroupConfigTab } from "../components/group-config-form";
import { InjectionsManager } from "../components/injections-manager";
import { RoomOverridesTab } from "../components/room-overrides-tab";
import { useChatContextState } from "../hooks/use-chat-context-state";
import { ChatListSurface } from "../surfaces/chat-list-surface";
import { castSectionVisible, membersTabJustified, resolveIsGroupChat } from "./roster";

const GROUP_FLOOR = 2;

function toMembersTabProps(s: CommittedChatContext): CommittedMembersTabProps {
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

// Flat declared order encodes the Members-default (§6b): members first ⇒ the generic resolve picks it as
// the active tab whenever visible, else the first visible tab. Each body narrows on `s.phase`.
const CHAT_CONTEXT_TABS: readonly ContextTabDef<ChatContextState>[] = [
  {
    id: "members",
    label: "Members",
    when: (s) => (s.phase === "committed" ? membersTabJustified(s.participants, s.multiHumanCapable) : s.cast.length >= GROUP_FLOOR),
    body: (s) => (s.phase === "committed" ? <CommittedMembersTab {...toMembersTabProps(s)} /> : <DraftMembersTabBody draftKey={s.draftKey} cast={s.cast} />),
  },
  {
    id: "overrides",
    label: "Overrides",
    body: (s) =>
      s.phase === "committed" ? (
        <RoomOverridesTab chatId={s.chatId} roomOverrides={s.roomOverrides} isHost={s.isHost} />
      ) : (
        <DraftOverridesTabBody draftKey={s.draftKey} />
      ),
  },
  {
    id: "group",
    label: "Group",
    when: (s) => (s.phase === "committed" ? s.isHost && resolveIsGroupChat(s.participants) : s.cast.length >= GROUP_FLOOR),
    body: (s) =>
      s.phase === "committed" ? (
        <QueryBoundary
          fallback={queryFallback("group settings")}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="group settings" onRetry={retry} />}
        >
          <CommittedGroupConfigTab chatId={s.chatId} />
        </QueryBoundary>
      ) : (
        <DraftGroupConfigTabBody draftKey={s.draftKey} />
      ),
  },
  {
    id: "preview",
    label: "Preview",
    when: (s) => s.phase === "committed" && s.isHost,
    body: (s) => (s.phase === "committed" ? <AssemblyPreviewPanel chatId={s.chatId} /> : null),
  },
  {
    id: "injections",
    label: "Injections",
    body: (s) =>
      s.phase === "committed" ? (
        <QueryBoundary
          fallback={queryFallback("injections")}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="injections" onRetry={retry} />}
        >
          <InjectionsManager chatId={s.chatId} isHost={s.isHost} />
        </QueryBoundary>
      ) : (
        <DraftInjectionsTab draftKey={s.draftKey} />
      ),
  },
];

export function makeChatsSection(
  chatContextContributors: ContributorRegistry<ContextTabDef<ChatContextState>>,
  chatSurfaceContributors: ContributorRegistry<ChatSurfaceContribution>,
): SectionDefinition {
  return {
    id: "chats",
    rail: { label: "Chats", icon: MessagesSquare, group: "primary", mobile: "tab" },
    panelDefaults: { list: "docked", context: "collapsed" },
    placeholder: {
      title: "Chats",
      description: "Your conversations live here — pick a thread on the left, or start a new one.",
    },
    list: () => (
      <ChatListAnchor>
        <ChatListSurface onDeletedChat={chatDeletedFromList} onNewChat={(): void => openModal("newChat")} onSelect={selectChatFromList} />
      </ChatListAnchor>
    ),
    // The LIST chrome-band content (§4 N2): "CHATS" title + count + the ONE primary New action.
    listHeader: () => <ChatListHeader />,
    content: () => <ChatContent surfaceContributors={chatSurfaceContributors} />,
    // Topbar identity: committed roster header vs draft seed, resolved from #state/#data inside the body.
    header: () => <ChatsTopbarHeader />,
    context: defineContextTabs<ChatContextState>({
      useContextState: useChatContextState,
      tabs: CHAT_CONTEXT_TABS,
      // The CONTEXT-panel BAND identity (N4/P4) — the active chat's avatar + title, definition-owned.
      header: (s) => <ChatContextHeader state={s} />,
      actions: (s) => (s.phase === "draft" ? <DraftAddMemberPopover draftKey={s.draftKey} existingCharacterIds={s.cast} /> : null),
      contributors: chatContextContributors,
    }),
  };
}
