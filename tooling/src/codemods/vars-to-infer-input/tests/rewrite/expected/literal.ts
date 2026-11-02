import { createEntityMutation } from "#data";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

export const useTouch = createEntityMutation<inferInput<Trpc["thing"]["touch"]>, void>({
  options: (trpc) => trpc.thing.touch.mutationOptions(),
  invalidates: () => [],
});

export const useOther = createEntityMutation<{ readonly other: string }, void>({
  options: (trpc) => trpc.thing.other.mutationOptions(),
  invalidates: () => [],
});
