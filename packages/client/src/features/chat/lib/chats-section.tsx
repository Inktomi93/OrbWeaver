// The Chats rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — rail
// identity, panel defaults, placeholder copy, list, content, header, and CONTEXT model in one place.
// CONTEXT is minted via `defineContextTabs<ChatContextState>` (§6b) over the room projection;
// `useChatContextState` pairs with the tabs so `S` never crosses the shell seam. The tabs used to carry a
// DRAFT twin per body (a rowless room wrote a client draft-config store instead of the verbs) — gone with
// draft mode (chat-creation-draft-mode-replacement.md §4.1, R1): one body per tab, one set of verbs. `makeChatsSection` takes its four contributor
// seams as ONE named-field bundle (§12 row 5, gate `section-factory-contribution-bundle`) — context tabs
// (§6c) + REGION claims (HUD-1 §3.2) + surface anchors + tool renderers — so rpg/agents graft at the door
// without importing chat, and a fifth seam is a FIELD rather than an arity churn at every caller.

import { Eye, MessagesSquare, SlidersHorizontal, Users } from "@orb/ui/icons";
import type {
  ChatContextState,
  ChatContextTabId,
  ChatSurfaceContribution,
  CommittedChatContext,
  ContextRegionDef,
  ContextTabDef,
  ContributorRegistry,
  ToolRenderer,
} from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { chatDeletedFromList, chatSectionSelection, openModal, selectChatFromList } from "#state";
import { ChatListAnchor } from "../anchors/chat-list-anchor.tsx";
import { AssemblyPreviewPanel } from "../components/assembly-preview-panel.tsx";
import { ChatContent } from "../components/chat-content.tsx";
import { ChatListHeader } from "../components/chat-list-header.tsx";
import { ChatsTopbarHeader } from "../components/chats-topbar-header.tsx";
import type { CommittedMembersTabProps } from "../components/committed-members-tab.tsx";
import { CommittedMembersTab } from "../components/committed-members-tab.tsx";
import { CommittedSettingsTab } from "../components/settings-context-tab.tsx";
import { useChatContextState } from "../hooks/use-chat-context-state.ts";
import { ChatListSurface } from "../surfaces/chat-list-surface.tsx";
import { useChatsSelectionTitle } from "./chats-selection-title.ts";
import { castSectionVisible, membersTabJustified, resolveIsGroupChat } from "./roster.ts";

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
// the active tab whenever visible, else the first visible tab.
const CHAT_CONTEXT_TABS: readonly (ContextTabDef<ChatContextState> & { readonly id: ChatContextTabId })[] = [
  {
    id: "members",
    label: "Members",
    icon: Users,
    when: (s) => membersTabJustified(s.participants, s.multiHumanCapable, s.isHost),
    body: (s) => <CommittedMembersTab {...toMembersTabProps(s)} />,
  },
  // Overrides + Injections + Group + Background + Tool-use consolidated into ONE "This chat" tab
  // (the former "Appearance overrides" tab and the separate "Injections" meta-tab merged).
  // Always visible (Field overrides + Injections show for everyone); the former Group tab's host+group-chat
  // gate + the Tool-use host gate + the Background host gate live at SECTION granularity inside the body —
  // the permission-omit, now per-section so the strip drops slots without dropping controls.
  {
    id: "settings",
    label: "This chat",
    icon: SlidersHorizontal,
    body: (s) => (
      <CommittedSettingsTab
        chatId={s.chatId}
        roomOverrides={s.roomOverrides}
        isHost={s.isHost}
        background={s.background}
        showGroup={s.isHost && resolveIsGroupChat(s.participants)}
      />
    ),
  },
  {
    id: "preview",
    label: "Preview",
    icon: Eye,
    // HOST-ONLY (HUD-1 §4): `when` already omits it for a member; `crown` is how a CLAIMANT paints that
    // fact — the crown-gold glyph that reads "host-only" without spending a word on it.
    crown: true,
    when: (s) => s.isHost,
    body: (s) => <AssemblyPreviewPanel chatId={s.chatId} />,
  },
];

/** The chat section's contributor seams as ONE named-field bundle (client-architecture-lockdown.md §12
 *  row 5, gate `section-factory-contribution-bundle`): a fifth seam is a FIELD here, not another positional
 *  parameter churned through the door and both CT overrides. */
interface ChatsSectionContributors {
  /** §6c — the chat-context TAB contributors, merged after chat's own tabs at the `defineContextTabs` mint. */
  readonly contextTabs: ContributorRegistry<ContextTabDef<ChatContextState>>;
  /** HUD-1 §3.2 — the whole-pane REGION-CLAIM contributors; zero claimants ⇒ the generic panel. */
  readonly contextRegions: ContributorRegistry<ContextRegionDef<ChatContextState>>;
  /** §6c/M8 — the CONTENT-surface anchor contributors (thread-flank / above-composer / message-footer). */
  readonly surfaces: ContributorRegistry<ChatSurfaceContribution>;
  /** §6c — the per-tool-name renderers; zero ⇒ every tool record renders through the generic fallback. */
  readonly toolRenderers: ContributorRegistry<ToolRenderer>;
}

export function makeChatsSection({ contextTabs, contextRegions, surfaces, toolRenderers }: ChatsSectionContributors): SectionDefinition {
  return {
    id: "chats",
    rail: { label: "Chats", icon: MessagesSquare, group: "primary", mobile: "tab" },
    panelDefaults: { list: "docked", context: "collapsed" },
    placeholder: {
      title: "Chats",
      // Side-agnostic ("on the left" is wrong the moment the list pane is a slide-over or collapsed) —
      // this copy is also the home jump tile's gloss for the section, where there is no left at all.
      description: "Your conversations live here — pick a thread from your chats, or start a new one.",
    },
    list: () => (
      <ChatListAnchor>
        <ChatListSurface onDeletedChat={chatDeletedFromList} onNewChat={(): void => openModal("newChat")} onSelect={selectChatFromList} />
      </ChatListAnchor>
    ),
    // The LIST chrome-band content (§4 N2): "CHATS" title + count + the ONE primary New action.
    listHeader: () => <ChatListHeader />,
    // How the SHELL reads "is a room open?" — the mobile ONE-SHELL rule's input + its back affordance.
    selection: chatSectionSelection,
    // …and what it calls the open room in the pushed frame's topbar.
    useSelectionTitle: useChatsSelectionTitle,
    content: () => <ChatContent surfaceContributors={surfaces} toolRenderers={toolRenderers} />,
    // Topbar identity: the open room's roster header, resolved from #state/#data inside the body.
    header: () => <ChatsTopbarHeader />,
    context: defineContextTabs<ChatContextState>({
      useContextState: useChatContextState,
      tabs: CHAT_CONTEXT_TABS,
      // No panel-header identity slot (Context-Panel-Program §1 Q3 / §0 IA de-dup): the topbar owns the
      // chat's avatar + title, so the CONTEXT band no longer re-renders the same cluster 300px away — the
      // band reduces to neutral chrome above the tab strip. (`ChatContextHeader` was DELETED for knip;
      // CP-4's scene banner will be a NEW component grafted into this `header` slot, not a resurrection.)
      // No strip-trail actions today: the add-member door lives in the cast bar + the solo roster popover,
      // both of which the room already renders. (It used to hold the DRAFT add-member popover — a rowless
      // room's only way to grow its cast; the roster verb serves that now.)
      contributors: contextTabs,
      // The whole-pane REGION-CLAIM arm (HUD-1 §3.2): chat consumes it BLIND — a claiming contributor
      // (the rpg HUD on an engaged game chat) renders the entire CONTEXT pane from the tabs + selection
      // this same mint resolved. Zero claimants ⇒ the generic panel, unchanged.
      regions: contextRegions,
      // The no-selection ARM (side-eye F-12) — this pane shared one voiceless
      // "Select something to see its details here." with two other sections.
      empty: {
        title: "No chat open",
        description: "Open a thread and this pane carries its cast, its memory, and the knobs that apply to it.",
      },
    }),
  };
}
