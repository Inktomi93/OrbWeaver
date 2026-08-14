// The per-chat DOCUMENTS rack's three write verbs, each a module-scope `createEntityMutation` (§13.1 — the
// ONE mutation home). Two authorities meet here and are kept apart on purpose:
//   • `databank.attachToChat` / `detachFromChat` — HOST authority over the ROOM's prompt content
//     (`ensureChatHost` inside the verb). They move a `chat_documents` junction row.
//   • `chat.setChatDocumentVisibility` — the D85 host RETRIEVAL switch. It moves NO junction: hiding a
//     document leaves every attachment intact, which is exactly why the copy never says "remove".
// The OWNER-authority half (make a document feed every chat) is not here — it lives on the document, in
// `features/databank` (the write lives where the authority lives).
//
// FRESHNESS SPLITS ON WHETHER THE SERVER EMITS (the mutation-vs-bus rule, data/invalidation.ts). All three
// verbs emit now, so all three are `busDriven` — adding `invalidates` beside one would be the
// double-invalidate storm the factory's XOR exists to make impossible:
//   • attach/detach emit `databankChanged` (event-bus coverage survey H3, 2026-08-14 — until then they were
//     genuinely silent, which is why this header used to say so and why they named their reads by hand).
//     The map row path-invalidates the `databank` root, covering BOTH reads the old lists named: the rack's
//     `listActiveForChat` and the document's reverse-index `listAttachments`.
//     ONE HONEST LIMIT, unchanged by this lane: a user-bus event reaches the ACTING HOST's channel only, so
//     a second participant's rack does not repaint on the host's attach. That half is member-visible state
//     and belongs to a roster fan on the CHAT bus, never a user-bus widening (`membership-fan-guard`); it
//     was not covered before either — the old `invalidates` reconciled exactly one tab, the writer's.
//   • setChatDocumentVisibility EMITS `chatUpdated`, whose `BUS_FILTERS` arm carries
//     `databank.listActiveForChat` — the roster-visible plane, and the reason that verb was already the
//     busDriven one here.

import type { ChatDocumentVisibility } from "@orb/contracts/databank";
import type { ChatId, DocumentId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** The rack's own read — the chat's ACTIVE document union (D85), host-flagged. */
type ActiveChatDocuments = inferOutput<Trpc["databank"]["listActiveForChat"]>;

/** `databank.attachToChat` / `detachFromChat` vars — the document and the room. Host-gated INSIDE the verb. */
interface ChatDocumentAttachVars {
  readonly documentId: DocumentId;
  readonly chatId: ChatId;
}

export const useAttachDocumentToChat = createEntityMutation<ChatDocumentAttachVars, unknown>({
  options: (trpc) => trpc.databank.attachToChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't add the document to this chat.",
});

export const useDetachDocumentFromChat = createEntityMutation<ChatDocumentAttachVars, unknown>({
  options: (trpc) => trpc.databank.detachFromChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't remove the document from this chat.",
});

/** `chat.setChatDocumentVisibility` vars (D85) — the WHOLE excluded-document set for the room (the verb
 *  REPLACES it; `nextHiddenSet` builds it) + the target chat. Host-gated INSIDE the verb. */
interface SetChatDocumentVisibilityVars {
  readonly chatId: ChatId;
  readonly visibility: ChatDocumentVisibility;
}

export const useSetChatDocumentVisibility = createEntityMutation<SetChatDocumentVisibilityVars, unknown, ActiveChatDocuments>({
  options: (trpc) => trpc.chat.setChatDocumentVisibility.mutationOptions(),
  // OPTIMISTIC: the eye is a DISCRETE-write control outside an autosave form (no local field state
  // re-seeds it), so the row must repaint before the round trip — the `setChatBackground` precedent. The
  // patch re-derives every row's `hidden` from the written SET, which is the same total the server stores,
  // so a stale row cannot survive the write.
  optimistic: {
    readKey: (trpc, vars) => trpc.databank.listActiveForChat.queryKey({ chatId: vars.chatId }),
    update: (old, vars) => old?.map((row) => ({ ...row, hidden: vars.visibility.hidden.includes(row.id) })),
  },
  // `busDriven` on the OPEN chat: the verb emits `chatUpdated`, whose `BUS_FILTERS` arm now carries
  // `databank.listActiveForChat` — that echo is the reconciliation of the optimistic write above, and it
  // is also what repaints a SECOND host device sitting in the same room.
  busDriven: true,
  errorToast: "Couldn't change what this chat retrieves.",
});
