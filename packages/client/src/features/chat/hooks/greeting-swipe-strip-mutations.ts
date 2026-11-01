import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

// busDriven: in-place steps emit `messageEdited`; preserved prose emits `variantSelected`. Both invalidate canon —
// the row re-renders from the SERVER's bytes, never from an optimistic local swap (the card is the source of
// truth for what an alternate says, and it may have been edited since the seed).
export const useSetSeededGreeting = createEntityMutation<inferInput<Trpc["chat"]["setSeededGreeting"]>, unknown>({
  options: (trpc) => trpc.chat.setSeededGreeting.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch to that greeting.",
});
