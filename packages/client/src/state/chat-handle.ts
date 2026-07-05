// `ChatHandle` — the true `this_chid` successor (UI-Gates §11.3). neo killed the URL-coupled active
// id but reintroduced the same coupling as an ambient `isOptimistic` boolean branched in 15+ sites; the
// typed handle makes the wrong path NOT COMPILE: draft and committed chats are different variants,
// threaded explicitly from the composition point, and forgetting the branch is a `tsc` error, not a
// runtime surprise. NEVER reintroduce an ambient "active chat" global that surfaces chase (§5.1).

import type { ChatId } from "@orb/kit/ids";

export type ChatHandle =
  | { readonly kind: "committed"; readonly id: ChatId }
  | {
      readonly kind: "draft";
      /** Client-minted (seeded-id) key for a chat that exists only in the composer — no server row. */
      readonly draftKey: string;
    }
  // The at-rest LANDING state (D62 P4 / ux-flow-revamp J1): nothing selected, so the Chats CONTENT
  // renders the landing surface (welcome hero + recents + quick-picks), NEVER an empty room. It carries
  // no id/key — it mounts no `ChatRoomSurface`, so the composer/send path never sees it (enforced below
  // by `ActiveChatHandle`).
  | { readonly kind: "landing" };

/** The two handles a chat ROOM can be opened with — `landing` EXCLUDED. `ChatRoomSurface.initialHandle`
 *  narrows to this so a landing handle can never be threaded into the composer/send path (a `tsc` error,
 *  not a runtime surprise — the whole point of the discriminated handle, this file's header). */
export type ActiveChatHandle = Exclude<ChatHandle, { readonly kind: "landing" }>;

// The constructors return their SPECIFIC member (not the wide `ChatHandle`) so a `committed | draft`
// composition infers as `ActiveChatHandle` (the room's non-landing handle) — a narrower return assigns
// to `ChatHandle` at every existing call site, so this only tightens, never breaks.
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
