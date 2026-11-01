import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "./trpc.ts";
import { createEntityMutation } from "./create-entity-mutation.ts";

export const useSend = createEntityMutation<inferInput<Trpc["chat"]["send"]>, unknown>({
  options: (trpc) => trpc.chat.send.mutationOptions(),
});

