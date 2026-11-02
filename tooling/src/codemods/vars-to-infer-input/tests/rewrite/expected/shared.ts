import { createEntityMutation } from "#data";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

// One literal, two procedures: only the procedure the plan proved may change.
export const useTouch = createEntityMutation<inferInput<Trpc["thing"]["touch"]>, void>({
  options: (trpc) => trpc.thing.touch.mutationOptions(),
  invalidates: () => [],
});

export const useDrop = createEntityMutation<{ readonly id: string }, void>({
  options: (trpc) => trpc.thing.drop.mutationOptions(),
  invalidates: () => [],
});
