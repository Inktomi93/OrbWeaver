// chat/ front door (UI-Arch §2.1) — the ONLY entry into the chat slice (dep-cruiser
// client-feature-front-door). The message-list keystone: the containment anchor + the surface it
// wraps, PLUS the composer + the composed chat-room surface (task #18) that combines them into one
// pane. The composition root mounts `<ChatRoomSurface initialHandle busDeps/>` (or the anchor+surface
// pair directly if it needs the transcript alone); the reducer deps (`busDeps`) are assembled at that
// root (a feature may not import the write store).

export type { MessageThreadAnchorProps } from "./anchors/message-thread-anchor";
export { MessageThreadAnchor } from "./anchors/message-thread-anchor";
export type { ComposerProps } from "./components/composer";
export { Composer } from "./components/composer";
export type {
  DraftSeed,
  UseSendMessageOptions,
  UseSendMessageResult,
} from "./hooks/use-send-message";
export { useSendMessage } from "./hooks/use-send-message";
export type { UseStopTurnResult } from "./hooks/use-stop-turn";
export { useStopTurn } from "./hooks/use-stop-turn";
export { isContinueEligible } from "./lib/continue-on-empty";
export type { ChatRoomSurfaceProps } from "./surfaces/chat-room-surface";
export { ChatRoomSurface } from "./surfaces/chat-room-surface";
export type { MessageListSurfaceProps } from "./surfaces/message-list-surface";
export { MessageListSurface } from "./surfaces/message-list-surface";
