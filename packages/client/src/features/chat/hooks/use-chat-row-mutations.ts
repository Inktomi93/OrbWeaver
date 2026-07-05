// The chat-LIST row write verbs (J5 — the per-row kebab: rename · star · archive · delete), each a
// module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a call site never hand-rolls
// `useMutation` + cache surgery). All four are HOST-only server-side (the verb's `requireHost`); the row
// menu shows them for every chat (ChatSummary carries no viewer-role field to gate on — a non-host's
// action error-toasts). TODO(server): add the viewer's role to `ChatSummary` to hide host-only actions.
//
// INVALIDATION: all four route settle-invalidation through the central seam — they refetch the room read
// + the list (recency/preview/flags all move on a row change), mirroring the bus seam's own `chatReads`.
// This is NECESSARY here (not redundant with the SSE bus): a row you act on may not be the actively-
// subscribed chat, so no live event invalidates it for you.
//
// STAR is additionally OPTIMISTIC (the frequent, cheap toggle — instant flip, §4.3 rule 7): it patches
// the `listChats` cache in `onMutate` and rolls back on error. Rename/archive/delete are settle-only (the
// invalidate refetch is a fine first pass; no array-splice rollback to get wrong).

import type { ChatId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type ChatSummaryList = inferOutput<Trpc["chat"]["listChats"]>;

/** `chat.updateTitle` vars — the host-only rename (null clears the title). */
interface UpdateTitleVars {
  readonly chatId: ChatId;
  readonly title: string | null;
}

export const useUpdateChatTitle = createEntityMutation<UpdateTitleVars, unknown>({
  options: (trpc) => trpc.chat.updateTitle.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listChats.pathFilter(),
  ],
  errorToast: "Couldn't rename the chat.",
});

/** `chat.star` vars — the host-only star toggle. Optimistic: flip the row's `star` in the list cache. */
interface StarChatVars {
  readonly chatId: ChatId;
  readonly star: boolean;
}

export const useStarChat = createEntityMutation<StarChatVars, unknown, ChatSummaryList>({
  options: (trpc) => trpc.chat.star.mutationOptions(),
  optimistic: {
    // The Chats-LIST surface reads `listChats.queryOptions({})` — patch that exact cache entry.
    readKey: (trpc) => trpc.chat.listChats.queryKey({}),
    update: (old, vars) =>
      old?.map((chat) => (chat.id === vars.chatId ? { ...chat, star: vars.star } : chat)),
  },
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listChats.pathFilter(),
  ],
  errorToast: "Couldn't update the star.",
});

/** `chat.archive` vars — the host-only archive toggle. */
interface ArchiveChatVars {
  readonly chatId: ChatId;
  readonly archived: boolean;
}

export const useArchiveChat = createEntityMutation<ArchiveChatVars, unknown>({
  options: (trpc) => trpc.chat.archive.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listChats.pathFilter(),
  ],
  errorToast: "Couldn't archive the chat.",
});

/** `chat.delete` vars — the host-only delete (cascades messages/roster/etc.). */
interface DeleteChatVars {
  readonly chatId: ChatId;
}

export const useDeleteChat = createEntityMutation<DeleteChatVars, unknown>({
  options: (trpc) => trpc.chat.delete.mutationOptions(),
  invalidates: (trpc) => [trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't delete the chat.",
});
