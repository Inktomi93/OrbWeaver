import { createEntityMutation } from "#data";

interface HandVars {
  readonly id: string;
}

export const useHand = createEntityMutation<HandVars, unknown>({
  options: (trpc) => trpc.chat.hand.mutationOptions(),
});

// vars-to-infer-input:assert
export const __varsEquality0: (<T>() => T extends HandVars ? 1 : 2) extends <T>() => T extends import("@trpc/tanstack-react-query").inferInput<import("#data").Trpc["chat"]["hand"]> ? 1 : 2 ? true : false = true;
