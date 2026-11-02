import type { ChatId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

// The router may infer this id as a bare string: without a passing assert the brand must stay.
export const useTouch = createEntityMutation<{ readonly chatId: ChatId }, void>({
  options: (trpc) => trpc.thing.touch.mutationOptions(),
  invalidates: () => [],
});
