import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

// Module-scope factory (§13.1) — BUS-DRIVEN: `deleteMessages` emits messagesDeleted (→ chatReads) on the
// OPEN chat, delivered by the active subscription → the seam refetches. `busDriven`; the removed
// keys were a redundant backstop (the mutation-vs-bus rule, invalidation.ts).
export const useDeleteMessages = createEntityMutation<inferInput<Trpc["chat"]["deleteMessages"]>, unknown>({
  options: (trpc) => trpc.chat.deleteMessages.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the selected messages.",
});
