import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useEditReasoningMutation = createEntityMutation<inferInput<Trpc["chat"]["editReasoning"]>, unknown>({
  options: (trpc) => trpc.chat.editReasoning.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save that reasoning.",
});

export const useClearReasoningMutation = createEntityMutation<inferInput<Trpc["chat"]["clearReasoning"]>, unknown>({
  options: (trpc) => trpc.chat.clearReasoning.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't clear that reasoning.",
});
