import { createEntityMutation } from "#data";

export const useTouch = createEntityMutation<{ readonly id: string }, void>({
  options: (trpc) => trpc.thing.touch.mutationOptions(),
  invalidates: () => [],
});

export const useOther = createEntityMutation<{ readonly other: string }, void>({
  options: (trpc) => trpc.thing.other.mutationOptions(),
  invalidates: () => [],
});
