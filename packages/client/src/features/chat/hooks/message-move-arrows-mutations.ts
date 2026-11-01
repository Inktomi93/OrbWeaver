import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";
import { MESSAGE_MOVE_FAILED } from "../lib/message-action-names.ts";

export const useMoveMessageMutation = createEntityMutation<inferInput<Trpc["chat"]["moveMessage"]>, unknown>({
  options: (trpc) => trpc.chat.moveMessage.mutationOptions(),
  busDriven: true,
  errorToast: MESSAGE_MOVE_FAILED,
});
