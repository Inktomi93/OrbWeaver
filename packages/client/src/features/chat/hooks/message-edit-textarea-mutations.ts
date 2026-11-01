import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useEditMessageMutation = createEntityMutation<inferInput<Trpc["chat"]["editMessage"]>, unknown>({
  options: (trpc) => trpc.chat.editMessage.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save that edit.",
});
