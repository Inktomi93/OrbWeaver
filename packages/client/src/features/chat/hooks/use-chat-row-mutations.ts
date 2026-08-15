// The chat-list row write verbs (the per-row kebab: rename/star/archive/delete). All four are host-only
// server-side; ChatSummary's viewerRole hides them from non-host rows. All four are busDriven —
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
import { createEntityMutation, useInvalidation, useTRPC } from "#data";

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
  readonly starred: boolean;
}

const useStarChat = createEntityMutation<StarChatVars, unknown>({
  options: (trpc) => trpc.chat.star.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the star.",
});

interface ArchiveChatVars {
  readonly chatId: ChatId;
  readonly archived: boolean;
}

const useArchiveChat = createEntityMutation<ArchiveChatVars, unknown>({
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

export interface ChatListRowActions {
  readonly updateTitle: (vars: UpdateTitleVars) => void;
  readonly star: (vars: StarChatVars) => void;
  readonly archive: (vars: ArchiveChatVars) => void;
  readonly remove: (vars: DeleteChatVars) => Promise<unknown>;
}

/** One mutation pack per mounted list, not one pack per virtual row. A viewport can mount fifteen rows;
 *  giving every row five React Query mutation observers made the skeleton→list commit cross the dev
 *  profiler budget even though only one row can be acted on at a time. */
export function useChatListRowActions(): ChatListRowActions {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTitle = useUpdateChatTitle({ trpc, invalidation });
  const star = useStarChat({ trpc, invalidation });
  const archive = useArchiveChat({ trpc, invalidation });
  const remove = useDeleteChat({ trpc, invalidation });
  return {
    updateTitle: updateTitle.mutate,
    star: star.mutate,
    archive: archive.mutate,
    remove: remove.mutateAsync,
  };
}
