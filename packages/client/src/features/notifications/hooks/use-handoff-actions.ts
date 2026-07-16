// The nominee's handoff-accept action: Accept on a `handoff-nominated` inbox row rides
// invites.acceptHostHandoff (a self-action, only the pending nominee passes the check). No decline verb
// by design — a nomination is host-retractable, not invitee-settleable; the row's other affordance is a
// plain Dismiss. The verb's chatUpdated bus emission only reaches a nominee with that room open, so the
// room detail + list are this mutation's own keys to reconcile.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useAcceptHostHandoff = createEntityMutation<inferInput<Trpc["invites"]["acceptHostHandoff"]>, inferOutput<Trpc["invites"]["acceptHostHandoff"]>>({
  options: (trpc) => trpc.invites.acceptHostHandoff.mutationOptions(),
  invalidates: (trpc) => [trpc.chat.getChat.pathFilter(), trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't accept the host handoff — it may have been withdrawn.",
});
