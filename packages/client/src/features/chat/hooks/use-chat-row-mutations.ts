// The chat-list row write verbs (the per-row kebab: rename/star/archive/delete). All four are host-only
// server-side; ChatSummary carries no viewer-role field to gate on, so a non-host's action error-toasts.
// TODO(server): add the viewer's role to ChatSummary to hide host-only actions. All four are busDriven —
// the always-on user-bus subscription reconciles the acting device itself, so a self-invalidate here
// would double-refetch.
//
// STAR LOST ITS OPTIMISTIC PATCH (2026-08-09), deliberately. It used to write straight into
// `listChats.queryKey({})` — ONE key holding ONE flat array. `listChats` is keyset-paged now, so the read is
// an `InfiniteData<ChatListPage>` under a FAMILY of keys (one per limit / characterId / search the surfaces
// ask with), and `createEntityMutation.optimistic` addresses exactly one exact key. Patching a single guessed
// member of that family would leave every other mounted list showing the old star — a cache lie that looks
// like a sync bug — so the toggle now repaints on its bus tick like its three siblings. The real fix is a
// FILTER-flavored optimistic mode on the factory (`setQueriesData` over a pathFilter, snapshotting each
// matched key for rollback); that is a change to the shared `data/` machine, not to this row.

import type { ChatId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

interface UpdateTitleVars {
  readonly chatId: ChatId;
  readonly title: string | null;
}

export const useUpdateChatTitle = createEntityMutation<UpdateTitleVars, unknown>({
  options: (trpc) => trpc.chat.updateTitle.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't rename the chat.",
});

interface StarChatVars {
  readonly chatId: ChatId;
  readonly star: boolean;
}

export const useStarChat = createEntityMutation<StarChatVars, unknown>({
  options: (trpc) => trpc.chat.star.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the star.",
});

interface ArchiveChatVars {
  readonly chatId: ChatId;
  readonly archived: boolean;
}

export const useArchiveChat = createEntityMutation<ArchiveChatVars, unknown>({
  options: (trpc) => trpc.chat.archive.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't archive the chat.",
});

interface DeleteChatVars {
  readonly chatId: ChatId;
}

export const useDeleteChat = createEntityMutation<DeleteChatVars, unknown>({
  options: (trpc) => trpc.chat.delete.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the chat.",
});
