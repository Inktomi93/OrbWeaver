import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "./trpc.ts";
import { createEntityMutation } from "./create-entity-mutation.ts";

type SendVars = inferInput<Trpc["chat"]["send"]>;

export const useSend = createEntityMutation<SendVars, unknown>({
  options: (trpc) => trpc.chat.send.mutationOptions(),
});

// vars-to-infer-input:assert
export const __varsEquality0: (<T>() => T extends SendVars ? 1 : 2) extends <T>() => T extends import("@trpc/tanstack-react-query").inferInput<import("#data").Trpc["chat"]["send"]> ? 1 : 2 ? true : false = true;
