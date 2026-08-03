// chat/ front door (UI-Arch §2.1) — the ONLY entry into the chat slice (dep-cruiser
// client-feature-front-door). The message-list keystone: the containment anchor + the surface it
// wraps, PLUS the composer + the composed chat-room surface (task #18) that combines them into one
// pane. The composition root mounts `<ChatRoomSurface initialHandle busDeps/>` (or the anchor+surface
// pair directly if it needs the transcript alone); the reducer deps (`busDeps`) are assembled at that
// root (a feature may not import the write store).

export type { ChatListAnchorProps } from "./anchors/chat-list-anchor.tsx";
export { ChatListAnchor } from "./anchors/chat-list-anchor.tsx";
export type { JoinInviteDialogProps } from "./anchors/join-invite-dialog.tsx";
export { JoinInviteDialog } from "./anchors/join-invite-dialog.tsx";
export type { MessageThreadAnchorProps } from "./anchors/message-thread-anchor.tsx";
export { MessageThreadAnchor } from "./anchors/message-thread-anchor.tsx";
export { ChatsWithCharacterPane } from "./components/chats-with-character-pane.tsx";
export type { ComposerProps } from "./components/composer.tsx";
export { Composer } from "./components/composer.tsx";
export type {
  DraftSeed,
  UseSendMessageOptions,
  UseSendMessageResult,
} from "./hooks/use-send-message.ts";
export { useSendMessage } from "./hooks/use-send-message.ts";
export type { UseStopTurnResult } from "./hooks/use-stop-turn.ts";
export { useStopTurn } from "./hooks/use-stop-turn.ts";
export { appearanceAvatarsSection } from "./lib/appearance-avatars-section.tsx";
export { appearanceMessageDetailsSection } from "./lib/appearance-message-details-section.tsx";
export { appearanceMessageStyleSection } from "./lib/appearance-message-style-section.tsx";
export { chatMessageHandlingSection } from "./lib/chat-behavior-message-handling-section.tsx";
export { chatStreamingSection } from "./lib/chat-behavior-streaming-section.tsx";
export { chatOptionsChrome } from "./lib/chat-options-chrome.tsx";
export { chatSlashCommands } from "./lib/chat-slash-commands.ts";
export { deriveChatTitle } from "./lib/chat-summary-row.ts";
export { makeChatsSection } from "./lib/chats-section.tsx";
export { commandModal } from "./lib/command-modal.tsx";
export { isContinueEligible } from "./lib/continue-on-empty.ts";
export { databankSettingsSection } from "./lib/databank-settings-section.tsx";
export { chatQuickPicksTile } from "./lib/home-quick-picks-tile.tsx";
export { chatRecentsTile } from "./lib/home-recents-tile.tsx";
export { chatTempChatTile } from "./lib/home-temp-chat-tile.tsx";
export { imageryTemplatesSection } from "./lib/imagery-templates-section.tsx";
export { clearJoinParam, readJoinToken } from "./lib/join-token.ts";
export { memorySettingsSection } from "./lib/memory-settings-section.tsx";
export { newChatModal } from "./lib/new-chat-modal.tsx";
export { proseSettingsSection } from "./lib/prose-settings-section.tsx";
export type { ChatLandingSurfaceProps } from "./surfaces/chat-landing-surface.tsx";
export { ChatLandingSurface } from "./surfaces/chat-landing-surface.tsx";
export type { ChatListSurfaceProps } from "./surfaces/chat-list-surface.tsx";
export { ChatListSurface } from "./surfaces/chat-list-surface.tsx";
export type { ChatRoomSurfaceProps } from "./surfaces/chat-room-surface.tsx";
export { ChatRoomSurface } from "./surfaces/chat-room-surface.tsx";
export type {
  CommandPaletteSurfaceProps,
  GoToSection,
} from "./surfaces/command-palette-surface.tsx";
export { CommandPaletteSurface } from "./surfaces/command-palette-surface.tsx";
export type { MessageListSurfaceProps } from "./surfaces/message-list-surface.tsx";
export { MessageListSurface } from "./surfaces/message-list-surface.tsx";
export { NewChatPicker } from "./surfaces/new-chat-picker-surface.tsx";
