// The chat-LIST row write verbs (J5 — the per-row kebab: rename · star · archive · delete), each a
// module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a call site never hand-rolls
// `useMutation` + cache surgery). All four are HOST-only server-side (the verb's `requireHost`); the row
// menu shows them for every chat (ChatSummary carries no viewer-role field to gate on — a non-host's
// action error-toasts). TODO(server): add the viewer's role to `ChatSummary` to hide host-only actions.
//
// INVALIDATION (PD user-bus lane — busDriven, audit table below): all four verbs emit `chatsChanged` with
// the acting user's `userId` AFTER their durable write, and `USER_BUS_FILTERS.chatsChanged` invalidates
// `listChats` + the changed chat's `getChat` (data/invalidation.ts). That user-bus subscription is ALWAYS on
// (mounted at home-page.tsx), so the echo reconciles the acting device itself — a self-invalidate here would
// DOUBLE-refetch the same keys (the storm the busDriven rule kills). Hence all four are `busDriven` (a
// re-added `invalidates` is now a compile error). This ALSO closes the former gap the old header lamented
// ("a row you act on may not be the actively-subscribed chat, so no live event invalidates it") — the user
// bus reaches the LIST + `getChat` for any owned chat, subscribed or not, on THIS device and device B.
//   verb          user-bus event   client filters (USER_BUS_FILTERS.chatsChanged)
//   updateTitle    chatsChanged     listChats.path + getChat({chatId})
//   star           chatsChanged     listChats.path + getChat({chatId})   (+ optimistic flip, below)
//   archive        chatsChanged     listChats.path + getChat({chatId})
//   delete         chatsChanged     listChats.path + getChat({chatId})
//
// STAR is additionally OPTIMISTIC (the frequent, cheap toggle — instant flip, §4.3 rule 7): it patches
// the `listChats` cache in `onMutate` and rolls back on error. Rename/archive/delete are settle-only (the
// bus echo refetch is a fine first pass; no array-splice rollback to get wrong).

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
  busDriven: true, // emits `chatsChanged` → USER_BUS_FILTERS covers listChats + getChat.
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
  busDriven: true, // emits `chatsChanged` → USER_BUS_FILTERS covers listChats + getChat.
  errorToast: "Couldn't update the star.",
});

/** `chat.archive` vars — the host-only archive toggle. */
interface ArchiveChatVars {
  readonly chatId: ChatId;
  readonly archived: boolean;
}

export const useArchiveChat = createEntityMutation<ArchiveChatVars, unknown>({
  options: (trpc) => trpc.chat.archive.mutationOptions(),
  busDriven: true, // emits `chatsChanged` → USER_BUS_FILTERS covers listChats + getChat.
  errorToast: "Couldn't archive the chat.",
});

/** `chat.delete` vars — the host-only delete (cascades messages/roster/etc.). */
interface DeleteChatVars {
  readonly chatId: ChatId;
}

export const useDeleteChat = createEntityMutation<DeleteChatVars, unknown>({
  options: (trpc) => trpc.chat.delete.mutationOptions(),
  busDriven: true, // emits `chatsChanged` → USER_BUS_FILTERS covers listChats + getChat.
  errorToast: "Couldn't delete the chat.",
});
