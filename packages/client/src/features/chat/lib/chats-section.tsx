// The Chats rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — rail
// identity, panel defaults, placeholder copy, list, content, header, and CONTEXT model in one place.
// CONTEXT is minted via `defineContextTabs<ChatContextState>` (§6b) over the phase-discriminated
// projection, unifying the committed panel and its draft twin into one tab set; `useChatContextState`
// pairs with the tabs so `S` never crosses the shell seam. `makeChatsSection` takes the chat-context
// contributor registry (§6c) so rpg/crew can graft tabs at the door without importing chat.

import { Eye, MessagesSquare, SlidersHorizontal, Users } from "@orb/ui/icons";
import type { ChatContextState, ChatContextTabId, ChatSurfaceContribution, CommittedChatContext, ContextTabDef, ContributorRegistry, ToolRenderer } from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { chatDeletedFromList, openModal, selectChatFromList } from "#state";
import { ChatListAnchor } from "../anchors/chat-list-anchor";
import { DraftAddMemberPopover } from "../components/add-member-popover";
import { AssemblyPreviewPanel } from "../components/assembly-preview-panel";
import { ChatContent } from "../components/chat-content";
import { ChatListHeader } from "../components/chat-list-header";
import { ChatsTopbarHeader } from "../components/chats-topbar-header";
import type { CommittedMembersTabProps } from "../components/committed-members-tab";
import { CommittedMembersTab } from "../components/committed-members-tab";
import { DraftMembersTabBody } from "../components/draft-context-tabs";
import { CommittedSettingsTab, DraftSettingsTab } from "../components/settings-context-tab";
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

// Flat declared order encodes the Members-default (§6b): members first ⇒ the generic resolve picks it as
// the active tab whenever visible, else the first visible tab. Each body narrows on `s.phase`.
const CHAT_CONTEXT_TABS: readonly (ContextTabDef<ChatContextState> & { readonly id: ChatContextTabId })[] = [
  {
    id: "members",
    label: "Members",
    icon: Users,
    when: (s) => (s.phase === "committed" ? membersTabJustified(s.participants, s.multiHumanCapable) : s.cast.length >= GROUP_FLOOR),
    body: (s) => (s.phase === "committed" ? <CommittedMembersTab {...toMembersTabProps(s)} /> : <DraftMembersTabBody draftKey={s.draftKey} cast={s.cast} />),
  },
  // Overrides + Injections + Group + Background + Tool-use consolidated into ONE "This chat" tab
  // (panel-redesign; the former "Appearance overrides" tab and the separate "Injections" meta-tab merged).
  // Always visible (Field overrides + Injections show for everyone); the former Group tab's host+group-chat
  // gate + the Tool-use host gate + the Background host gate live at SECTION granularity inside the body —
  // the §8.1 permission-omit, now per-section so the strip drops slots without dropping controls.
  {
    id: "settings",
    label: "This chat",
    icon: SlidersHorizontal,
    body: (s) =>
      s.phase === "committed" ? (
        <CommittedSettingsTab
          chatId={s.chatId}
          roomOverrides={s.roomOverrides}
          isHost={s.isHost}
          background={s.background}
          showGroup={s.isHost && resolveIsGroupChat(s.participants)}
        />
      ) : (
        <DraftSettingsTab draftKey={s.draftKey} showGroup={s.cast.length >= GROUP_FLOOR} />
      ),
  },
  {
    id: "preview",
    label: "Preview",
    icon: Eye,
    when: (s) => s.phase === "committed" && s.isHost,
    body: (s) => (s.phase === "committed" ? <AssemblyPreviewPanel chatId={s.chatId} /> : null),
  },
];

export function makeChatsSection(
  chatContextContributors: ContributorRegistry<ContextTabDef<ChatContextState>>,
  chatSurfaceContributors: ContributorRegistry<ChatSurfaceContribution>,
  toolRenderers: ContributorRegistry<ToolRenderer>,
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
    content: () => <ChatContent surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />,
    // Topbar identity: committed roster header vs draft seed, resolved from #state/#data inside the body.
    header: () => <ChatsTopbarHeader />,
    context: defineContextTabs<ChatContextState>({
      useContextState: useChatContextState,
      tabs: CHAT_CONTEXT_TABS,
      // No panel-header identity slot (Context-Panel-Program §1 Q3 / §0 IA de-dup): the topbar owns the
      // chat's avatar + title, so the CONTEXT band no longer re-renders the same cluster 300px away — the
      // band reduces to neutral chrome above the tab strip. (`ChatContextHeader` was DELETED for knip;
      // CP-4's scene banner will be a NEW component grafted into this `header` slot, not a resurrection.)
      actions: (s) => (s.phase === "draft" ? <DraftAddMemberPopover draftKey={s.draftKey} existingCharacterIds={s.cast} /> : null),
      contributors: chatContextContributors,
    }),
  };
}
