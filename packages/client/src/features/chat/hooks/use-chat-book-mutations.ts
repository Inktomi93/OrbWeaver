// The per-chat WORLD BOOKS rack's two write verbs, each a module-scope `createEntityMutation` (§13.1 — the ONE
// mutation home). Both carry HOST authority over the ROOM: `worldInfo.attachToChat` gates on the injected
// `requireChatHost` AND on the caller owning the book (a host shares THEIR book); `detachFromChat` gates on
// host alone and deliberately does NOT re-check ownership, so a host can clean a room a previous host left a
// book in. The OWNER-authority half — where else this book fires (global / character / persona) — is not
// here: it lives on the book, in `features/world-info` (the write lives where the authority lives).
//
// `busDriven`, never `invalidates` (the mutation-vs-bus XOR, data/invalidation.ts). Both verbs emit:
//   • `worldInfoChanged` on the USER bus → `trpc.worldInfo.pathFilter()`, which covers this rack's own
//     `listForChat` read and the book library's rows (the persona-lorebook precedent).
//   • `wiBookAttached` / `wiBookDetached` on the CHAT bus → the same worldInfo path plus `chat.getChat` and
//     the prompt-preview reads, which is what repaints a SECOND member sitting in this room.
// Adding `invalidates` beside either would be the double-invalidate storm the factory's XOR exists to
// make impossible.

import type { ChatId, WorldBookId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

/** `worldInfo.attachToChat` / `detachFromChat` vars — the book and the room. Host-gated INSIDE the verb. */
interface ChatBookAttachVars {
  readonly bookId: WorldBookId;
  readonly chatId: ChatId;
}

export const useAttachBookToChat = createEntityMutation<ChatBookAttachVars, unknown>({
  options: (trpc) => trpc.worldInfo.attachToChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach the world book to this chat.",
});

export const useDetachBookFromChat = createEntityMutation<ChatBookAttachVars, unknown>({
  options: (trpc) => trpc.worldInfo.detachFromChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't remove the world book from this chat.",
});
