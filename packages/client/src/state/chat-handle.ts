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
    };

export function committedChat(id: ChatId): ChatHandle {
  return { kind: "committed", id };
}

export function draftChat(draftKey: string): ChatHandle {
  return { kind: "draft", draftKey };
}

export function isCommitted(h: ChatHandle): h is Extract<ChatHandle, { kind: "committed" }> {
  return h.kind === "committed";
}
