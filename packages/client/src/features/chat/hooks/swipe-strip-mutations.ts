import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";
import { turnMutationToast } from "#lib";

// The ONE turn-error mapper (`lib/turn-abort-notice.ts`), not a bare string: a swipe refused for CONTENTION
// (`locked` — another turn holds this room) is the one turn failure the reader can act on, and the bare
// fallback hid it behind "Couldn't generate that swipe" while the old variant sat there with no ghost.
export const useSwipeMutation = createEntityMutation<inferInput<Trpc["chat"]["swipe"]>, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, "Couldn't generate that swipe."),
});
