// The readout's CHAT BINDING state (preset-surface-redesign §7.1 / D8, owner ruling 2026-08-02).
//
// WHY A BINDING EXISTS AT ALL: the preset editor is chat-independent, so identity macros have no referent
// here and the honest editor-side answer is the TOKEN view. But identity-macro resolution is CHAT-OWNED
// (Ruling B — domains thread values, never re-derive), and mid-play there IS a live chat. Binding to it makes
// the readout REAL without violating that ruling: the CHAT resolves, the editor merely DISPLAYS.
//
// AUTO-BIND, not opt-in (the ruling): the target is the LAST-OPEN CHAT — `useActiveChatId`, the handle that
// survives section switches (only a page RELOAD drops it, which lands in the unbound arm honestly). Nothing
// is clicked to get here; the ✕ is how you leave.
//
// READ-ONLY (§7's standing invariant): the dismissal is readout-local VIEW state — it writes no store, no
// server, and no chat. It is keyed BY CHAT so opening a DIFFERENT chat re-binds on its own (a data change,
// not a second control), which is exactly the ruling's "opening a chat and returning re-derives the bind
// target". It lives in a hook rather than a store because it is one panel's view state with one reader.

import type { ChatId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "#data";
import { useActiveChatId } from "#state";

/** The binding as the readout reads it: what it COULD bind to, what it IS bound to, and the one control's
 *  two verbs. `boundChatId` is the only field a panel needs to pick between its real and honest arms. */
export interface ReadoutBinding {
  /** The auto-bind target — the last-open chat, or `null` when there is no recent chat at all. */
  readonly targetChatId: ChatId | null;
  /** The chat the readout is CURRENTLY resolving against — `null` when dismissed, or with no target. */
  readonly boundChatId: ChatId | null;
  /** The bind target's name. Falls back to a neutral noun rather than a blank: a chat the list does not carry
   *  (a temporary chat is hidden from `listChats` by design) is still a real, honest binding. */
  readonly chatTitle: string;
  readonly dismiss: () => void;
  readonly rebind: () => void;
}

/** The name a title-less room reads as — the binding is real even when the list cannot name it. */
const UNTITLED_CHAT = "the open chat";

export function useReadoutBinding(): ReadoutBinding {
  const trpc = useTRPC();
  const targetChatId = useActiveChatId();
  // WHICH chat the user dismissed, not a boolean: a dismissal must not silence the NEXT chat they open.
  const [dismissedChatId, setDismissedChatId] = useState<ChatId | null>(null);
  // The list is the cheap name source — every chat surface already holds this exact query, so naming the
  // binding costs no round trip (and its `chatsChanged` freshness row is already in the map).
  const chats = useQuery(trpc.chat.listChats.queryOptions({}));
  const title = chats.data?.find((chat) => chat.id === targetChatId)?.title;
  return {
    targetChatId,
    boundChatId: targetChatId !== null && targetChatId !== dismissedChatId ? targetChatId : null,
    chatTitle: title === null || title === undefined || title.trim() === "" ? UNTITLED_CHAT : title,
    dismiss: (): void => setDismissedChatId(targetChatId),
    rebind: (): void => setDismissedChatId(null),
  };
}
