import type { ForkResult } from "@orb/contracts/chat";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useHideMutation = createEntityMutation<inferInput<Trpc["chat"]["setMessageHidden"]>, unknown>({
  options: (trpc) => trpc.chat.setMessageHidden.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't change that message's visibility.",
});

export const useDeleteMutation = createEntityMutation<inferInput<Trpc["chat"]["deleteMessages"]>, unknown>({
  options: (trpc) => trpc.chat.deleteMessages.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete that message.",
});

export const useForkMutation = createEntityMutation<inferInput<Trpc["chat"]["forkChat"]>, ForkResult>({
  options: (trpc) => trpc.chat.forkChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't fork this chat.",
});

// Undo/revert the last continuation on THIS reply's shown swipe (F2). Bus-driven like the other row
// mutations — the verb emits `messageCommitted`, the surface refetches; no manual cache write here.
export const useUndoContinueMutation = createEntityMutation<inferInput<Trpc["chat"]["undoContinue"]>, unknown>({
  options: (trpc) => trpc.chat.undoContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't undo the continuation.",
});

export const useRevertContinueMutation = createEntityMutation<inferInput<Trpc["chat"]["revertContinue"]>, unknown>({
  options: (trpc) => trpc.chat.revertContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't re-apply the continuation.",
});
