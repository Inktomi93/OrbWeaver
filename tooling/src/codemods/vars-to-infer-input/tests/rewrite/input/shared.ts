import { createEntityMutation } from "#data";

// One literal, two procedures: only the procedure the plan proved may change.
export const useTouch = createEntityMutation<{ readonly id: string }, void>({
  options: (trpc) => trpc.thing.touch.mutationOptions(),
  invalidates: () => [],
});

export const useDrop = createEntityMutation<{ readonly id: string }, void>({
  options: (trpc) => trpc.thing.drop.mutationOptions(),
  invalidates: () => [],
});
