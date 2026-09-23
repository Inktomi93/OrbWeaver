// `ChatHandle` makes the wrong path not compile: a room is either OPEN on a real chat row or it is the
// landing state, threaded explicitly from the composition point, so forgetting the branch is a tsc error,
// not a runtime surprise. Never reintroduce an ambient "active chat" global.
//
// THE `draft` ARM IS GONE (D166). A chat row now exists from the
// creation CLICK — `chat.startChat` runs in the picker, and the room mounts committed from frame one — so a
// rowless "chat that exists only in the composer" is unrepresentable. What used to be a draft is a HUSK: a
// real row with `started_at IS NULL`, hidden from the chats list by a server lens and reaped if it is never
// claimed. Do not re-add a client-side phase here to model it: husk-ness is a SERVER fact, and the client's
// only interest in it is the best-effort nav-away reap (`active-chat-store.ts`).

import type { ChatId } from "@orb/kit/ids";

export type ChatHandle =
  | { readonly kind: "committed"; readonly id: ChatId }
  // The at-rest landing state: nothing selected, so Chats content renders the landing surface, never an
  // empty room. Carries no id, so it mounts no ChatRoomSurface.
  | { readonly kind: "landing" };

/** The handle a chat ROOM can be opened with — `landing` excluded. */
export type ActiveChatHandle = Exclude<ChatHandle, { readonly kind: "landing" }>;

// Constructors return their specific member (not the wide ChatHandle) so a caller composing an open room
// infers as ActiveChatHandle — a narrower return still assigns to ChatHandle at every call site.
export function committedChat(id: ChatId): Extract<ChatHandle, { kind: "committed" }> {
  return { kind: "committed", id };
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
