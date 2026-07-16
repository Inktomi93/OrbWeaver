// The chat-list row write verbs (the per-row kebab: rename/star/archive/delete). All four are host-only
// server-side; ChatSummary carries no viewer-role field to gate on, so a non-host's action error-toasts.
// TODO(server): add the viewer's role to ChatSummary to hide host-only actions. All four are busDriven —
// the always-on user-bus subscription reconciles the acting device itself, so a self-invalidate here
// would double-refetch. Star is additionally optimistic (frequent, cheap toggle).

import type { ChatId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type ChatSummaryList = inferOutput<Trpc["chat"]["listChats"]>;

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

export const useStarChat = createEntityMutation<StarChatVars, unknown, ChatSummaryList>({
  options: (trpc) => trpc.chat.star.mutationOptions(),
  optimistic: {
    readKey: (trpc) => trpc.chat.listChats.queryKey({}),
    update: (old, vars) => old?.map((chat) => (chat.id === vars.chatId ? { ...chat, star: vars.star } : chat)),
  },
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
