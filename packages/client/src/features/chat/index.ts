// chat/ front door (UI-Arch §2.1) — the ONLY entry into the chat slice (dep-cruiser
// client-feature-front-door). The message-list keystone: the containment anchor + the surface it
// wraps. The composition root mounts `<MessageThreadAnchor><MessageListSurface handle busDeps/></…>`;
// the reducer deps (`busDeps`) are assembled at that root (a feature may not import the write store).

export type { MessageThreadAnchorProps } from "./anchors/message-thread-anchor";
export { MessageThreadAnchor } from "./anchors/message-thread-anchor";
export type { MessageListSurfaceProps } from "./surfaces/message-list-surface";
export { MessageListSurface } from "./surfaces/message-list-surface";
