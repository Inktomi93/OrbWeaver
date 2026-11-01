import { createEntityMutation } from "#data";

interface HandVars {
  readonly id: string;
}

export const useHand = createEntityMutation<HandVars, unknown>({
  options: (trpc) => trpc.chat.hand.mutationOptions(),
});

