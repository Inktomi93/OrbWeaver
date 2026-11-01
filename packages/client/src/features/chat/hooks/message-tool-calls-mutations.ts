import type { MessageView } from "@orb/contracts/chat";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useEditToolCall = createEntityMutation<inferInput<Trpc["chat"]["editToolCall"]>, MessageView>({
  options: (trpc) => trpc.chat.editToolCall.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update that tool call.",
});
