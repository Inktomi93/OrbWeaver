// `ChatHandle` makes the wrong path not compile: draft and committed chats are different variants,
// threaded explicitly from the composition point, so forgetting the branch is a tsc error, not a
// runtime surprise. Never reintroduce an ambient "active chat" global.

import type { ChatId } from "@orb/kit/ids";

export type ChatHandle =
  | { readonly kind: "committed"; readonly id: ChatId }
  | {
      readonly kind: "draft";
      /** Client-minted (seeded-id) key for a chat that exists only in the composer — no server row. */
      readonly draftKey: string;
    }
  // The at-rest landing state: nothing selected, so Chats content renders the landing surface, never an
  // empty room. Carries no id/key, so it mounts no ChatRoomSurface.
  | { readonly kind: "landing" };

/** The two handles a chat ROOM can be opened with — `landing` excluded. */
export type ActiveChatHandle = Exclude<ChatHandle, { readonly kind: "landing" }>;

// Constructors return their specific member (not the wide ChatHandle) so a committed|draft composition
// infers as ActiveChatHandle — a narrower return still assigns to ChatHandle at every call site.
export function committedChat(id: ChatId): Extract<ChatHandle, { kind: "committed" }> {
  return { kind: "committed", id };
}

export function draftChat(draftKey: string): Extract<ChatHandle, { kind: "draft" }> {
  return { kind: "draft", draftKey };
}

/** The at-rest landing handle — the app's initial state + the "close chat" / brand-home landing. */
export function landingChat(): Extract<ChatHandle, { kind: "landing" }> {
  return { kind: "landing" };
}

export function isCommitted(h: ChatHandle): h is Extract<ChatHandle, { kind: "committed" }> {
  return h.kind === "committed";
}

export function isLanding(h: ChatHandle): h is Extract<ChatHandle, { kind: "landing" }> {
  return h.kind === "landing";
}
