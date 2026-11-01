import { createEntityMutation } from "#data";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

export const usePin = createEntityMutation<inferInput<Trpc["chat"]["pin"]>, unknown>({
  options: (trpc) => trpc.chat.pin.mutationOptions(),
});
