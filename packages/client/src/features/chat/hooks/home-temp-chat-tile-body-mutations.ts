import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Sweep the caller's OWN expired temp chats. `busDriven: false` with an explicit filter: the verb emits
 *  no bus event (it deletes rows nothing was showing), so the chats list reconciles from here.
 *
 *  RECONCILE ONLY WHAT THE SWEEP ACTUALLY CHANGED (issue #188 P2-12). The filter used to be
 *  unconditional, so every home landing paid a second full `chat.listChats` round-trip — inside the boot
 *  window, holding `data-app-ready` open — to re-read a list the server had just reported unaffected. The
 *  common answer is `{reaped: 0}` (a user with no expired temp room), and zero rows deleted is zero rows
 *  the list can be showing. A throw still reconciles: `undefined` is not evidence of a no-op. */
export const useReapTemporaryChats = createEntityMutation<void, { readonly reaped: number }>({
  options: (trpc: Trpc) => trpc.chat.reapTemporaryChats.mutationOptions(),
  invalidates: (trpc: Trpc, _vars, data: { readonly reaped: number } | undefined) =>
    data !== undefined && data.reaped === 0 ? [] : [trpc.chat.listChats.pathFilter()],
});
