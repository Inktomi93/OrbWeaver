import type { inferInput } from "@trpc/tanstack-react-query";
import type { EntityMutateAsync, Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";

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

type UpdateTitleVars = inferInput<Trpc["chat"]["updateTitle"]>;

export const useUpdateChatTitle = createEntityMutation<inferInput<Trpc["chat"]["updateTitle"]>, unknown>({
  options: (trpc) => trpc.chat.updateTitle.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't rename the chat.",
});

type StarChatVars = inferInput<Trpc["chat"]["star"]>;

const useStarChat = createEntityMutation<inferInput<Trpc["chat"]["star"]>, unknown>({
  options: (trpc) => trpc.chat.star.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the star.",
});

type ArchiveChatVars = inferInput<Trpc["chat"]["archive"]>;

const useArchiveChat = createEntityMutation<inferInput<Trpc["chat"]["archive"]>, unknown>({
  options: (trpc) => trpc.chat.archive.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't archive the chat.",
});

type DeleteChatVars = inferInput<Trpc["chat"]["delete"]>;

export const useDeleteChat = createEntityMutation<inferInput<Trpc["chat"]["delete"]>, unknown>({
  options: (trpc) => trpc.chat.delete.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the chat.",
});

export interface ChatListRowActions {
  readonly updateTitle: (vars: UpdateTitleVars) => void;
  readonly star: (vars: StarChatVars) => void;
  readonly archive: (vars: ArchiveChatVars) => void;
  readonly remove: EntityMutateAsync<DeleteChatVars, unknown>;
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

// The #40 GAME front-door mutations — the ⋯ menu's start/stop rides the rpg procs DIRECTLY
// (lockdown §12 — a feature rides another domain's tRPC procedure directly, never its client; the rpg
// feature's own direct `trpc.chat.listMessages` read, `rpg-choice-echo.tsx`, is the live precedent). Both
// repaint `chat.getChat` (the pointer MIRROR the takeover gate + this menu read) AND `chat.listChats`:
// the LIST row renders the same fact from a different read (`isGame`/`gamePaused`, derived server-side off
// the same pointer), so leaving it out left the ⚔ marker claiming "Game chat" for the rest of the session
// while the room's own pane said otherwise — measured at t+0 and t+2000 ms (#863 P2). A mutation's
// invalidation set is a UX surface: it must name EVERY read that renders the toggled fact.
export const useStartGame = createEntityMutation<inferInput<Trpc["rpg"]["createGame"]>, unknown>({
  options: (trpc) => trpc.rpg.createGame.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId }), trpc.chat.listChats.queryFilter()],
  errorToast: "Couldn't start the game.",
});

export const useSetGameEngaged = createEntityMutation<inferInput<Trpc["rpg"]["updateConfig"]>, unknown>({
  options: (trpc) => trpc.rpg.updateConfig.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId }), trpc.chat.listChats.queryFilter()],
  errorToast: "Couldn't switch the game.",
});

/** Sweep the caller's OWN expired temp chats. `busDriven: false` with an explicit filter: the verb emits
 *  no bus event (it deletes rows nothing was showing), so the chats list reconciles from here.
 *
 *  RECONCILE ONLY WHAT THE SWEEP ACTUALLY CHANGED (issue #188 P2-12). The filter used to be
 *  unconditional, so every home landing paid a second full `chat.listChats` round-trip — inside the boot
 *  window, holding `data-app-ready` open — to re-read a list the server had just reported unaffected. The
 *  common answer is `{reaped: 0}` (a user with no expired temp room), and zero rows deleted is zero rows
 *  the list can be showing. A throw still reconciles: `undefined` is not evidence of a no-op. */
export const useReapTemporaryChats = createEntityMutation<void, { readonly reaped: number }>({
  options: (trpc: Trpc) => trpc.chat.reapTemporaryChats.mutationOptions(),
  invalidates: (trpc: Trpc, _vars, data: { readonly reaped: number } | undefined) =>
    data !== undefined && data.reaped === 0 ? [] : [trpc.chat.listChats.pathFilter()],
  backgroundFailure: "tempChatSweep",
});
